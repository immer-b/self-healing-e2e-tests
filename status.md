# Project status log

Running log of how the project evolves. Newest entry first.

---

## Improvement queue

Planned improvements for the server and the tests, written after the pet hotel was added (2026-11-20). For each item:

- **Doable?** says whether it can be done with reasonable assumptions. **Yes** means the assumption shown is safe to make without asking. **Decision** means someone has to choose first.
- **Size:** S is under half a day, M is about a day, L is several days.
- **Status:** Queued, In progress, Done (with the date), or Needs decision.

The order within each list is the suggested priority.

### Server and app

| # | Status | Item | Why | Doable? | Assumption | Size |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Done 2026-11-20 | Disable `/api/test/*` unless `ENABLE_TEST_ROUTES=1` | Today anyone can reset all data or move the clock on a deployed server | Yes | Playwright's `webServer` and the screenshot scripts set the flag. `npm run serve` stays open for local demos | S |
| S2 | Done 2026-11-20 | Rate-limit sign-in and lock out after repeated failures | Stops password guessing | Yes | 5 failures per username and IP within 15 minutes means a 15-minute lockout. Kept in memory like the rest of the data | S |
| S3 | Done 2026-11-20 | Check `Origin` on state-changing requests and add security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`) | Defence in depth on top of `SameSite=Strict` cookies | Yes | Same-origin only. CSP allows `self` plus `blob:`/`data:` images | S |
| S4 | Done 2026-11-20 | Persist data in SQLite (`node:sqlite`) behind the existing entity store interface | Data is lost on restart. This is the biggest gap to production | Yes | One file under `server-in-test/data/`. The store interface stays the same, so the domain code and tests keep working. Tests keep using the in-memory store | L |
| S5 | Done 2026-11-20 (disk folder; 1600 px browser downscale instead of separate thumbnails) | Store photos on disk (or S3-compatible storage) and generate thumbnails | Photos live in memory now, and full-size images are slow on phones | Yes | Disk under `data/photos/`. Thumbnails are 480 px JPEG made in the browser before upload, so no native image library is needed | M |
| S6 | Done 2026-11-20 | Force a password change on first sign-in with a temporary password, and let staff change their own password | Admins currently know everyone's password | Yes | A `mustChangePassword` flag set on create and on admin reset | M |
| S7 | Done 2026-11-20 | Hotel time zone setting instead of the server's local time | "Today" is wrong if the server runs in another zone | Yes | A `HOTEL_TZ` environment variable, defaulting to `America/Los_Angeles` (the seeded addresses are in Oregon) | S |
| S8 | Done 2026-11-20 | Overdue rounds: flag pending rounds past their slot time on the schedule and in the queue | The front desk can't see work slipping | Yes | Overdue means 2 hours past the slot time (10:00 AM and 7:00 PM) | S |
| S9 | Done 2026-11-20 | Generate the day's rounds automatically each morning | Someone has to remember to press Generate | Yes | 6:00 AM in the hotel time zone, for all active staff. The front desk can still rebalance | S |
| S10 | Done 2026-11-20 | Edit a stay: extend, shorten or change room, with the same overlap rules | Today the only option is cancel and rebook | Yes | Changes after check-in are allowed but logged. Future rounds are regenerated for the new dates | M |
| S11 | Done 2026-11-20 | Pagination and date-range filters for the change log and long lists | The audit log grows without bound | Yes | Cursor pagination with 50 per page, newest first | S |
| S12 | Done 2026-11-20 | Export the change log and a pet's notes as CSV or PDF | Legal requests need a portable record | Yes | CSV first, generated on the client like the report app does | S |
| S13 | Done 2026-11-20 | Note addenda: append a correction linked to an earlier note | Notes can't be edited (correct), but mistakes need a visible fix | Yes | An addendum is a new note with `amends: noteId`, shown under the original | S |
| S14 | Done 2026-11-20 | Live updates on the schedule and queue (Server-Sent Events) | Staff need Refresh to see new or reassigned rounds | Yes | SSE stream of change events, with polling as the fallback | M |
| S15 | Needs decision | Shift roster saved per day (who is working) instead of ticking checkboxes each time | The on-shift selection is lost after generating | Decision | Needs rules: shift times, partial shifts, whether maintenance staff take rounds. Fallback assumption: one saved list per date | M |
| S16 | Needs decision | Constraint-based scheduling (skills, hours, zones) with Timefold or an LP solver | Needed once rules go beyond even counts. See the recommendation in the server README | Decision | Depends on S15 and on which constraints matter | L |
| S17 | Partly done 2026-11-20 (fields; vaccine policy needs decision) | Richer pet profiles: date of birth, weight, vet, vaccinations with expiry, profile photo | Real intake asks for these | Partly | Fields: yes. Blocking check-in on expired vaccines needs a policy decision | M |
| S18 | Done 2026-11-20 | Duplicate-owner warning when the name, email or phone matches an existing owner | Avoids split histories for returning customers | Yes | Warn but allow saving | S |
| S19 | Done 2026-11-20 | Request ids, structured JSON logs and a `/healthz` endpoint | Needed to operate it | Yes | Log to stdout. Health checks the data store only | S |
| S20 | Done 2026-11-20 (hand-written spec checked against the router instead of a zod rewrite) | OpenAPI description generated from the validators | Lets other clients and contract tests use the API | Yes | Add `zod` and derive both validation and the spec from it | M |
| S21 | Done 2026-11-20 | Manual light/dark toggle (the app currently follows the OS setting) | User preference | Yes | Remembered per browser in `localStorage` | S |
| S22 | Done 2026-11-20 (installable, offline reading, queued ticks and notes; photos and completion need a connection) | Installable app (PWA) with offline drafts for staff on phones | Rooms may have weak Wi-Fi | Yes | Cache the app shell. Queue checklist, note and photo writes while offline | M |
| S23 | Needs decision | Billing at check-out (nights × rate, extras, payments) | Natural next feature | Decision | Needs tax rules, payment provider and refund policy | L |
| S24 | Needs decision | Owner notifications (pick-up reminders, photo updates) by SMS or email | Customer experience | Decision | Needs a provider and consent rules | M |

### Tests

| # | Status | Item | Why | Doable? | Assumption | Size |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Done 2026-11-20 | Property-based tests for `assignEvenly` (fast-check): for any input, loads differ by at most 1, nothing is lost or duplicated, and the result is deterministic | The core fairness promise is checked only on hand-picked cases | Yes | Add `fast-check` as a dev dependency | S |
| T2 | Done 2026-11-20 | Session expiry and cookie tests driven by the pinned clock (12-hour TTL, logout revokes, reset revokes) | The TTL code path has no test | Yes | Uses the existing `clock.set` | S |
| T3 | Done 2026-11-20 (light and dark; fixed the contrast issues it found) | Accessibility checks with `@axe-core/playwright` on every hotel page | The UI relies on roles and labels; axe confirms they hold | Yes | Fail on serious and critical issues only | S |
| T4 | Done 2026-11-20 (found and fixed a phone layout overflow) | Mobile Playwright project (Pixel 7) for the general staff journey | Staff work on phones. Only a screenshot covers that today | Yes | Reuse `staff.spec.ts` with a device preset | S |
| T5 | Done 2026-11-20 (opt-in VISUAL=1; Linux baselines to be created by CI) | Visual regression (`toHaveScreenshot`) for key hotel pages on the pinned clock | Catches CSS regressions the role-based tests can't see | Yes | Baselines from Linux CI only, to avoid font differences between operating systems | S |
| T6 | Queued | Test data builders for the hotel (`aPet()`, `aStay()`) instead of seed ids like `emp-3` and `pet-1` | Tests break if the seed changes | Yes | Keep a few seed-based smoke tests | M |
| T7 | Queued | Coverage report with thresholds (`@vitest/coverage-v8`) | Makes gaps visible | Yes | 90% lines on `src/server/hotel`, 80% on the hotel UI | S |
| T8 | Queued | CI workflow: typecheck, unit, e2e, upload the Playwright report, repeat UI tests 3 times to catch flakiness | Nothing runs automatically today | Yes | GitHub Actions on Ubuntu with Node 22 | S |
| T9 | Queued | Versioned hotel layouts (v2/v3 for Today, Schedule and Queue) with page objects that go through the healer | Takes the self-healing demo from toy pages to a realistic app | Yes | Follow the existing `LAYOUTS[version]` pattern. Start with the staff queue and round pages | L |
| T10 | Queued | Parallel e2e: one server per Playwright worker | `workers: 1` because data and UI version are global | Yes | Start the server per worker on `3100 + workerIndex` from a worker fixture | M |
| T11 | Queued | Mutation testing (Stryker) on `src/server/hotel` | Shows which assertions are weak, as was done by hand for the framework | Yes | Run nightly, not on every commit | M |
| T12 | Queued | API contract snapshot: fail when a response shape changes without the UI types changing | The UI and server share TypeScript types, but the joined views (`pet`, `owner`, `room`) are built by hand | Yes | Snapshot of the response keys per endpoint | S |
| T13 | Queued | Dark-mode screenshots and a contrast check | Dark mode exists but is never captured | Yes | Add `colorScheme: 'dark'` variants to the screenshot script | S |

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
- Improvements with feasibility notes are in the [improvement queue](#improvement-queue) at the top of this file

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
