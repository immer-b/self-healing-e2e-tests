"""Small helpers that keep the page-object resources free of string-parsing plumbing."""

import re
import time
from pathlib import Path

from robot.api.deco import keyword, library


@library(scope="GLOBAL", auto_keywords=False)
class PageHelpers:
    @keyword
    def numbers_in(self, text: str) -> list[int]:
        """All numbers in a text, with thousands separators removed ("2 records · $1,650" -> [2, 1650])."""
        return [int(n.replace(",", "")) for n in re.findall(r"\d[\d,]*", text)]

    @keyword
    def first_number_in(self, text: str) -> int:
        numbers = self.numbers_in(text)
        if not numbers:
            raise AssertionError(f'No number in "{text}"')
        return numbers[0]

    @keyword
    def remove_file_if_present(self, path: str) -> None:
        Path(path).unlink(missing_ok=True)

    @keyword
    def wait_for_downloaded_file(self, path: str, timeout: float = 10) -> str:
        """Waits until Chrome has finished writing ``path`` and returns its content."""
        file = Path(path)
        deadline = time.monotonic() + float(timeout)
        while time.monotonic() < deadline:
            if file.is_file() and not file.with_name(file.name + ".crdownload").exists():
                return file.read_text(encoding="utf-8")
            time.sleep(0.1)
        raise AssertionError(f"{file.name} was not downloaded within {timeout} s")
