# Self-healing tests

End-to-end test frameworks whose locators **heal themselves** when the UI changes, in two flavours: **Playwright + TypeScript** and **Robot Framework + Selenium (chromedriver)**. Both test one shared sample application with **three UI versions** to prove it.

The sample server also hosts **Willow Pet Hotel** (`/hotel/`), a production-style staff app for a pet hotel. Admins manage employees and read change logs. The front desk checks pets in and out, keeps owner and pet records and schedules care rounds. General staff work through their rounds with a checklist, a room photo and notes. See [server-in-test/README.md](server-in-test/README.md#pet-hotel-hotel) and the [screenshots](docs/hotel.md).

Page objects are written once, against UI v1. When v2 or v3 renames ids, swaps a `<table>` for cards or moves row actions into a drawer, the framework compares a stored *fingerprint* of each element with what is on the page now and picks the best match.

```mermaid
flowchart LR
  subgraph repo[repository]
    direction LR
    PW["playwright/e2e-framework/<br/>TypeScript healing engine<br/>page objects + specs"]
    RB["robot/<br/>Python healing engine<br/>Robot keywords, page resources + suites"]
    SIT["server-in-test/<br/>Node + Express API<br/>Pet hotel staff app (/hotel/)<br/>React SPAs: login · query · report<br/>3 UI versions each<br/>(PUT /api/ui-version)"]
  end
  PW -- "Chromium via Playwright (CDP)" --> SIT
  RB -- "Chrome via Selenium (chromedriver)" --> SIT
  PW -- "fingerprints (page → element)" --> STORE[("element store<br/>filesystem · remote · MongoDB<br/>same format for both")]
  RB --> STORE
```

| Folder | What it is | Details |
| --- | --- | --- |
| [`server-in-test/`](server-in-test/README.md) | The application under test: a Node/Express backend, the pet hotel staff app, and three React single-page apps (login, query/results table, report), each with three layouts | [server-in-test/README.md](server-in-test/README.md) |
| [`playwright/`](playwright/README.md) | The Playwright flavour. `playwright/e2e-framework/` holds the self-healing framework (fingerprinting, scoring, healer, pluggable storage) plus page objects and specs for the sample apps and the pet hotel | [playwright/e2e-framework/README.md](playwright/e2e-framework/README.md) |
| [`robot/`](robot/README.md) | The Robot Framework flavour: the same healing approach ported to Python as a SeleniumLibrary add-on, with page-object resources and suites for the login, results and report apps | [robot/README.md](robot/README.md) |
| [`docs/`](docs/ui-versions.md) | Screenshots of every UI version and of the pet hotel | |

## Prerequisites

- Node.js 22.13 or newer (the pet hotel stores data with `node:sqlite`; developed on Node 25) and npm 10 or newer
- For the Robot flavour: Python 3.10 or newer and Chrome. Without Chrome, Selenium Manager downloads Chrome for Testing and chromedriver on first use
- Git

## Install

```bash
npm install                                         # server-in-test + playwright/e2e-framework workspaces
npx playwright install chromium                     # browser used by the Playwright tests
pip install -r robot/requirements.txt               # Robot Framework, SeleniumLibrary, pytest
```

## Run the tests

```bash
npm test                 # everything below, in order
npm run test:unit        # Vitest: server-in-test + playwright/e2e-framework
npm run test:e2e         # Playwright: framework integration + v1/v2/v3 e2e + pet hotel journeys
npm run test:robot:unit  # pytest: Robot flavour unit tests + healer tests in headless Chrome
npm run test:robot       # Robot Framework: login/results/report suites on v1, then v2 and v3
```

Both e2e runs build the SPAs and start the sample server automatically. Playwright uses its `webServer` setting and one server per worker. Robot starts one server per UI version run.

How the end-to-end run proves healing works:

```mermaid
flowchart LR
  V1["v1 baseline<br/>v1 selectors match<br/>→ fingerprints recorded"] --> V2["v2 healed<br/>same page objects<br/>selectors broken → healed"]
  V1 --> V3["v3 healed<br/>same page objects<br/>selectors broken → healed"]
```

In Playwright every healed lookup is added to the test as a `self-healed` annotation and a `self-healing.json` attachment. Open the HTML report with `npx playwright show-report playwright/e2e-framework/playwright-report`. In Robot, tests that healed get the `self-healed` tag and each run writes `robot/results/v<n>/self-healing.json`. The combined report is `robot/results/report.html`.

## Try the apps manually

```bash
npm run serve --workspace server-in-test     # http://localhost:3000 (starts on UI v1)
```

`http://localhost:3000/` opens the pet hotel (data in `server-in-test/data/`, kept across restarts; `POST /api/test/reset` restores the seed). Sign in as `admin` / `password123` (admin), `frontdesk` / `frontdesk123` (front desk) or `jordan` / `staff123` (general staff). Each role sees its own pages. The data is in memory and seeded relative to today.

The self-healing demo apps are at `/login/`, `/query/` and `/report/`.

To switch every demo app to another layout while the server runs, call the version endpoint. Open pages pick up the change within about a second, with no reload:

```bash
curl -X PUT localhost:3000/api/ui-version -H "Content-Type: application/json" -d '{"version": 2}'
curl localhost:3000/api/ui-version            # {"version":2}
```

```powershell
Invoke-RestMethod -Method Put -Uri localhost:3000/api/ui-version -ContentType application/json -Body '{"version": 3}'
```

The v1 / v2 / v3 buttons in each page's footer call the same endpoint. Demo credentials are `admin` / `password123`. For a side-by-side view of every layout, see [docs/ui-versions.md](docs/ui-versions.md). Pet hotel screens are in [docs/hotel.md](docs/hotel.md), and the queue of planned improvements is at the top of [status.md](status.md#improvement-queue). Project progress is logged in [status.md](status.md).

## A note on "chromedriver"

Playwright does not use chromedriver or WebDriver. It drives Chromium directly over the Chrome DevTools Protocol. The tests use Playwright's bundled Chromium by default. Set `PW_CHANNEL=chrome` to run them in your installed Google Chrome instead. The Robot flavour does use chromedriver, through Selenium.

## Repository conventions

- npm workspaces: the root `package.json` only orchestrates scripts (including the Python ones for `robot/`).
- The TypeScript packages are functional: factory functions and closures, no classes. The Python package is idiomatic Python: pure functions for scoring, small classes where Robot or state needs them.
- The two healing engines are ports of each other. Change the fingerprint script, features or weights in both.
- History follows TDD: a failing test, then the implementation, then a commit on green. Refactoring commits only happen with all tests passing.
