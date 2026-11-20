import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const failedResponses = [];
const failedRequests = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
});
page.on('requestfailed', (request) => {
  failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? 'failed'}`);
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'playwright-smoke.png', fullPage: true });

const result = {
  url: page.url(),
  title: await page.title(),
  bodyText: (await page.locator('body').innerText()).slice(0, 1000),
  buttons: await page.getByRole('button').allTextContents(),
  consoleErrors,
  pageErrors,
  failedResponses,
  failedRequests,
  screenshot: 'playwright-smoke.png',
};

console.log(JSON.stringify(result, null, 2));
await browser.close();

if (consoleErrors.length || pageErrors.length || failedResponses.length || failedRequests.length) process.exitCode = 1;
