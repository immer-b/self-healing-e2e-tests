*** Settings ***
Documentation       Results page: filtering, and CRUD through each row's actions menu.
Resource            ../resources/ResultsPage.resource
Test Setup          Run Keywords    Prepare Sample App    AND    Open Results Page


*** Variables ***
@{SEEDED_NAMES}     Alpha Project    Beta Launch    Gamma Audit    Delta Migration    Epsilon Research    Zeta Rollout


*** Test Cases ***
Lists Every Record With A Result Count
    [Tags]    filtering
    Result Count Should Be    6
    FOR    ${name}    IN    @{SEEDED_NAMES}
        Row Should Be Visible    ${name}
    END

Filters By Free Text
    [Tags]    filtering
    Search Records    beta
    Result Count Should Be    1
    Row Count Should Be    1
    Row Should Be Visible    Beta Launch

Filters By Status
    [Tags]    filtering
    Filter By Status    pending
    Result Count Should Be    2
    Row Count Should Be    2
    Row Should Be Visible    Gamma Audit
    Row Should Be Visible    Epsilon Research

Reports Zero Results When Nothing Matches
    [Tags]    filtering
    Search Records    no-such-record
    Result Count Should Be    0

Creates A Record
    [Tags]    crud
    Create Record    Omega Pilot    olga    pending    99
    Row Should Contain    Omega Pilot    olga    pending    $99
    Result Count Should Be    7

Reads A Record's Details
    [Tags]    crud
    Details Of Record Should Contain    Beta Launch    bob    inactive    $800

Updates A Record
    [Tags]    crud
    Edit Record    Alpha Project    name=Alpha Renamed    amount=1500
    Row Should Contain    Alpha Renamed    $1,500
    No Row Should Contain    Alpha Project

Deletes A Record After Confirmation
    [Tags]    crud
    Delete Record    Gamma Audit
    Result Count Should Be    5
    No Row Should Contain    Gamma Audit

Row Actions Work On Any Row: Delta Migration
    [Tags]    crud
    Details Of Record Should Contain    Delta Migration    carol

Row Actions Work On Any Row: Zeta Rollout
    [Tags]    crud
    Details Of Record Should Contain    Zeta Rollout    bob
