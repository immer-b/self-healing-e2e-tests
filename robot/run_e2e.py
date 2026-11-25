"""Runs the e2e suites once per UI version and combines the results into one report.

    python run_e2e.py                 # v1 (records baselines), then v2 and v3 (must heal)
    python run_e2e.py --versions 1 2  # a subset
    python run_e2e.py -- --include crud --loglevel DEBUG   # extra arguments for robot

v1 always runs first when selected: the page objects are written for it, so its run records the
baseline fingerprints that the v2 and v3 runs heal from. Results go to results/ (report.html,
log.html and self-healing.json per version under results/v<n>/).
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from robot import rebot_cli, run_cli

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"
NAMES = {1: "v1 baseline", 2: "v2 healed", 3: "v3 healed"}


def run_version(version: int, extra: list[str]) -> int:
    print(f"\n=== UI v{version}: {NAMES[version]} ===", flush=True)
    return run_cli([
        "--name", NAMES[version],
        "--variable", f"UI_VERSION:{version}",
        "--pythonpath", str(HERE),
        "--outputdir", str(RESULTS / f"v{version}"),
        "--report", "NONE",
        "--log", "log.html",
        "--console", "verbose",
        *extra,
        str(HERE / "e2e" / "specs"),
    ], exit=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--versions", type=int, nargs="+", choices=sorted(NAMES), default=sorted(NAMES))
    parser.add_argument("robot_args", nargs="*", help="passed to robot (put them after --)")
    args = parser.parse_args()

    shutil.rmtree(RESULTS, ignore_errors=True)
    failures = 0
    for index, version in enumerate(sorted(set(args.versions))):
        if index == 1:
            os.environ["SKIP_BUILD"] = "1"  # the client was built for the first run
        failures += run_version(version, args.robot_args)

    outputs = [str(RESULTS / f"v{v}" / "output.xml") for v in sorted(set(args.versions))]
    rebot_cli(["--name", "Self-healing e2e", "--outputdir", str(RESULTS), "--output", "output.xml", *outputs], exit=False)
    print(f"\nCombined report: {RESULTS / 'report.html'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
