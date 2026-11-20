# Project status log

Running log of how the project evolves. Newest entry first.

---

## 2026-11-20 10:26 EST

### Pet hotel (`server-in-test`, `/hotel/`)
- New production-style staff app, **Willow Pet Hotel**, now the default page (`/` redirects to `/hotel/`). The three self-healing demo apps are unchanged
- Roles: **admin**, **front desk** (`receiving`) and **general staff**, each with its own navigation and landing page. Pages and API routes are both role-guarded
- Entities: employees (role plus job type: front desk or maintenance), owners (address plus any number of contacts, each with a relationship and any number of phone numbers), pets (name, species, breed, owner, special instructions), rooms (exclusive, midline, basic), stays, notes, care rounds
- Admin: create, edit, archive and restore employees and set their roles; manage rooms; change log for every entity showing who changed what and when, field by field
- Front desk:
  - Today dashboard: arrivals and departures with check-in and check-out
  - Pets and owners CRUD
  - Pet record: stays, booking a free room, cancelling
  - Room occupancy
  - Care schedule: generate rounds for the staff on shift, spread evenly; reassign; rebalance
- General staff: today's queue (pending first). A round page with "Room cleaned" and "Fed" checkboxes, special instructions, emergency contacts, a room photo upload and notes. Complete unlocks only when everything is done and returns to the queue
- Nothing is deleted: archive and restore everywhere. Notes are append-only for legal records. Every write is audited, with password hashes masked
- Security: scrypt password hashes; random session tokens in an `HttpOnly`, `SameSite=Strict` cookie; archived users lose access immediately; the last admin is protected
- Scheduling: water-fill then quota fill. Loads never differ by more than one round, and a pet's rounds stay with one carer when possible. Library recommendation (Timefold, LP solvers, FullCalendar or react-big-calendar, BullMQ) is in the server README
- `PUT /api/test/clock` pins the hotel's "today" for tests. `POST /api/test/reset` also resets the hotel
- UI: in-house design system with tokens, dark mode, responsive down to phone width, accessible dialogs, toasts and inline field errors. Screenshots are in [docs/hotel.md](docs/hotel.md)
- Built test-first: 17 commits, each on green

### Test strength
- Hotel UI tests run against the **real hotel API** in-process, with a cookie jar, not a mocked `fetch`. They exercise real validation, permissions and scheduling
- The commit gate runs typecheck plus the tests. It caught two timing-sensitive assertions, both fixed by waiting on what the user sees
- Browser journeys (`hotel` Playwright project) on a pinned date: admin creates and archives staff, front desk checks guests in and out and registers an owner, pet and booking, front desk schedules and rebalances, staff complete a round with a photo, staff are kept off other pages

### Test coverage
- Server unit: 301, of which 118 are hotel domain and API and 61 are hotel UI · framework unit: 66 · healer integration: 14 · E2E: 20 specs × 3 versions = 60, plus 9 hotel journeys
- Total: 450 tests, all passing

### Limitations
- Hotel data, photos and sessions live in memory and reset on restart (queue S4, S5)
- Test-support routes are open on any running server (queue S1)
- The hotel has a single UI version, so it is not yet part of the self-healing demo (queue T9)
- "Today" uses the server's local time zone (queue S7)
- Improvements with feasibility notes are in [queue.md](queue.md)

---

## 2026-11-20 08:22 EST

### Changes
- Refactor: named save/delete handlers in the query layouts, `testSupportRoutes` in its own module, `VersionedLayout` removed, shared page-object actions (`click`, `fill`, `numbersIn`, ...)
- Bug fix (found by a new test): concurrent writes to the filesystem store could fail with `ENOENT`/`EPERM`, because two writes in the same millisecond shared one temp file. Now uses unique temp names, a per-file write queue and a jittered retry
- Bug fix (found by a new test): server validation errors showed as "Request failed (400)". The UI now shows field messages, for example "name is required"

### Test strength
- E2E: every test now checks that v1 records 0 heals (proving the selectors are right) and v2/v3 record at least 1 (proving a pass isn't accidental), and that annotations match the heal events
- Server: added repository isolation (returned records are copies, ids can't be changed), validation edge cases, rounding, asset serving, persistence after update and delete, UI error display, Cancel/Keep paths in all 3 layouts, and `useUiVersion` behaviour when offline and after unmount
- Framework: added concurrent filesystem writes, remote 500 errors, custom weights, strict thresholds, stale-cache recovery, skipped duplicate baseline writes
- Checked by mutation: 7 deliberate bugs injected, all 7 caught

### Test coverage
- Server unit: 116 · framework unit: 66 · healer integration: 14 · E2E: 20 specs × 3 versions = 60
- Total: 256 tests, all passing

---

## 2026-11-20 08:02 EST

### Server (`server-in-test`)
- Node + Express 5 API: login, record CRUD with text and status filters, report aggregation, test data reset
- Runtime UI switch: `GET`/`PUT /api/ui-version`. Open pages poll it and swap layouts live, with no restart or reload
- Three React SPAs (functional components and hooks): login, query (results table), report
- Three layouts per app:
  - login: classic form, card, split screen
  - query: table with `⋯` menu and modals, div-grid with popover and inline panels, cards with a details/edit/delete drawer
  - report: metric cards, dark sidebar, KPI tiles with a bar chart
- Footer v1/v2/v3 buttons switch the version manually
- Client-side CSV export of the report
- In-memory data with a seed. Demo user `admin` / `password123`
- One `npm run serve` builds the apps and serves the API and SPAs on port 3000

### Test framework (`e2e-framework`)
- Self-healing locators for Playwright: `locate`, `locateAll` (collections) and scoped lookups (inside a row)
- Fingerprints elements in the browser: tag, role, attributes, accessible name, text, labels, ancestors
- Weighted scoring over 9 features. Accepts a candidate at ≥ 0.6, or at ≥ 0.45 with a clear lead over the runner-up
- Handles changing values (`dynamicText`: compares value format plus label) and late-rendering elements (rescans until a timeout)
- Healed selectors cached per worker and checked again before reuse
- Failure messages list the top 3 candidates with score breakdowns
- Element store API addressed as page → element. Backends: filesystem (default), remote HTTP plus a store server, MongoDB-style document store, memory
- Playwright fixtures: worker-scoped healer and store, plus per-test `self-healed` annotations and a JSON attachment
- Projects: `v1-baseline` records fingerprints. `v2-healed` and `v3-healed` must heal from them
- Page objects (factory functions, v1 selectors only): login, results, report
- `npm run screenshots` regenerates the [side-by-side comparison of all UI versions](docs/ui-versions.md)

### Test coverage
- Server unit tests: 90 (Vitest) covering repository, validation, auth, report, HTTP API, version endpoint, and React components across all 3 layouts
- Framework unit tests: 61 covering similarity, scoring, a store contract run against all 4 backends, store config, store server auth
- Healer integration tests: 11 (Playwright, inline HTML) covering baseline capture, healing, caching, late render, collections, scopes, values, failure cases
- E2E: 20 specs × 3 UI versions = 60
  - login: 5
  - results: 10 (filter, create, read, update, delete)
  - report: 5 (metrics, owners, refresh, CSV)
- Total: 222 tests, all passing

### Limitations
- Synonyms don't heal ("Total amount" → "Total value"). Matching is lexical and structural, not semantic
- Flow changes (an element that now needs an extra click) can't be healed. Page objects have to change
- Every element needs a baseline captured on a working UI first
- Thresholds and weights are tuned on 3 sample redesigns and may need adjusting for real apps
- Elements with weak identity (no role, label or classes) heal poorly. The sample apps lean on semantic markup
- Collection healing compares structure only and can't tell apart two lists with similar structure
- E2E runs serially (`workers: 1`) because the sample server keeps shared in-memory state, including the UI version
- Healed selectors are positional (`nth-of-type`), so they can go stale. Each reuse checks them again, and a stale one costs a rescan
- Healing isn't persisted as a code fix. Someone still has to update the page object selectors
