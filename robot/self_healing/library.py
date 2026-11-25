"""Robot Framework keywords for self-healing element lookup on top of SeleniumLibrary.

    Library    SeleniumLibrary
    Library    self_healing.SelfHealing    store_dir=${CURDIR}/.healing-store

    ${username}=    Heal Element    login    username    \\#username
    Input Text    ${username}    admin

The keywords return WebElements, so every SeleniumLibrary keyword accepts them as locators.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from robot.api import logger
from robot.api.deco import keyword, library
from robot.libraries.BuiltIn import BuiltIn
from selenium.webdriver.remote.webelement import WebElement

from .healer import Healer, HealerSettings, HealEvent, LocateSpec
from .store import FileSystemStore, store_from_env

HEALED_TAG = "self-healed"


@library(scope="GLOBAL", auto_keywords=False, listener="SELF")
class SelfHealing:
    """Self-healing locators for SeleniumLibrary.

    The primary selector (CSS, or XPath with an ``xpath:`` prefix) is tried first. While it works
    the element's fingerprint is stored as a baseline; once it breaks, the element most similar to
    that baseline is used instead and the heal is logged.

    Every test that healed gets the ``self-healed`` tag, and all heal events of the run are written
    to ``self-healing.json`` next to ``output.xml``.

    The store comes from ``store_dir`` when given, otherwise from the ``HEALING_STORE*`` environment
    variables (filesystem in ``.healing-store`` by default, ``remote`` or ``memory``).
    """

    ROBOT_LISTENER_API_VERSION = 3

    def __init__(self, store_dir: str | None = None, threshold: float = 0.6, min_score: float = 0.45,
                 min_margin: float = 0.1, primary_timeout: float = 1.5, heal_timeout: float = 3.0,
                 update_baseline_on_heal: bool = False) -> None:
        store = FileSystemStore(store_dir) if store_dir else store_from_env()
        settings = HealerSettings(threshold=float(threshold), min_score=float(min_score), min_margin=float(min_margin),
                                  primary_timeout=float(primary_timeout), heal_timeout=float(heal_timeout),
                                  update_baseline_on_heal=_as_bool(update_baseline_on_heal))
        self.healer = Healer(store, settings, on_heal=self._record)
        self._test_events: list[HealEvent] = []
        self._run_events: list[dict[str, Any]] = []
        self._current_test = ""

    # -- keywords ---------------------------------------------------------------------------------

    @keyword
    def heal_element(self, page: str, key: str, selector: str, scope: WebElement | None = None,
                     dynamic_text: bool = False) -> WebElement:
        """Returns the element for ``selector``, healing it from the baseline of ``page``.``key`` when broken.

        ``scope`` restricts the lookup to a container element (e.g. one table row).
        ``dynamic_text`` is for elements whose own text changes between runs (metric values):
        they are then recognised by their labels and the format of their value.
        """
        spec = LocateSpec(key, selector, scope=scope, dynamic_text=_as_bool(dynamic_text))
        return self._page(page).locate(spec)

    @keyword
    def heal_elements(self, page: str, key: str, selector: str, scope: WebElement | None = None) -> list[WebElement]:
        """Returns all elements of a collection (e.g. table rows), healing to similar siblings when broken."""
        return self._page(page).locate_all(LocateSpec(key, selector, scope=scope))

    @keyword
    def get_heal_events(self) -> list[dict[str, Any]]:
        """Heal events of the current test, as dictionaries (pageId, elementKey, healedSelector, score...)."""
        return [event.to_json() for event in self._test_events]

    @keyword
    def element_containing_text(self, elements: list[WebElement], text: str) -> WebElement:
        """Returns the first element whose visible text contains ``text``. Fails if there is none."""
        for element in elements:
            if text in self._inner_text(element):
                return element
        raise AssertionError(f'None of {len(elements)} elements contains "{text}"')

    @keyword
    def texts_of_elements(self, elements: list[WebElement]) -> list[str]:
        """Visible texts of the given elements."""
        return [self._inner_text(element) for element in elements]

    # -- listener ---------------------------------------------------------------------------------

    def start_test(self, data, result) -> None:
        self._test_events = []
        self._current_test = result.full_name

    def end_test(self, data, result) -> None:
        if self._test_events:
            result.tags.add(HEALED_TAG)

    def close(self) -> None:
        output_dir = BuiltIn().get_variable_value("${OUTPUT DIR}")
        if output_dir and self._run_events:
            Path(output_dir, "self-healing.json").write_text(json.dumps(self._run_events, indent=2), encoding="utf-8")

    # -- helpers ----------------------------------------------------------------------------------

    def _record(self, event: HealEvent) -> None:
        self._test_events.append(event)
        self._run_events.append({"test": self._current_test, **event.to_json()})
        logger.info(f"self-healed {event.describe()}")

    def _page(self, page: str):
        return self.healer.for_page(self._selenium.driver, page)

    @property
    def _selenium(self):
        return BuiltIn().get_library_instance("SeleniumLibrary")

    def _inner_text(self, element: WebElement) -> str:
        return self._selenium.driver.execute_script("return arguments[0].innerText", element)


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() not in ("", "false", "no", "off", "0", "none")
    return bool(value)
