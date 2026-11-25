# playwright

The Playwright + TypeScript flavour of the self-healing tests.

| Folder | What it is |
| --- | --- |
| [`e2e-framework/`](e2e-framework/README.md) | The self-healing framework (fingerprinting, scoring, healer, pluggable storage) plus page objects and specs for the sample apps and the pet hotel |

The application under test is [`../server-in-test`](../server-in-test/README.md), which it shares with the [Robot Framework flavour](../robot/README.md). Install and run everything from the repository root (see the [root README](../README.md)):

```bash
npm install
npx playwright install chromium
npm run test:e2e
```
