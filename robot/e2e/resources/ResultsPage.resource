*** Settings ***
Documentation       Results (query) page object: filtering plus CRUD through each row's "⋯" actions.
...                 Selectors target UI v1 (table, dropdown menu, modals). v2 (div grid, popover,
...                 inline panels) and v3 (cards, drawer) are healed from the v1 fingerprints.
Resource            common.resource


*** Variables ***
&{ROW_ACTION_LABELS}    view=View    edit=Edit    delete=Delete


*** Keywords ***
Open Results Page
    Go To    ${BASE_URL}/query/

# -- filtering ---------------------------------------------------------------------------------

Search Records
    [Arguments]    ${text}
    ${field}=    Heal Element    results    search    css:#search
    Input Text    ${field}    ${text}

Filter By Status
    [Arguments]    ${status}
    ${filter}=    Heal Element    results    statusFilter    css:#status-filter
    Select From List By Value    ${filter}    ${status}

Result Count
    ${counter}=    Heal Element    results    resultCount    css:#result-count    dynamic_text=${TRUE}
    ${text}=    Get Text    ${counter}
    ${count}=    First Number In    ${text}
    RETURN    ${count}

Result Count Should Be
    [Arguments]    ${expected}
    Wait Until Keyword Succeeds    5s    200ms    Result Count Is    ${expected}

Result Count Is
    [Arguments]    ${expected}
    ${count}=    Result Count
    Should Be Equal As Integers    ${count}    ${expected}

# -- rows --------------------------------------------------------------------------------------

Rows
    ${rows}=    Heal Elements    results    rows    css:#results-table tbody tr[data-id]
    RETURN    ${rows}

Row
    [Arguments]    ${name}
    ${rows}=    Rows
    ${row}=    Element Containing Text    ${rows}    ${name}
    RETURN    ${row}

Row Should Be Visible
    [Arguments]    ${name}
    Wait Until Keyword Succeeds    5s    200ms    Visible Row Exists    ${name}

Visible Row Exists
    [Arguments]    ${name}
    ${row}=    Row    ${name}
    Element Should Be Visible    ${row}

Row Should Contain
    [Arguments]    ${name}    @{texts}
    Wait Until Keyword Succeeds    5s    200ms    Row Contains    ${name}    @{texts}

Row Contains
    [Arguments]    ${name}    @{texts}
    ${row}=    Row    ${name}
    FOR    ${text}    IN    @{texts}
        Element Should Contain    ${row}    ${text}
    END

Row Count Should Be
    [Arguments]    ${expected}
    Wait Until Keyword Succeeds    5s    200ms    Row Count Is    ${expected}

Row Count Is
    [Arguments]    ${expected}
    ${rows}=    Rows
    Length Should Be    ${rows}    ${expected}

No Row Should Contain
    [Arguments]    ${name}
    Wait Until Keyword Succeeds    5s    200ms    No Row Contains    ${name}

No Row Contains
    [Arguments]    ${name}
    ${rows}=    Rows
    ${texts}=    Texts Of Elements    ${rows}
    ${all}=    Catenate    SEPARATOR=\n    @{texts}
    Should Not Contain    ${all}    ${name}

# -- CRUD through the row actions ---------------------------------------------------------------

Choose Row Action
    [Arguments]    ${name}    ${action}
    ${row}=    Row    ${name}
    ${menu}=    Heal Element    results    row.actions    css:button.row-menu    scope=${row}
    Click Element    ${menu}
    ${label}=    Set Variable    ${ROW_ACTION_LABELS}[${action}]
    ${item}=    Heal Element    results    row.menu.${action}
    ...    xpath://*[contains(concat(' ', @class, ' '), ' row-menu-list ')]//button[normalize-space()='${label}']
    Click Element    ${item}

Fill Record Form
    [Documentation]    Fills the given fields (the others keep their value) and saves.
    [Arguments]    ${name}=${NONE}    ${owner}=${NONE}    ${status}=${NONE}    ${amount}=${NONE}
    IF    $name is not None
        ${field}=    Heal Element    results    form.name    css:#record-name
        Input Text    ${field}    ${name}
    END
    IF    $owner is not None
        ${field}=    Heal Element    results    form.owner    css:#record-owner
        Input Text    ${field}    ${owner}
    END
    IF    $status is not None
        ${field}=    Heal Element    results    form.status    css:#record-status
        Select From List By Value    ${field}    ${status}
    END
    IF    $amount is not None
        ${field}=    Heal Element    results    form.amount    css:#record-amount
        Input Text    ${field}    ${amount}
    END
    ${save}=    Heal Element    results    form.save    css:#save-record
    Click Element    ${save}

Create Record
    [Arguments]    ${name}    ${owner}    ${status}    ${amount}
    ${add}=    Heal Element    results    addRecord    css:#add-record
    Click Element    ${add}
    Fill Record Form    name=${name}    owner=${owner}    status=${status}    amount=${amount}

Details Of Record Should Contain
    [Arguments]    ${name}    @{texts}
    Choose Row Action    ${name}    view
    ${details}=    Heal Element    results    details    css:#details-modal    dynamic_text=${TRUE}
    FOR    ${text}    IN    @{texts}
        Element Should Contain    ${details}    ${text}
    END

Edit Record
    [Arguments]    ${record}    &{changes}
    Choose Row Action    ${record}    edit
    Fill Record Form    &{changes}

Delete Record
    [Arguments]    ${name}
    Choose Row Action    ${name}    delete
    ${confirm}=    Heal Element    results    confirmDelete    css:#confirm-delete
    Click Element    ${confirm}
