"""Every store honours the same contract; the remote store is checked against the real TS store server."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from self_healing.store import DocumentStore, FileSystemStore, MemoryStore, RemoteStore, encode_name, store_from_env

from .fingerprints import fp

REPO = Path(__file__).resolve().parents[3]
PLAYWRIGHT_FRAMEWORK = REPO / "playwright" / "e2e-framework"
TOKEN = "s3cret"


def record(page_id="login", element_key="username", selector="#username", **fingerprint):
    return {"pageId": page_id, "elementKey": element_key, "selector": selector,
            "fingerprint": fp(**fingerprint), "updatedAt": "2026-01-01T00:00:00.000Z"}


class FakeCollection:
    """Just enough of a pymongo Collection for DocumentStore."""

    class _Deleted:
        def __init__(self, count):
            self.deleted_count = count

    def __init__(self):
        self.docs = []

    def _matches(self, doc, query):
        return all(doc.get(k) == v for k, v in query.items())

    def find_one(self, query):
        return next(({"_id": i, **d} for i, d in enumerate(self.docs) if self._matches(d, query)), None)

    def find(self, query):
        return [{"_id": i, **d} for i, d in enumerate(self.docs) if self._matches(d, query)]

    def replace_one(self, query, doc, upsert=False):
        self.docs = [d for d in self.docs if not self._matches(d, query)] + [doc]

    def distinct(self, field):
        return list(dict.fromkeys(d[field] for d in self.docs))

    def delete_one(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self._matches(d, query)]
        return self._Deleted(before - len(self.docs))


@pytest.fixture(scope="session")
def store_server_url():
    """Starts playwright/e2e-framework's store server on a free port, backed by memory."""
    if not shutil.which("node") or not (REPO / "node_modules" / "tsx").exists():
        pytest.skip("node and the npm workspace install are needed for the remote store test")
    script = (
        "import { createStoreServer } from './src/store/storeServer.ts';"
        "import { createMemoryStore } from './src/store/memoryStore.ts';"
        f"const s = createStoreServer(createMemoryStore(), {{ token: '{TOKEN}' }})"
        ".listen(0, () => console.log('listening on http://localhost:' + s.address().port));"
    )
    child = subprocess.Popen(["node", "--import", "tsx", "--input-type=module", "-e", script],
                             cwd=PLAYWRIGHT_FRAMEWORK, stdout=subprocess.PIPE, text=True)
    line = child.stdout.readline()
    if "listening on" not in line:
        child.kill()
        pytest.fail(f"store server did not start: {line!r}")
    yield line.split("listening on ")[1].strip()
    child.kill()


@pytest.fixture(params=["memory", "filesystem", "document", "remote"])
def store(request, tmp_path):
    if request.param == "memory":
        return MemoryStore()
    if request.param == "filesystem":
        return FileSystemStore(tmp_path / "store")
    if request.param == "document":
        return DocumentStore(FakeCollection())
    # A fresh page namespace per test keeps the shared server's data apart.
    return _Namespaced(RemoteStore(request.getfixturevalue("store_server_url"), TOKEN), request.node.name)


class _Namespaced:
    """Prefixes page ids so tests sharing one remote server do not see each other's pages."""

    def __init__(self, inner, prefix):
        self.inner, self.prefix = inner, f"{prefix}:"

    def _in(self, r):
        return {**r, "pageId": self.prefix + r["pageId"]}

    def _out(self, r):
        return r and {**r, "pageId": r["pageId"].removeprefix(self.prefix)}

    def get(self, page_id, key):
        return self._out(self.inner.get(self.prefix + page_id, key))

    def put(self, r):
        self.inner.put(self._in(r))

    def list_pages(self):
        return [p.removeprefix(self.prefix) for p in self.inner.list_pages() if p.startswith(self.prefix)]

    def list_elements(self, page_id):
        return [self._out(r) for r in self.inner.list_elements(self.prefix + page_id)]

    def remove(self, page_id, key):
        return self.inner.remove(self.prefix + page_id, key)


class TestStoreContract:
    def test_returns_none_for_unknown_elements(self, store):
        assert store.get("login", "nope") is None

    def test_round_trips_a_record(self, store):
        store.put(record(tag="input", text="hello"))
        assert store.get("login", "username") == record(tag="input", text="hello")

    def test_replaces_a_record_with_the_same_key(self, store):
        store.put(record(selector="#old"))
        store.put(record(selector="#new"))
        assert store.get("login", "username")["selector"] == "#new"
        assert len(store.list_elements("login")) == 1

    def test_lists_pages_and_elements(self, store):
        store.put(record("login", "username"))
        store.put(record("login", "password"))
        store.put(record("report", "metric.total"))
        assert sorted(store.list_pages()) == ["login", "report"]
        assert sorted(r["elementKey"] for r in store.list_elements("login")) == ["password", "username"]
        assert store.list_elements("unknown") == []

    def test_removes_records(self, store):
        store.put(record())
        assert store.remove("login", "username") is True
        assert store.remove("login", "username") is False
        assert store.get("login", "username") is None

    def test_handles_keys_with_dots_slashes_and_unicode(self, store):
        store.put(record("hotel.round", "row.menu/édit*"))
        assert store.get("hotel.round", "row.menu/édit*")["elementKey"] == "row.menu/édit*"
        assert store.list_pages() == ["hotel.round"]


class TestFileSystemStore:
    def test_uses_the_same_file_names_as_the_playwright_store(self, tmp_path):
        FileSystemStore(tmp_path).put(record("report", "metric.active"))
        assert (tmp_path / "report" / "metric%2Eactive.json").is_file()
        assert encode_name("a*b c") == "a%2Ab%20c"

    def test_reads_fingerprints_recorded_by_playwright(self, tmp_path):
        page = tmp_path / "login"
        page.mkdir()
        recorded = record(tag="input")
        (page / "username.json").write_text(json.dumps(recorded, indent=2), encoding="utf-8")
        assert FileSystemStore(tmp_path).get("login", "username") == recorded

    def test_leaves_no_temp_files_behind(self, tmp_path):
        store = FileSystemStore(tmp_path)
        for i in range(5):
            store.put(record(selector=f"#v{i}"))
        assert [f.name for f in (tmp_path / "login").iterdir()] == ["username.json"]


class TestStoreFromEnv:
    def test_defaults_to_a_filesystem_store_under_the_base_dir(self, tmp_path):
        store = store_from_env({}, base_dir=tmp_path)
        assert isinstance(store, FileSystemStore) and store.directory == tmp_path / ".healing-store"

    def test_honours_the_store_directory(self, tmp_path):
        assert store_from_env({"HEALING_STORE_DIR": "custom"}, tmp_path).directory == tmp_path / "custom"

    def test_builds_memory_and_remote_stores(self):
        assert isinstance(store_from_env({"HEALING_STORE": "memory"}), MemoryStore)
        remote = store_from_env({"HEALING_STORE": "remote", "HEALING_STORE_URL": "http://x/", "HEALING_STORE_TOKEN": "t"})
        assert (remote.root, remote.token) == ("http://x", "t")

    def test_rejects_incomplete_or_unknown_settings(self):
        with pytest.raises(ValueError, match="HEALING_STORE_URL"):
            store_from_env({"HEALING_STORE": "remote"})
        with pytest.raises(ValueError, match="Unknown"):
            store_from_env({"HEALING_STORE": "redis"})


def test_remote_store_rejects_a_wrong_token(store_server_url):
    with pytest.raises(RuntimeError, match="401"):
        RemoteStore(store_server_url, "wrong").list_pages()
