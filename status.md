# Project status log

Running log of how the project evolves. Newest entry first.

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
