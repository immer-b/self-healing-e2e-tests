*** Settings ***
Documentation       Login page.
Resource            ../resources/LoginPage.resource
Test Setup          Run Keywords    Prepare Sample App    AND    Open Login Page


*** Test Cases ***
Signs In With Valid Credentials And Greets The User
    Log In As    admin    password123
    Welcome Message Should Contain    Administrator

Shows An Error For Invalid Credentials
    Log In As    admin    wrong-password
    Error Message Should Be    Invalid username or password

Requires Both Username And Password
    Submit Login
    Error Message Should Be    Username and password are required

Heals v1 Selectors Only When The UI Has Changed
    Log In As    admin    password123
    Welcome Message Should Contain    Administrator
    IF    ${UI_VERSION} != 1
        Healed Keys Should Include    username    password    submit    welcomeMessage
    END

Navigates To The Results Page After Signing In
    Log In As    admin    password123
    Open Results From Login
    Wait Until Location Contains    /query/
