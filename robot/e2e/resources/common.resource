*** Settings ***
Documentation       Shared libraries, variables and test hooks for the e2e suites.
Library             Collections
Library             SeleniumLibrary    timeout=5s
Library             self_healing.SelfHealing    store_dir=${CURDIR}/../../.healing-store
Library             ../libraries/TestServer.py
Library             ../libraries/PageHelpers.py


*** Variables ***
# Which layout of the sample apps to test. The page objects are written against 1 only;
# 2 and 3 must be reached through healed selectors. Set with --variable UI_VERSION:2.
${UI_VERSION}       1
# Set by the suite setup in e2e/__init__.robot.
${BASE_URL}         ${EMPTY}
${DOWNLOAD_DIR}     ${EMPTY}


*** Keywords ***
Start Sample App And Browser
    [Documentation]    Suite setup for the whole run: one server and one browser.
    ${url}=    Start Test Server
    Set Global Variable    ${BASE_URL}    ${url}
    ${downloads}=    New Download Directory
    Set Global Variable    ${DOWNLOAD_DIR}    ${downloads}
    ${options}=    Chrome Options For Tests    ${downloads}
    Open Browser    ${BASE_URL}/login/    chrome    options=${options}

Stop Sample App And Browser
    Close All Browsers
    Stop Test Server

Prepare Sample App
    [Documentation]    Test setup: seeded data and the layout under test.
    Reset Test Data
    Set UI Version    ${UI_VERSION}
    Delete All Cookies

Verify Healing
    [Documentation]    Test teardown. v1 must never heal (the page-object selectors are correct)
    ...    and v2/v3 must heal, so a pass is not an accident of a selector still matching.
    ...    Skipped for failed tests so it never masks the real failure.
    Run Keyword If Test Passed    Healing Should Match UI Version

Healing Should Match UI Version
    ${events}=    Get Heal Events
    IF    ${UI_VERSION} == 1
        Should Be Empty    ${events}    v1 selectors should never need healing
    ELSE
        Should Not Be Empty    ${events}    v${UI_VERSION} should be exercised through healed selectors
    END

Healed Keys Should Include
    [Arguments]    @{keys}
    ${events}=    Get Heal Events
    ${healed}=    Evaluate    [e["elementKey"] for e in $events]
    FOR    ${key}    IN    @{keys}
        List Should Contain Value    ${healed}    ${key}
    END
