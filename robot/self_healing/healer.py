"""The self-healing locator engine for Selenium WebDriver.

Resolution order for every lookup (the same as the Playwright healer):
  1. the primary selector matches  -> record/refresh the baseline fingerprint, use it;
  2. a healed selector is cached for this page URL and still looks right -> reuse it;
  3. otherwise scan the page and pick the element most similar to the stored baseline.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone, UTC
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from selenium.common.exceptions import (
    JavascriptException,
    StaleElementReferenceException,
)
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from .scoring import (
    Fingerprint,
    PickOptions,
    Ranked,
    ScoreOptions,
    pick_best,
    rank_candidates,
)
from .store import ElementStore

_SCRIPT = (Path(__file__).with_name("fingerprint.js")).read_text(encoding="utf-8")
_CALL_SCRIPT = f"return ({_SCRIPT})(arguments[0], arguments[1]);"

RESCAN_INTERVAL = 0.2
POLL_INTERVAL = 0.1
REPORTED_CANDIDATES = 3
# Elements re-rendered between finding and fingerprinting them are retried this often.
STALE_RETRIES = 3


@dataclass(frozen=True)
class HealerSettings:
    """Timeouts are in seconds."""

    threshold: float = 0.6
    """Similarity score (0..1) at which a candidate is always accepted."""
    min_score: float = 0.45
    """Lowest score accepted when the winner leads the runner-up by at least `min_margin`."""
    min_margin: float = 0.1
    primary_timeout: float = 1.5
    """How long to wait for the primary selector before trying to heal."""
    heal_timeout: float = 3.0
    """How long to keep re-scanning the page for a healing candidate."""
    max_candidates: int = 3000
    update_baseline_on_heal: bool = False
    """Replace the stored fingerprint with the healed element's (learn the new UI)."""


@dataclass(frozen=True)
class LocateSpec:
    key: str
    """Stable logical name of the element within the page, e.g. "username" or "row.actions"."""
    selector: str
    """The selector written by the test author (works on the baseline UI): CSS, or XPath with an `xpath:` prefix."""
    scope: WebElement | None = None
    """Restrict lookup and healing to this container (e.g. a single table row)."""
    dynamic_text: bool = False
    """The element's text changes between runs (e.g. metric values): rely on its labels instead."""
    ignore_content: bool = False
    """Text and surroundings are pure data (set automatically by `locate_all`): compare structure only."""

    @property
    def score_options(self) -> ScoreOptions:
        return ScoreOptions(dynamic_text=self.dynamic_text, ignore_content=self.ignore_content)


@dataclass(frozen=True)
class HealEvent:
    page_id: str
    element_key: str
    original_selector: str
    healed_selector: str
    score: float
    breakdown: dict[str, float]
    url: str
    from_cache: bool
    """True when a previously healed selector was reused instead of re-scanning the page."""

    def to_json(self) -> dict[str, Any]:
        """camelCase, like the Playwright framework's `self-healing.json` attachment."""
        camel = lambda name: re.sub(r"_([a-z])", lambda m: m.group(1).upper(), name)  # noqa: E731
        return {camel(k): v for k, v in asdict(self).items()}

    def describe(self) -> str:
        cached = ", cached" if self.from_cache else ""
        return f'{self.page_id}.{self.element_key}: "{self.original_selector}" -> "{self.healed_selector}" (score {self.score}{cached})'


class HealingError(AssertionError):
    """Raised when a selector is broken and cannot be healed (an AssertionError, so tests fail rather than error)."""


def _label(page_id: str, spec: LocateSpec) -> str:
    return f"[self-healing] {page_id}.{spec.key}"


def _missing_baseline(page_id: str, spec: LocateSpec) -> HealingError:
    return HealingError(
        f'{_label(page_id, spec)}: selector "{spec.selector}" matched nothing and there is no baseline fingerprint '
        "to heal from. Run the test once against a known-good UI to record one."
    )


def _heal_failed(page_id: str, spec: LocateSpec, threshold: float, top: list[Ranked]) -> HealingError:
    def line(c: Ranked) -> str:
        return f"  {c.score:.3f} {c.selector} {json.dumps({k: round(v, 2) for k, v in c.breakdown.items()})}"

    detail = (
        f"No candidate reached the threshold {threshold}. Top candidates:\n" + "\n".join(map(line, top))
        if top
        else "No candidates found."
    )
    return HealingError(f'{_label(page_id, spec)}: could not heal selector "{spec.selector}". {detail}')


def sibling_group(selector: str) -> str:
    """Sibling items share a selector up to their final `:nth-of-type(n)`."""
    return re.sub(r":nth-of-type\(\d+\)$", "", selector)


def to_locator(selector: str, scoped: bool) -> tuple[str, str]:
    """Maps a selector to a Selenium (By, value) pair. XPath inside a scope is made relative to it."""
    if selector.startswith("css:"):
        return By.CSS_SELECTOR, selector[4:]
    if selector.startswith(("xpath:", "//", "(")):
        xpath = selector.removeprefix("xpath:")
        return By.XPATH, f".{xpath}" if scoped and xpath.startswith("/") else xpath
    return By.CSS_SELECTOR, selector


class Healer:
    """Holds the store, the settings and the cache of healed selectors.

    Healed selectors are cached per healer, so share one healer for a whole run and call `for_page`
    from each page object.
    """

    def __init__(self, store: ElementStore, settings: HealerSettings | None = None,
                 on_heal: Callable[[HealEvent], None] | None = None) -> None:
        self.store = store
        self.settings = settings or HealerSettings()
        self.on_heal = on_heal
        self.healed_selectors: dict[tuple, str] = {}
        self._last_saved: dict[tuple[str, str], str] = {}

    def for_page(self, driver: WebDriver, page_id: str) -> PageHealer:
        return PageHealer(self, driver, page_id)

    def save_baseline(self, page_id: str, spec: LocateSpec, fingerprint: Fingerprint) -> None:
        """Writes the fingerprint unless it is unchanged since this healer last saved it."""
        serialised = json.dumps(fingerprint, sort_keys=True)
        if self._last_saved.get((page_id, spec.key)) == serialised:
            return
        self.store.put({
            "pageId": page_id,
            "elementKey": spec.key,
            "selector": spec.selector,
            "fingerprint": fingerprint,
            "updatedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        })
        self._last_saved[(page_id, spec.key)] = serialised

    def load_baseline(self, page_id: str, spec: LocateSpec) -> Fingerprint:
        record = self.store.get(page_id, spec.key)
        if not record:
            raise _missing_baseline(page_id, spec)
        return record["fingerprint"]


class PageHealer:
    """Resolves elements of one logical page (`page_id`) through the shared healer."""

    def __init__(self, healer: Healer, driver: WebDriver, page_id: str) -> None:
        self.healer = healer
        self.settings = healer.settings
        self.driver = driver
        self.page_id = page_id

    # -- public API -------------------------------------------------------------------------------

    def locate(self, spec: LocateSpec) -> WebElement:
        """Resolves a single element, healing the selector if it no longer matches."""
        return self._resolve(spec, collection=False)[0]

    def locate_all(self, spec: LocateSpec) -> list[WebElement]:
        """Resolves a collection (e.g. table rows); heals to the best match plus its similar siblings."""
        return self._resolve(replace(spec, ignore_content=True), collection=True)

    # -- browser access ---------------------------------------------------------------------------

    def _find_all(self, spec: LocateSpec, selector: str) -> list[WebElement]:
        by, value = to_locator(selector, scoped=spec.scope is not None)
        return (spec.scope or self.driver).find_elements(by, value)

    def _appears(self, spec: LocateSpec, selector: str, timeout: float) -> list[WebElement]:
        """Polls for up to `timeout` seconds until the selector matches; returns the matches (or [])."""
        deadline = time.monotonic() + timeout
        while True:
            found = self._find_all(spec, selector)
            if found or time.monotonic() >= deadline:
                return found
            time.sleep(POLL_INTERVAL)

    def _run(self, target: WebElement, request: dict[str, Any]) -> Any:
        return self.driver.execute_script(_CALL_SCRIPT, target, request)

    def _root(self, spec: LocateSpec) -> WebElement:
        return spec.scope or self.driver.execute_script("return document.documentElement")

    def _fingerprint_of(self, element: WebElement) -> Fingerprint:
        return self._run(element, {"mode": "fingerprint"})

    def _candidates_in(self, spec: LocateSpec) -> list[dict[str, Any]]:
        return self._run(self._root(spec), {"mode": "candidates", "maxCandidates": self.settings.max_candidates})

    def _group_selector_for(self, spec: LocateSpec, selector: str) -> str:
        return self._run(self._root(spec), {"mode": "groupSelector", "selector": selector})

    # -- resolution -------------------------------------------------------------------------------

    def _cache_key(self, spec: LocateSpec, collection: bool) -> tuple:
        url = urlsplit(self.driver.current_url)
        return (self.page_id, spec.key, spec.selector, collection, url.path, url.query)

    def _shape(self, elements: list[WebElement], collection: bool) -> list[WebElement]:
        return elements if collection else elements[:1]

    def _report(self, spec: LocateSpec, healed_selector: str, best: Ranked, from_cache: bool) -> None:
        if self.healer.on_heal:
            self.healer.on_heal(HealEvent(
                page_id=self.page_id,
                element_key=spec.key,
                original_selector=spec.selector,
                healed_selector=healed_selector,
                score=round(best.score, 3),
                breakdown=best.breakdown,
                url=self.driver.current_url,
                from_cache=from_cache,
            ))

    def _resolve(self, spec: LocateSpec, collection: bool) -> list[WebElement]:
        for attempt in range(STALE_RETRIES):
            try:
                return self._resolve_once(spec, collection)
            except (StaleElementReferenceException, JavascriptException):
                # The page re-rendered mid-lookup (React replaced the nodes); look again.
                if attempt == STALE_RETRIES - 1:
                    raise
        raise AssertionError("unreachable")

    def _resolve_once(self, spec: LocateSpec, collection: bool) -> list[WebElement]:
        known_broken = self._cache_key(spec, collection) in self.healer.healed_selectors
        primary = self._appears(spec, spec.selector, 0 if known_broken else self.settings.primary_timeout)
        if primary and not known_broken:
            self.healer.save_baseline(self.page_id, spec, self._fingerprint_of(primary[0]))
        if primary:
            return self._shape(primary, collection)
        return self._heal(spec, collection)

    def _reuse_cached_selector(self, spec: LocateSpec, collection: bool, baseline: Fingerprint) -> list[WebElement] | None:
        """A cached healed selector is reused only while it still points at a similar element."""
        cached = self.healer.healed_selectors.get(self._cache_key(spec, collection))
        if not cached:
            return None
        found = self._appears(spec, cached, self.settings.primary_timeout)
        if not found:
            return None
        [match] = rank_candidates(baseline, [{"selector": cached, "fingerprint": self._fingerprint_of(found[0])}], spec.score_options)
        if match.score < self.settings.min_score:
            return None
        self._report(spec, cached, match, from_cache=True)
        return found

    def _search(self, spec: LocateSpec, baseline: Fingerprint, collection: bool) -> Ranked:
        """Repeatedly scans for the candidate most similar to `baseline` until one is accepted or
        the heal timeout elapses (the element may still be rendering)."""
        s = self.settings
        pick = PickOptions(s.threshold, s.min_score, s.min_margin, sibling_group if collection else None)
        deadline = time.monotonic() + s.heal_timeout
        top: list[Ranked] = []
        while True:
            ranked = rank_candidates(baseline, self._candidates_in(spec), spec.score_options)
            best = pick_best(ranked, pick)
            if best:
                return best
            top = ranked[:REPORTED_CANDIDATES] or top
            if time.monotonic() >= deadline:
                raise _heal_failed(self.page_id, spec, s.threshold, top)
            time.sleep(RESCAN_INTERVAL)

    def _heal(self, spec: LocateSpec, collection: bool) -> list[WebElement]:
        baseline = self.healer.load_baseline(self.page_id, spec)

        reused = self._reuse_cached_selector(spec, collection, baseline)
        if reused:
            return self._shape(reused, collection)

        best = self._search(spec, baseline, collection)
        healed_selector = self._group_selector_for(spec, best.selector) if collection else best.selector
        self.healer.healed_selectors[self._cache_key(spec, collection)] = healed_selector
        if self.settings.update_baseline_on_heal:
            self.healer.save_baseline(self.page_id, spec, best.fingerprint)
        self._report(spec, healed_selector, best, from_cache=False)
        return self._shape(self._find_all(spec, healed_selector), collection)
