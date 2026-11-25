*** Settings ***
Documentation       Report page: summary metrics, per-owner breakdown, refresh and CSV export.
Resource            ../resources/ReportPage.resource
Test Setup          Run Keywords    Prepare Sample App    AND    Open Report Page


*** Test Cases ***
Shows Summary Metrics That Match The API
    ${expected}=    Get Report From Api
    Metric Should Be    totalRecords    ${expected}[totalRecords]
    Metric Should Be    totalAmount    ${expected}[totalAmount]
    Metric Should Be    averageAmount    ${expected}[averageAmount]

Shows Record Counts Per Status
    Metric Should Be    active    3
    Metric Should Be    inactive    1
    Metric Should Be    pending    2

Breaks Totals Down By Owner
    Owner Summary Should Be    alice    2    1650
    Owner Summary Should Be    bob    2    3000
    Owner Count Should Be    4

Refreshes To Include Newly Created Records
    Create Record Via Api    Eta Expansion    erin    active    200
    Refresh Report
    Metric Should Be    totalRecords    7
    Metric Should Be    active    4
    Owner Summary Should Be    erin    1    200

Exports The Report As CSV
    ${csv}=    Export Report As CSV
    Should Contain    ${csv}    totalRecords,6
    Should Contain    ${csv}    alice,2,1650
