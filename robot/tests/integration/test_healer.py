"""The healer against inline HTML fixtures in a real headless Chrome (chromedriver via Selenium Manager)."""

import re
from urllib.parse import quote

import pytest
from selenium import webdriver

from self_healing.healer import Healer, HealerSettings, HealingError, LocateSpec
from self_healing.store import MemoryStore

pytestmark = pytest.mark.browser

LOGIN_V1 = """
  <main><h1>Sign in</h1>
    <form id="login-form">
      <label for="username">Username</label><input id="username" name="username">
      <label for="password">Password</label><input id="password" name="password" type="password">
      <button id="login-button" type="submit">Log in</button>
    </form>
  </main>"""

LOGIN_V2 = """
  <div class="card"><h2>Welcome back</h2>
    <form class="auth-form">
      <div class="field"><input class="input-user" name="user" placeholder="Username"></div>
      <div class="field"><input class="input-pass" name="pass" type="password" placeholder="Password"></div>
      <a href="#forgot">Forgot password?</a>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>
  </div>"""

TABLE_V1 = """
  <table id="results"><tbody>
    <tr data-id="1"><td>Alpha</td><td>alice</td><td><button class="row-menu" aria-label="Row actions">⋯</button></td></tr>
    <tr data-id="2"><td>Beta</td><td>bob</td><td><button class="row-menu" aria-label="Row actions">⋯</button></td></tr>
    <tr data-id="3"><td>Gamma</td><td>carol</td><td><button class="row-menu" aria-label="Row actions">⋯</button></td></tr>
  </tbody></table>"""

CARDS_V3 = """
  <h1>Explorer</h1>
  <ul class="card-list">
    <li class="result-card"><h3>Alpha</h3><p>Owner: alice</p><button class="card-more" aria-label="More actions">⋮</button></li>
    <li class="result-card"><h3>Beta</h3><p>Owner: bob</p><button class="card-more" aria-label="More actions">⋮</button></li>
    <li class="result-card"><h3>Gamma</h3><p>Owner: carol</p><button class="card-more" aria-label="More actions">⋮</button></li>
  </ul>
  <button class="fab" aria-label="Create record">+</button>"""

METRICS_V1 = """
  <div class="metric-card" id="metric-total"><span class="label">Total records</span><span class="value">6</span></div>
  <div class="metric-card" id="metric-pending"><span class="label">Pending</span><span class="value">2</span></div>"""

METRICS_V2 = "<dl><dt>Pending</dt><dd>2</dd><dt>Records</dt><dd>6</dd><dt>Total value</dt><dd>$7,800</dd></dl>"

USERNAME = LocateSpec("username", "#username")
PASSWORD = LocateSpec("password", "#password")
SUBMIT = LocateSpec("submit", "#login-button")
ROWS = LocateSpec("rows", "#results tbody tr")


@pytest.fixture(scope="session")
def driver():
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    chrome = webdriver.Chrome(options=options)
    yield chrome
    chrome.quit()


@pytest.fixture
def store():
    return MemoryStore()


@pytest.fixture
def events():
    return []


@pytest.fixture
def healer_for(driver, store, events):
    def make(**settings):
        options = {"primary_timeout": 0.3, "heal_timeout": 1.5, **settings}
        return Healer(store, HealerSettings(**options), on_heal=events.append).for_page(driver, "fixture")
    return make


@pytest.fixture
def show(driver):
    def set_content(html: str):
        driver.get("data:text/html;charset=utf-8," + quote(f"<!doctype html><html><body>{html}</body></html>"))
    return set_content


def text(driver, element):
    return driver.execute_script("return arguments[0].innerText", element)


class TestBaselineCapture:
    def test_records_a_fingerprint_when_the_primary_selector_matches(self, show, healer_for, store, events):
        show(LOGIN_V1)
        healer_for().locate(USERNAME).send_keys("admin")

        record = store.get("fixture", "username")
        assert record["selector"] == "#username"
        fingerprint = record["fingerprint"]
        assert (fingerprint["tag"], fingerprint["role"], fingerprint["id"]) == ("input", "textbox", "username")
        assert fingerprint["accessibleName"] == "Username"
        assert fingerprint["attributes"]["type"] == "text"
        assert fingerprint["path"][0] == "form"
        assert events == []

    def test_does_not_rewrite_an_unchanged_baseline(self, show, driver, store):
        puts = []
        counting = MemoryStore()
        counting.put = lambda record: (puts.append(record), store.put(record))  # type: ignore[method-assign]
        show(LOGIN_V1)
        page = Healer(counting, HealerSettings(primary_timeout=0.3)).for_page(driver, "fixture")
        page.locate(USERNAME)
        page.locate(USERNAME)
        assert len(puts) == 1
        driver.execute_script("document.querySelector('#username').setAttribute('placeholder', 'Your name')")
        page.locate(USERNAME)
        assert len(puts) == 2


class TestHealing:
    def test_heals_inputs_and_buttons_whose_ids_and_classes_changed(self, show, healer_for, driver, events):
        show(LOGIN_V1)
        v1 = healer_for()
        for spec in (USERNAME, PASSWORD, SUBMIT):
            v1.locate(spec)

        show(LOGIN_V2)
        v2 = healer_for()
        v2.locate(USERNAME).send_keys("admin")
        v2.locate(PASSWORD).send_keys("secret")
        submit = v2.locate(SUBMIT)

        assert driver.find_element("css selector", ".input-user").get_attribute("value") == "admin"
        assert driver.find_element("css selector", ".input-pass").get_attribute("value") == "secret"
        assert submit.text == "Sign in"
        assert [e.element_key for e in events] == ["username", "password", "submit"]
        assert (events[0].page_id, events[0].original_selector) == ("fixture", "#username")
        assert events[0].score > 0.5

    def test_keeps_the_baseline_unless_update_baseline_on_heal_is_enabled(self, show, healer_for, store):
        show(LOGIN_V1)
        healer_for().locate(PASSWORD)
        show(LOGIN_V2)
        healer_for().locate(PASSWORD)
        assert store.get("fixture", "password")["fingerprint"]["id"] == "password"

        healer_for(update_baseline_on_heal=True).locate(PASSWORD)
        assert store.get("fixture", "password")["fingerprint"]["classes"] == ["input-pass"]

    def test_reuses_a_healed_selector_and_reports_a_cache_hit(self, show, healer_for, events):
        show(LOGIN_V1)
        healer_for().locate(USERNAME)
        show(LOGIN_V2)
        page = healer_for()
        page.locate(USERNAME)
        page.locate(USERNAME)
        assert [e.from_cache for e in events] == [False, True]

    def test_re_heals_when_a_cached_selector_points_at_a_different_element(self, show, healer_for, events):
        show(LOGIN_V1)
        healer_for().locate(PASSWORD)
        show(LOGIN_V2)
        page = healer_for()
        page.locate(PASSWORD)
        # Same structure, but the fields swapped places: the cached positional selector is now wrong.
        swapped = re.sub(
            r'<div class="field"><input class="input-user"[^>]*></div>\s*<div class="field"><input class="input-pass"[^>]*></div>',
            '<div class="field"><input class="input-pass" name="pass" type="password" placeholder="Password"></div>'
            '<div class="field"><input class="input-user" name="user" placeholder="Username"></div>',
            LOGIN_V2,
        )
        show(swapped)
        assert page.locate(PASSWORD).get_attribute("type") == "password"
        assert [e.from_cache for e in events] == [False, False]

    def test_waits_for_an_element_that_renders_late(self, show, healer_for):
        show(LOGIN_V1)
        healer_for().locate(SUBMIT)
        show("""<div id="app"></div><script>
          setTimeout(() => { document.getElementById('app').innerHTML =
            '<form><button type="submit" class="go">Sign in</button></form>'; }, 500);
        </script>""")
        assert healer_for().locate(SUBMIT).get_attribute("class") == "go"

    def test_fails_with_a_helpful_message_when_there_is_no_baseline(self, show, healer_for):
        show(LOGIN_V2)
        with pytest.raises(HealingError, match=r"fixture\.username.*#username.*no baseline"):
            healer_for().locate(USERNAME)

    def test_fails_when_no_candidate_is_similar_enough(self, show, healer_for):
        show(LOGIN_V1)
        healer_for().locate(PASSWORD)
        show("<p>Maintenance in progress</p>")
        with pytest.raises(HealingError, match="could not heal"):
            healer_for().locate(PASSWORD)

    def test_respects_stricter_acceptance_thresholds(self, show, healer_for):
        show(LOGIN_V1)
        healer_for().locate(SUBMIT)
        show(LOGIN_V2)
        with pytest.raises(HealingError, match="Top candidates"):
            healer_for(threshold=0.99, min_score=0.99, heal_timeout=0.3).locate(SUBMIT)

    def test_supports_xpath_primary_selectors(self, show, healer_for, store):
        show(LOGIN_V1)
        assert healer_for().locate(LocateSpec("submit", "xpath://button[normalize-space()='Log in']")).text == "Log in"
        assert store.get("fixture", "submit")["fingerprint"]["id"] == "login-button"


class TestCollectionsAndScopes:
    def test_heals_a_collection_of_rows_into_the_matching_list_items(self, show, healer_for, driver):
        show(TABLE_V1)
        assert len(healer_for().locate_all(ROWS)) == 3

        show(CARDS_V3)
        rows = healer_for().locate_all(ROWS)
        assert len(rows) == 3
        beta = next(r for r in rows if "Beta" in text(driver, r))
        assert "bob" in text(driver, beta)

    def test_excludes_same_tag_siblings_with_extra_classes_such_as_a_header_row(self, show, healer_for):
        show(TABLE_V1)
        healer_for().locate_all(ROWS)
        show("""
          <div role="grid" class="data-grid">
            <div role="row" class="grid-row grid-header"><span>Name</span><span>Owner</span><span></span></div>
            <div role="row" class="grid-row"><span>Alpha</span><span>alice</span><span><button class="kebab" aria-label="More options">…</button></span></div>
            <div role="row" class="grid-row"><span>Beta</span><span>bob</span><span><button class="kebab" aria-label="More options">…</button></span></div>
          </div>""")
        assert len(healer_for().locate_all(ROWS)) == 2

    def test_heals_an_element_inside_a_scope_such_as_a_single_row(self, show, healer_for, driver):
        show(TABLE_V1)
        v1 = healer_for()
        alpha = next(r for r in v1.locate_all(ROWS) if "Alpha" in text(driver, r))
        v1.locate(LocateSpec("rowActions", "button.row-menu", scope=alpha))

        show(CARDS_V3)
        v3 = healer_for()
        gamma = next(r for r in v3.locate_all(ROWS) if "Gamma" in text(driver, r))
        actions = v3.locate(LocateSpec("rowActions", "button.row-menu", scope=gamma))
        assert actions.get_attribute("aria-label") == "More actions"
        assert "Gamma" in driver.execute_script("return arguments[0].closest('li').textContent", actions)

    def test_heals_a_value_element_using_its_label_context(self, show, healer_for):
        spec = LocateSpec("totalRecords", "#metric-total .value", dynamic_text=True)
        show(METRICS_V1)
        healer_for().locate(spec)
        show(METRICS_V2)
        assert healer_for().locate(spec).text == "6"
