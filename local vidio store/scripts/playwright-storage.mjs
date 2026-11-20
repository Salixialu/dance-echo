import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  channel: 'msedge',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

const contracts = await page.evaluate(() => ({
  saveVideoUsesReject: /new Promise\(\(resolve, reject\)/.test(window.dbSaveVideo?.toString?.() || ''),
  saveVideoRejects: /reject\(/.test(window.dbSaveVideo?.toString?.() || ''),
  readVideoRejects: /reject\(/.test(window.dbGetAllVideos?.toString?.() || ''),
  readFolderRejects: /reject\(/.test(window.dbGetAllFolders?.toString?.() || ''),
}));

console.log(JSON.stringify({ contracts, errors }, null, 2));
await browser.close();
if (errors.length || !contracts.saveVideoUsesReject || !contracts.saveVideoRejects || !contracts.readVideoRejects || !contracts.readFolderRejects) process.exitCode = 1;
