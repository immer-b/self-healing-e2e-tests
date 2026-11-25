"""Self-healing locators for Robot Framework and Selenium (a Python port of the Playwright framework)."""

from .healer import Healer, HealerSettings, HealEvent, HealingError, LocateSpec
from .library import SelfHealing
from .scoring import DEFAULT_WEIGHTS, ScoreOptions, pick_best, rank_candidates, score_fingerprint
from .store import DocumentStore, ElementStore, FileSystemStore, MemoryStore, RemoteStore, store_from_env

__all__ = [
    "DEFAULT_WEIGHTS",
    "DocumentStore",
    "ElementStore",
    "FileSystemStore",
    "HealEvent",
    "Healer",
    "HealerSettings",
    "HealingError",
    "LocateSpec",
    "MemoryStore",
    "RemoteStore",
    "ScoreOptions",
    "SelfHealing",
    "pick_best",
    "rank_candidates",
    "score_fingerprint",
    "store_from_env",
]
