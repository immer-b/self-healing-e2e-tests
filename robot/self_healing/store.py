"""Persistence for element fingerprints, addressed as page -> element.

Same record format, filesystem layout and REST contract as playwright/e2e-framework/src/store, so
Robot and Playwright runs can read and write the same store.

Implementations: memory, filesystem (one JSON file per element), remote (HTTP store server) and
document (a MongoDB-style collection, e.g. from pymongo).
"""

from __future__ import annotations

import copy
import json
import os
import random
import time
import uuid
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Protocol
from urllib.error import HTTPError
from urllib.parse import quote, unquote
from urllib.request import Request, urlopen

ElementRecord = dict[str, Any]
"""{pageId, elementKey, selector, fingerprint, updatedAt}"""

DEFAULT_STORE_DIR = ".healing-store"


class ElementStore(Protocol):
    def get(self, page_id: str, element_key: str) -> ElementRecord | None: ...
    def put(self, record: ElementRecord) -> None: ...
    def list_pages(self) -> list[str]: ...
    def list_elements(self, page_id: str) -> list[ElementRecord]: ...
    def remove(self, page_id: str, element_key: str) -> bool: ...


class MemoryStore:
    """Non-persistent store for unit tests."""

    def __init__(self) -> None:
        self._pages: dict[str, dict[str, ElementRecord]] = {}

    def get(self, page_id: str, element_key: str) -> ElementRecord | None:
        found = self._pages.get(page_id, {}).get(element_key)
        return copy.deepcopy(found) if found else None

    def put(self, record: ElementRecord) -> None:
        self._pages.setdefault(record["pageId"], {})[record["elementKey"]] = copy.deepcopy(record)

    def list_pages(self) -> list[str]:
        return [page for page, elements in self._pages.items() if elements]

    def list_elements(self, page_id: str) -> list[ElementRecord]:
        return [copy.deepcopy(r) for r in self._pages.get(page_id, {}).values()]

    def remove(self, page_id: str, element_key: str) -> bool:
        return self._pages.get(page_id, {}).pop(element_key, None) is not None


def encode_name(name: str) -> str:
    """Same encoding as the TS store: encodeURIComponent, plus `*` and `.` escaped (safe on every OS)."""
    return quote(name, safe="-_!~'()").replace(".", "%2E")


class FileSystemStore:
    """One JSON document per element (`<dir>/<pageId>/<elementKey>.json`), written atomically."""

    def __init__(self, directory: str | os.PathLike[str]) -> None:
        self.directory = Path(directory)

    def _page_dir(self, page_id: str) -> Path:
        return self.directory / encode_name(page_id)

    def _element_file(self, page_id: str, element_key: str) -> Path:
        return self._page_dir(page_id) / f"{encode_name(element_key)}.json"

    @staticmethod
    def _read(file: Path) -> ElementRecord | None:
        try:
            return json.loads(file.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None

    def get(self, page_id: str, element_key: str) -> ElementRecord | None:
        return self._read(self._element_file(page_id, element_key))

    def put(self, record: ElementRecord) -> None:
        self._page_dir(record["pageId"]).mkdir(parents=True, exist_ok=True)
        _write_atomically(self._element_file(record["pageId"], record["elementKey"]), json.dumps(record, indent=2, ensure_ascii=False))

    def list_pages(self) -> list[str]:
        if not self.directory.is_dir():
            return []
        return [unquote(p.name) for p in self.directory.iterdir() if p.is_dir() and any(p.glob("*.json"))]

    def list_elements(self, page_id: str) -> list[ElementRecord]:
        page_dir = self._page_dir(page_id)
        if not page_dir.is_dir():
            return []
        return [r for f in sorted(page_dir.glob("*.json")) if (r := self._read(f)) is not None]

    def remove(self, page_id: str, element_key: str) -> bool:
        try:
            self._element_file(page_id, element_key).unlink()
            return True
        except FileNotFoundError:
            return False


def _write_atomically(target: Path, content: str, attempts: int = 10) -> None:
    """Writes a uniquely named temp file, then renames it over the target.

    Windows briefly locks a file that another rename is replacing, so PermissionError is retried.
    """
    temp = target.with_name(f"{target.name}.{uuid.uuid4()}.tmp")
    temp.write_text(content, encoding="utf-8")
    for attempt in range(1, attempts + 1):
        try:
            os.replace(temp, target)
            return
        except PermissionError:
            if attempt == attempts:
                temp.unlink(missing_ok=True)
                raise
            # Jittered backoff so competing processes don't retry in lockstep.
            time.sleep((5 * attempt + random.random() * 20) / 1000)


class RemoteStore:
    """Talks to a store server (playwright/e2e-framework `npm run store:serve`) over its REST contract:

    GET /pages, GET /pages/:pageId/elements, GET|PUT|DELETE /pages/:pageId/elements/:key
    """

    def __init__(self, base_url: str, token: str | None = None, timeout: float = 10) -> None:
        self.root = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _element_url(self, page_id: str, element_key: str) -> str:
        return f"{self.root}/pages/{quote(page_id, safe='')}/elements/{quote(element_key, safe='')}"

    def _call(self, url: str, method: str = "GET", body: Any = None) -> tuple[int, Any]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = None if body is None else json.dumps(body).encode("utf-8")
        try:
            with urlopen(Request(url, data=data, method=method, headers=headers), timeout=self.timeout) as response:
                text = response.read().decode("utf-8")
                return response.status, json.loads(text) if text else None
        except HTTPError as error:
            if error.code == 404:
                return 404, None
            raise RuntimeError(f"Element store request failed: {method} {url} -> {error.code}") from error

    def get(self, page_id: str, element_key: str) -> ElementRecord | None:
        status, body = self._call(self._element_url(page_id, element_key))
        return None if status == 404 else body

    def put(self, record: ElementRecord) -> None:
        self._call(self._element_url(record["pageId"], record["elementKey"]), "PUT", record)

    def list_pages(self) -> list[str]:
        return self._call(f"{self.root}/pages")[1]

    def list_elements(self, page_id: str) -> list[ElementRecord]:
        return self._call(f"{self.root}/pages/{quote(page_id, safe='')}/elements")[1]

    def remove(self, page_id: str, element_key: str) -> bool:
        return self._call(self._element_url(page_id, element_key), "DELETE")[0] != 404


class DocumentStore:
    """NoSQL store: one document per element in a MongoDB-style collection (e.g. pymongo's
    `client.db.elements`). Recommended unique index: `{pageId: 1, elementKey: 1}`.
    """

    def __init__(self, collection: Any) -> None:
        self.collection = collection

    @staticmethod
    def _record(doc: Mapping[str, Any] | None) -> ElementRecord | None:
        return None if doc is None else {k: v for k, v in doc.items() if k != "_id"}

    def get(self, page_id: str, element_key: str) -> ElementRecord | None:
        return self._record(self.collection.find_one({"pageId": page_id, "elementKey": element_key}))

    def put(self, record: ElementRecord) -> None:
        key = {"pageId": record["pageId"], "elementKey": record["elementKey"]}
        self.collection.replace_one(key, dict(record), upsert=True)

    def list_pages(self) -> list[str]:
        return list(self.collection.distinct("pageId"))

    def list_elements(self, page_id: str) -> list[ElementRecord]:
        return [self._record(doc) for doc in self.collection.find({"pageId": page_id})]

    def remove(self, page_id: str, element_key: str) -> bool:
        return self.collection.delete_one({"pageId": page_id, "elementKey": element_key}).deleted_count > 0


def store_from_env(env: Mapping[str, str] | None = None, base_dir: str | os.PathLike[str] = ".") -> ElementStore:
    """Selects a store like the Playwright framework does:

    HEALING_STORE=filesystem|remote|memory (default filesystem)
    HEALING_STORE_DIR=<folder>             (filesystem, default .healing-store, relative to base_dir)
    HEALING_STORE_URL=<url>                (remote, required)
    HEALING_STORE_TOKEN=<token>            (remote, optional)
    """
    env = os.environ if env is None else env
    kind = env.get("HEALING_STORE", "filesystem")
    if kind == "memory":
        return MemoryStore()
    if kind == "filesystem":
        return FileSystemStore(Path(base_dir) / env.get("HEALING_STORE_DIR", DEFAULT_STORE_DIR))
    if kind == "remote":
        if not env.get("HEALING_STORE_URL"):
            raise ValueError("HEALING_STORE=remote requires HEALING_STORE_URL")
        return RemoteStore(env["HEALING_STORE_URL"], env.get("HEALING_STORE_TOKEN") or None)
    raise ValueError(f'Unknown HEALING_STORE "{kind}" (expected filesystem, remote or memory)')
