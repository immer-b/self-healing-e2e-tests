*** Settings ***
Documentation       Self-healing e2e suites for the login, results and report sample apps.
...                 One sample server and one Chrome serve the whole run.
Resource            ../resources/common.resource
Suite Setup         Start Sample App And Browser
Suite Teardown      Stop Sample App And Browser
Test Teardown       Verify Healing
