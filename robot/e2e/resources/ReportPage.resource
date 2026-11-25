*** Settings ***
Documentation       Report page object. Selectors target UI v1 (metric cards and owner table);
...                 v2 (sidebar definition list, owner list) and v3 (KPI tiles, bar chart, icon
...                 buttons) are healed. Metric values are found by their labels because the
...                 numbers themselves change.
Resource            common.resource


*** Variables ***
&{METRIC_SELECTORS}
...    totalRecords=css:#metric-total .value
...    totalAmount=css:#metric-amount .value
...    averageAmount=css:#metric-average .value
...    active=css:#metric-active .value
...    inactive=css:#metric-inactive .value
...    pending=css:#metric-pending .value


*** Keywords ***
Open Report Page
    Go To    ${BASE_URL}/report/

Metric
    [Documentation]    Numeric value of a metric, with currency formatting stripped.
    [Arguments]    ${metric}
    ${value}=    Heal Element    report    metric.${metric}    ${METRIC_SELECTORS}[${metric}]    dynamic_text=${TRUE}
    ${text}=    Get Text    ${value}
    ${number}=    First Number In    ${text}
    RETURN    ${number}

Metric Should Be
    [Arguments]    ${metric}    ${expected}
    Wait Until Keyword Succeeds    5s    200ms    Metric Is    ${metric}    ${expected}

Metric Is
    [Arguments]    ${metric}    ${expected}
    ${value}=    Metric    ${metric}
    Should Be Equal As Integers    ${value}    ${expected}

Owner Rows
    ${rows}=    Heal Elements    report    ownerRows    css:#owner-table tbody tr
    RETURN    ${rows}

Owner Count Should Be
    [Arguments]    ${expected}
    ${rows}=    Owner Rows
    Length Should Be    ${rows}    ${expected}

Owner Summary Should Be
    [Documentation]    Record count and total amount in that owner's row.
    [Arguments]    ${owner}    ${count}    ${amount}
    ${rows}=    Owner Rows
    ${row}=    Element Containing Text    ${rows}    ${owner}
    ${text}=    Get Text    ${row}
    ${numbers}=    Numbers In    ${text}
    Should Be Equal As Integers    ${numbers}[0]    ${count}
    Should Be Equal As Integers    ${numbers}[1]    ${amount}

Refresh Report
    ${button}=    Heal Element    report    refresh    css:#refresh-report
    Click Element    ${button}

Export Report As CSV
    [Documentation]    Clicks the export button and returns the downloaded CSV's content.
    ${file}=    Set Variable    ${DOWNLOAD_DIR}${/}report.csv
    Remove File If Present    ${file}
    ${button}=    Heal Element    report    exportCsv    css:#export-csv
    Click Element    ${button}
    ${csv}=    Wait For Downloaded File    ${file}
    RETURN    ${csv}
