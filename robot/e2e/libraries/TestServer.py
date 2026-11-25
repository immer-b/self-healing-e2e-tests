"""Starts the shared ../server-in-test sample app for a Robot run and wraps its test-support API.

The server asks the OS for a free port (PORT=0) and keeps hotel data in memory, so a Robot run never
collides with a dev server or a parallel Playwright run.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from robot.api import logger
from robot.api.deco import keyword, library
from selenium import webdriver

REPO = Path(__file__).resolve().parents[3]
SERVER_DIR = REPO / "server-in-test"
STARTUP_TIMEOUT = 60


@library(scope="GLOBAL", auto_keywords=False)
class TestServer:
    def __init__(self) -> None:
        self._process: subprocess.Popen[str] | None = None
        self.base_url = ""

    # -- server lifecycle -------------------------------------------------------------------------

    @keyword
    def start_test_server(self, build: bool = True) -> str:
        """Builds the SPAs (unless ``build`` is false or SKIP_BUILD is set) and starts the server.

        Returns the base URL, e.g. ``http://localhost:53412``.
        """
        if _truthy(build) and not os.environ.get("SKIP_BUILD"):
            self._build_client()
        elif not (SERVER_DIR / "dist" / "client").is_dir():
            raise RuntimeError("server-in-test/dist/client is missing: run `npm run build --workspace server-in-test`")

        node = shutil.which("node") or "node"
        self._process = subprocess.Popen(
            [node, "--import", "tsx", "src/server/index.ts", "--test-routes"],
            cwd=SERVER_DIR,
            env={**os.environ, "PORT": "0", "HOTEL_STORAGE": "memory", "NODE_NO_WARNINGS": "1"},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
        )
        self.base_url = self._wait_for_listening(self._process)
        logger.info(f"server-in-test listening on {self.base_url}", also_console=True)
        return self.base_url

    @keyword
    def stop_test_server(self) -> None:
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None

    @staticmethod
    def _build_client() -> None:
        npm = shutil.which("npm") or "npm"
        logger.console("building server-in-test client apps...")
        result = subprocess.run([npm, "run", "build", "--workspace", "server-in-test"], check=False, cwd=REPO,
                                capture_output=True, text=True, encoding="utf-8")
        if result.returncode != 0:
            raise RuntimeError(f"client build failed:\n{result.stdout}\n{result.stderr}")

    @staticmethod
    def _wait_for_listening(process: subprocess.Popen[str]) -> str:
        """Reads stdout until the server prints its URL; then keeps draining it so the pipe never fills."""
        found: dict[str, str] = {}
        ready = threading.Event()

        def read() -> None:
            for line in process.stdout:  # type: ignore[union-attr]
                if not ready.is_set() and "listening on " in line:
                    found["url"] = line.split("listening on ")[1].strip()
                    ready.set()
            ready.set()

        threading.Thread(target=read, daemon=True).start()
        if not ready.wait(STARTUP_TIMEOUT) or "url" not in found:
            process.kill()
            raise RuntimeError(f"server-in-test did not start within {STARTUP_TIMEOUT} s (exit code {process.poll()})")
        return found["url"]

    # -- test-support API -------------------------------------------------------------------------

    @keyword
    def reset_test_data(self) -> None:
        """Restores the seeded records (POST /api/test/reset)."""
        self._request("POST", "/api/test/reset")

    @keyword
    def set_ui_version(self, version: int) -> None:
        """Switches every demo app to layout 1, 2 or 3 (PUT /api/ui-version)."""
        self._request("PUT", "/api/ui-version", {"version": int(version)})

    @keyword
    def get_report_from_api(self) -> dict[str, Any]:
        return self._request("GET", "/api/report")

    @keyword
    def create_record_via_api(self, name: str, owner: str, status: str, amount: int) -> dict[str, Any]:
        return self._request("POST", "/api/records", {"name": name, "owner": owner, "status": status, "amount": int(amount)})

    def _request(self, method: str, path: str, body: Any = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = Request(self.base_url + path, data=data, method=method, headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=10) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text else None

    # -- browser ----------------------------------------------------------------------------------

    @keyword
    def chrome_options_for_tests(self, download_dir: str, headless: bool = True) -> webdriver.ChromeOptions:
        """Chrome options for the e2e run: headless unless HEADLESS=0, downloads saved to ``download_dir``."""
        options = webdriver.ChromeOptions()
        if _truthy(headless) and os.environ.get("HEADLESS", "1") != "0":
            options.add_argument("--headless=new")
        options.add_argument("--window-size=1280,900")
        options.add_experimental_option("prefs", {
            "download.default_directory": str(Path(download_dir).resolve()),
            "download.prompt_for_download": False,
        })
        if os.environ.get("CHROME_BINARY"):
            options.binary_location = os.environ["CHROME_BINARY"]
        return options

    @keyword
    def new_download_directory(self) -> str:
        """A fresh, empty temp folder for one test's downloads."""
        return tempfile.mkdtemp(prefix="robot-downloads-")


def _truthy(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() not in ("", "false", "no", "off", "0", "none")
    return bool(value)
