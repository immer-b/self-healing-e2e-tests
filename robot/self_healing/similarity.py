"""Pure string and collection similarity helpers. Every function returns a score in [0, 1].

A port of playwright/e2e-framework/src/healing/similarity.ts: same formulas, same results.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Sequence

_WHITESPACE = re.compile(r"\s+")
_CAMEL_BOUNDARY = re.compile(r"([a-z0-9])([A-Z])")
_NON_TOKEN = re.compile(r"[^a-z0-9]+")
_DIGITS = re.compile(r"\d+")
_LETTERS = re.compile(r"[^\W\d_]+")
# Anything that is not a letter or digit (the JS version uses [^\p{L}\p{N}]).
_WORD_EDGE = r"[\W_]"


def normalize_text(text: str) -> str:
    return _WHITESPACE.sub(" ", text.lower()).strip()


def tokenize(text: str) -> list[str]:
    """Splits identifiers and prose into lowercase word tokens (camelCase, kebab-case, snake_case, spaces)."""
    spaced = _CAMEL_BOUNDARY.sub(r"\1 \2", text).lower()
    return [token for token in _NON_TOKEN.split(spaced) if token]


def set_similarity(a: Iterable[str], b: Iterable[str]) -> float:
    """Jaccard index of two collections treated as sets."""
    set_a, set_b = set(a), set(b)
    if not set_a and not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    return intersection / (len(set_a) + len(set_b) - intersection)


def _bigrams(text: str) -> list[str]:
    return [text[i : i + 2] for i in range(len(text) - 1)]


def _dice_coefficient(a: str, b: str) -> float:
    """Sørensen–Dice coefficient over character bigrams (whitespace removed)."""
    grams_a = _bigrams(_WHITESPACE.sub("", a))
    grams_b = _bigrams(_WHITESPACE.sub("", b))
    if not grams_a or not grams_b:
        return 0.0
    overlap = sum((Counter(grams_a) & Counter(grams_b)).values())
    return 2 * overlap / (len(grams_a) + len(grams_b))


def _contains_words(haystack: str, needle: str) -> bool:
    """True when `needle` appears in `haystack` as whole words ("records" in "total records", not "active" in "inactive")."""
    return re.search(rf"(?:^|{_WORD_EDGE}){re.escape(needle)}(?:$|{_WORD_EDGE})", haystack) is not None


def _token_subset_score(a: Sequence[str], b: Sequence[str]) -> float:
    """Scores the case where every word of the shorter text occurs in the longer one ("Export CSV" / "Export report as CSV")."""
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if not shorter:
        return 0.0
    longer_set = set(longer)
    if not all(token in longer_set for token in shorter):
        return 0.0
    return 0.6 + 0.4 * (len(set(shorter)) / len(longer_set))


def text_shape(text: str) -> str:
    """Reduces text to its format: digit runs -> "9", letter runs -> "a" ("$7,800" -> "$9,9")."""
    return _LETTERS.sub("a", _DIGITS.sub("9", normalize_text(text)))


def shape_similarity(a: str, b: str) -> float:
    """Compares the format of two texts: identical shapes score 1, otherwise bigram overlap of the shapes."""
    shape_a, shape_b = text_shape(a), text_shape(b)
    if not shape_a or not shape_b:
        return 0.0
    return 1.0 if shape_a == shape_b else _dice_coefficient(shape_a, shape_b)


def text_similarity(a: str, b: str) -> float:
    """Fuzzy text similarity combining exact match, containment, token overlap and character bigrams.

    Non-identical strings are capped below 1 so exact matches always win ties.
    """
    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0

    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    containment = 0.6 + 0.4 * (len(shorter) / len(longer)) if _contains_words(longer, shorter) else 0.0
    tokens_a, tokens_b = tokenize(na), tokenize(nb)
    return min(
        0.95,
        max(containment, set_similarity(tokens_a, tokens_b), _token_subset_score(tokens_a, tokens_b), _dice_coefficient(na, nb)),
    )


def sequence_similarity(a: Sequence[str], b: Sequence[str]) -> float:
    """Longest-common-subsequence ratio for ordered sequences such as ancestor tag paths."""
    if not a or not b:
        return 0.0
    previous = [0] * (len(b) + 1)
    for item_a in a:
        current = [0]
        for j, item_b in enumerate(b, start=1):
            current.append(previous[j - 1] + 1 if item_a == item_b else max(previous[j], current[j - 1]))
        previous = current
    return previous[-1] / max(len(a), len(b))
