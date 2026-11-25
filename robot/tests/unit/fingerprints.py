"""Builds fingerprints with sensible empty defaults for unit tests."""

from typing import Any


def fp(context: dict[str, Any] | None = None, **overrides: Any) -> dict[str, Any]:
    fingerprint = {
        "tag": "div",
        "role": "",
        "id": "",
        "classes": [],
        "attributes": {},
        "text": "",
        "accessibleName": "",
        "path": ["body"],
        "childCount": 0,
        "textLength": len(overrides.get("text", "")),
        **overrides,
    }
    fingerprint["context"] = {"label": "", "parentText": "", "ancestorLabels": [], **(context or {})}
    return fingerprint
