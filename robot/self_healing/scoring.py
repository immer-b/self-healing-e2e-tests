"""Compares fingerprints feature by feature and picks the best healing candidate.

A port of playwright/e2e-framework/src/healing/features.ts and scoring.ts. Fingerprints are the
plain dicts produced by fingerprint.js (camelCase keys, exactly as stored in the element store).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from .similarity import (
    sequence_similarity,
    set_similarity,
    shape_similarity,
    text_similarity,
    tokenize,
)

Fingerprint = Mapping[str, Any]

# Tags and roles that commonly replace each other in a redesign (e.g. table rows becoming list items).
TAG_FAMILIES = (
    ("input", "textarea", "select"),
    ("button", "a"),
    ("tr", "li", "article", "div", "section"),
    ("td", "th", "span", "dd", "div", "p", "strong"),
    ("h1", "h2", "h3", "h4", "h5", "h6"),
    ("table", "ul", "ol", "div", "dl"),
)
ROLE_FAMILIES = (
    ("textbox", "searchbox", "combobox"),
    ("button", "link", "menuitem", "tab"),
    ("row", "listitem", "article", "group"),
    ("cell", "gridcell", "rowheader", "definition"),
    ("table", "grid", "list"),
    ("alert", "status"),
    ("dialog", "region", "complementary"),
)

DEFAULT_WEIGHTS: dict[str, float] = {
    "tag": 2,
    "role": 2,
    "type": 2,
    "accessibleName": 3,
    "text": 2,
    "attributes": 1.5,
    "context": 1.5,
    "path": 0.5,
    "structure": 0.5,
}

# For dynamic text only the value's format is compared, at this fraction of the normal text weight;
# the remainder moves to context.
DYNAMIC_TEXT_FACTOR = 0.5


@dataclass(frozen=True)
class ScoreOptions:
    """How to compare: `dynamic_text` for changing values (metrics), `ignore_content` for collection items."""

    dynamic_text: bool = False
    ignore_content: bool = False
    weights: Mapping[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class ScoreResult:
    score: float
    breakdown: dict[str, float]


@dataclass(frozen=True)
class Ranked:
    """A candidate with its score. `selector` is empty for candidates scored without one."""

    selector: str
    fingerprint: Fingerprint
    score: float
    breakdown: dict[str, float]


def _family_match(families: Sequence[Sequence[str]], a: str, b: str) -> float:
    """1 for identical values, 0.5 for members of the same family, 0 otherwise."""
    if a == b:
        return 1.0
    return 0.5 if any(a in family and b in family for family in families) else 0.0


def _ratio(a: float, b: float) -> float:
    return 1 - abs(a - b) / max(a, b, 1)


def _attribute_tokens(f: Fingerprint) -> list[str]:
    """Bag of identifier-ish tokens: id, classes and descriptive attributes."""
    values = [value for name, value in f["attributes"].items() if name != "type"]
    return tokenize(" ".join([f["id"], *f["classes"], *values]))


def _context_similarity(a: Mapping[str, Any], b: Mapping[str, Any]) -> float | None:
    slots = [
        (a["label"], b["label"]),
        (" ".join(a["ancestorLabels"]), " ".join(b["ancestorLabels"])),
        (a["parentText"], b["parentText"]),
    ]
    present = [(x, y) for x, y in slots if x]
    if not present:
        return None

    # A direct label match is the most specific signal, so it is not diluted by the other slots.
    label_match = text_similarity(a["label"], b["label"])
    aligned = sum(text_similarity(x, y) for x, y in present) / len(present)
    # The baseline's label may now live in a different slot (e.g. a sibling became an aria-label).
    a_values = [x for x, _ in slots if x]
    b_values = [y for _, y in slots if y]
    cross_slot = max([0.0, *(text_similarity(x, y) for x in a_values for y in b_values)])
    return max(label_match, aligned, cross_slot * 0.9)


def _text(b: Fingerprint, c: Fingerprint, options: ScoreOptions) -> float | None:
    if not b["text"] or options.ignore_content:
        return None
    # Changing values keep their format ("$1,200" -> "$1,350"), so compare shapes instead of content.
    return shape_similarity(b["text"], c["text"]) if options.dynamic_text else text_similarity(b["text"], c["text"])


def _attributes(b: Fingerprint, c: Fingerprint, _: ScoreOptions) -> float | None:
    tokens = _attribute_tokens(b)
    return set_similarity(tokens, _attribute_tokens(c)) if tokens else None


# Each feature compares one aspect of a baseline with a candidate and returns a similarity in [0, 1],
# or None when the baseline has nothing to compare (the feature is then skipped, so candidates are
# never penalised for information the baseline lacked).
Feature = Callable[[Fingerprint, Fingerprint, ScoreOptions], "float | None"]
FEATURES: dict[str, Feature] = {
    "tag": lambda b, c, _: _family_match(TAG_FAMILIES, b["tag"], c["tag"]),
    "role": lambda b, c, _: _family_match(ROLE_FAMILIES, b["role"], c["role"]) if b["role"] else None,
    "type": lambda b, c, _: float(b["attributes"]["type"] == c["attributes"].get("type")) if b["attributes"].get("type") else None,
    "accessibleName": lambda b, c, _: text_similarity(b["accessibleName"], c["accessibleName"]) if b["accessibleName"] else None,
    "text": _text,
    "attributes": _attributes,
    "context": lambda b, c, o: None if o.ignore_content else _context_similarity(b["context"], c["context"]),
    "path": lambda b, c, _: sequence_similarity(b["path"], c["path"]),
    "structure": lambda b, c, _: (_ratio(b["childCount"], c["childCount"]) + _ratio(b["textLength"], c["textLength"])) / 2,
}


def _effective_weights(options: ScoreOptions) -> dict[str, float]:
    weights = {**DEFAULT_WEIGHTS, **options.weights}
    if options.dynamic_text:
        # Text is unreliable, so the surrounding context (labels, captions) has to identify the element.
        weights["context"] += weights["text"] * (1 - DYNAMIC_TEXT_FACTOR)
        weights["text"] *= DYNAMIC_TEXT_FACTOR
    return weights


def score_fingerprint(baseline: Fingerprint, candidate: Fingerprint, options: ScoreOptions | None = None) -> ScoreResult:
    """`score` is the weighted mean of the features that apply to this baseline."""
    options = options or ScoreOptions()
    weights = _effective_weights(options)
    total = weight_sum = 0.0
    breakdown: dict[str, float] = {}
    for name, feature in FEATURES.items():
        value = feature(baseline, candidate, options)
        if value is None:
            continue
        breakdown[name] = value
        total += value * weights[name]
        weight_sum += weights[name]
    return ScoreResult(total / weight_sum if weight_sum else 0.0, breakdown)


def rank_candidates(
    baseline: Fingerprint, candidates: Sequence[Mapping[str, Any]], options: ScoreOptions | None = None
) -> list[Ranked]:
    """Scores `{selector, fingerprint}` candidates against the baseline, best first."""
    ranked = []
    for candidate in candidates:
        result = score_fingerprint(baseline, candidate["fingerprint"], options)
        ranked.append(Ranked(candidate.get("selector", ""), candidate["fingerprint"], result.score, result.breakdown))
    return sorted(ranked, key=lambda r: r.score, reverse=True)


@dataclass(frozen=True)
class PickOptions:
    """`threshold` is always accepted; between `min_score` and it, the winner needs a `min_margin` lead.

    `group_of` maps a selector to a group so same-group runners-up (sibling rows) are not competitors.
    """

    threshold: float
    min_score: float | None = None
    min_margin: float = 0.0
    group_of: Callable[[str], str] | None = None


def pick_best(ranked: Sequence[Ranked], options: PickOptions) -> Ranked | None:
    if not ranked:
        return None
    best = ranked[0]
    min_score = options.threshold if options.min_score is None else options.min_score
    if best.score >= options.threshold:
        return best
    if best.score < min_score:
        return None
    group_of = options.group_of
    best_group = group_of(best.selector) if group_of else None
    runner_up = next((c for c in ranked[1:] if not group_of or group_of(c.selector) != best_group), None)
    return best if runner_up is None or best.score - runner_up.score >= options.min_margin else None
