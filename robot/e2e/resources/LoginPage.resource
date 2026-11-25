*** Settings ***
Documentation       Login page object. Selectors target UI v1 only; on v2 and v3 the healer
...                 resolves them from the fingerprints recorded during the v1 run.
Resource            common.resource


*** Keywords ***
Open Login Page
    Go To    ${BASE_URL}/login/

Log In As
    [Arguments]    ${username}    ${password}
    ${field}=    Heal Element    login    username    css:#username
    Input Text    ${field}    ${username}
    ${field}=    Heal Element    login    password    css:#password
    Input Password    ${field}    ${password}
    Submit Login

Submit Login
    ${button}=    Heal Element    login    submit    css:#login-button
    Click Element    ${button}

Error Message Should Be
    [Arguments]    ${expected}
    ${message}=    Heal Element    login    errorMessage    css:#error-message
    Element Text Should Be    ${message}    ${expected}

Welcome Message Should Contain
    [Arguments]    ${expected}
    ${message}=    Heal Element    login    welcomeMessage    css:#welcome-message
    Element Should Contain    ${message}    ${expected}

Open Results From Login
    ${link}=    Heal Element    login    resultsLink    css:#results-link
    Click Element    ${link}
