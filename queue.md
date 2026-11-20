# Improvement queue

Planned improvements for the server and the tests, written after the pet hotel was added (2026-11-20). For each item:

- **Doable?** says whether it can be done with reasonable assumptions. **Yes** means the assumption shown is safe to make without asking. **Decision** means someone has to choose first.
- **Size:** S is under half a day, M is about a day, L is several days.

The order within each list is the suggested priority.

## Server and app

| # | Item | Why | Doable? | Assumption | Size |
| --- | --- | --- | --- | --- | --- |
| S1 | Disable `/api/test/*` unless `ENABLE_TEST_ROUTES=1` | Today anyone can reset all data or move the clock on a deployed server | Yes | Playwright's `webServer` and the screenshot scripts set the flag. `npm run serve` stays open for local demos | S |
| S2 | Rate-limit sign-in and lock out after repeated failures | Stops password guessing | Yes | 5 failures per username and IP within 15 minutes means a 15-minute lockout. Kept in memory like the rest of the data | S |
| S3 | Check `Origin` on state-changing requests and add security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`) | Defence in depth on top of `SameSite=Strict` cookies | Yes | Same-origin only. CSP allows `self` plus `blob:`/`data:` images | S |
| S4 | Persist data in SQLite (`node:sqlite`) behind the existing entity store interface | Data is lost on restart. This is the biggest gap to production | Yes | One file under `server-in-test/data/`. The store interface stays the same, so the domain code and tests keep working. Tests keep using the in-memory store | L |
| S5 | Store photos on disk (or S3-compatible storage) and generate thumbnails | Photos live in memory now, and full-size images are slow on phones | Yes | Disk under `data/photos/`. Thumbnails are 480 px JPEG made in the browser before upload, so no native image library is needed | M |
| S6 | Force a password change on first sign-in with a temporary password, and let staff change their own password | Admins currently know everyone's password | Yes | A `mustChangePassword` flag set on create and on admin reset | M |
| S7 | Hotel time zone setting instead of the server's local time | "Today" is wrong if the server runs in another zone | Yes | A `HOTEL_TZ` environment variable, defaulting to `America/Los_Angeles` (the seeded addresses are in Oregon) | S |
| S8 | Overdue rounds: flag pending rounds past their slot time on the schedule and in the queue | The front desk can't see work slipping | Yes | Overdue means 2 hours past the slot time (10:00 AM and 7:00 PM) | S |
| S9 | Generate the day's rounds automatically each morning | Someone has to remember to press Generate | Yes | 6:00 AM in the hotel time zone, for all active staff. The front desk can still rebalance | S |
| S10 | Edit a stay: extend, shorten or change room, with the same overlap rules | Today the only option is cancel and rebook | Yes | Changes after check-in are allowed but logged. Future rounds are regenerated for the new dates | M |
| S11 | Pagination and date-range filters for the change log and long lists | The audit log grows without bound | Yes | Cursor pagination with 50 per page, newest first | S |
| S12 | Export the change log and a pet's notes as CSV or PDF | Legal requests need a portable record | Yes | CSV first, generated on the client like the report app does | S |
| S13 | Note addenda: append a correction linked to an earlier note | Notes can't be edited (correct), but mistakes need a visible fix | Yes | An addendum is a new note with `amends: noteId`, shown under the original | S |
| S14 | Live updates on the schedule and queue (Server-Sent Events) | Staff need Refresh to see new or reassigned rounds | Yes | SSE stream of change events, with polling as the fallback | M |
| S15 | Shift roster saved per day (who is working) instead of ticking checkboxes each time | The on-shift selection is lost after generating | Decision | Needs rules: shift times, partial shifts, whether maintenance staff take rounds. Fallback assumption: one saved list per date | M |
| S16 | Constraint-based scheduling (skills, hours, zones) with Timefold or an LP solver | Needed once rules go beyond even counts. See the recommendation in the server README | Decision | Depends on S15 and on which constraints matter | L |
| S17 | Richer pet profiles: date of birth, weight, vet, vaccinations with expiry, profile photo | Real intake asks for these | Partly | Fields: yes. Blocking check-in on expired vaccines needs a policy decision | M |
| S18 | Duplicate-owner warning when the name, email or phone matches an existing owner | Avoids split histories for returning customers | Yes | Warn but allow saving | S |
| S19 | Request ids, structured JSON logs and a `/healthz` endpoint | Needed to operate it | Yes | Log to stdout. Health checks the data store only | S |
| S20 | OpenAPI description generated from the validators | Lets other clients and contract tests use the API | Yes | Add `zod` and derive both validation and the spec from it | M |
| S21 | Manual light/dark toggle (the app currently follows the OS setting) | User preference | Yes | Remembered per browser in `localStorage` | S |
| S22 | Installable app (PWA) with offline drafts for staff on phones | Rooms may have weak Wi-Fi | Yes | Cache the app shell. Queue checklist, note and photo writes while offline | M |
| S23 | Billing at check-out (nights × rate, extras, payments) | Natural next feature | Decision | Needs tax rules, payment provider and refund policy | L |
| S24 | Owner notifications (pick-up reminders, photo updates) by SMS or email | Customer experience | Decision | Needs a provider and consent rules | M |

## Tests

| # | Item | Why | Doable? | Assumption | Size |
| --- | --- | --- | --- | --- | --- |
| T1 | Property-based tests for `assignEvenly` (fast-check): for any input, loads differ by at most 1, nothing is lost or duplicated, and the result is deterministic | The core fairness promise is checked only on hand-picked cases | Yes | Add `fast-check` as a dev dependency | S |
| T2 | Session expiry and cookie tests driven by the pinned clock (12-hour TTL, logout revokes, reset revokes) | The TTL code path has no test | Yes | Uses the existing `clock.set` | S |
| T3 | Accessibility checks with `@axe-core/playwright` on every hotel page | The UI relies on roles and labels; axe confirms they hold | Yes | Fail on serious and critical issues only | S |
| T4 | Mobile Playwright project (Pixel 7) for the general staff journey | Staff work on phones. Only a screenshot covers that today | Yes | Reuse `staff.spec.ts` with a device preset | S |
| T5 | Visual regression (`toHaveScreenshot`) for key hotel pages on the pinned clock | Catches CSS regressions the role-based tests can't see | Yes | Baselines from Linux CI only, to avoid font differences between operating systems | S |
| T6 | Test data builders for the hotel (`aPet()`, `aStay()`) instead of seed ids like `emp-3` and `pet-1` | Tests break if the seed changes | Yes | Keep a few seed-based smoke tests | M |
| T7 | Coverage report with thresholds (`@vitest/coverage-v8`) | Makes gaps visible | Yes | 90% lines on `src/server/hotel`, 80% on the hotel UI | S |
| T8 | CI workflow: typecheck, unit, e2e, upload the Playwright report, repeat UI tests 3 times to catch flakiness | Nothing runs automatically today | Yes | GitHub Actions on Ubuntu with Node 22 | S |
| T9 | Versioned hotel layouts (v2/v3 for Today, Schedule and Queue) with page objects that go through the healer | Takes the self-healing demo from toy pages to a realistic app | Yes | Follow the existing `LAYOUTS[version]` pattern. Start with the staff queue and round pages | L |
| T10 | Parallel e2e: one server per Playwright worker | `workers: 1` because data and UI version are global | Yes | Start the server per worker on `3100 + workerIndex` from a worker fixture | M |
| T11 | Mutation testing (Stryker) on `src/server/hotel` | Shows which assertions are weak, as was done by hand for the framework | Yes | Run nightly, not on every commit | M |
| T12 | API contract snapshot: fail when a response shape changes without the UI types changing | The UI and server share TypeScript types, but the joined views (`pet`, `owner`, `room`) are built by hand | Yes | Snapshot of the response keys per endpoint | S |
| T13 | Dark-mode screenshots and a contrast check | Dark mode exists but is never captured | Yes | Add `colorScheme: 'dark'` variants to the screenshot script | S |
