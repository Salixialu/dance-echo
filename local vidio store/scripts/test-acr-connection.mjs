/**
 * 回归测试：ACRCloud「测试连通」必须把 2004/2005/1001 判为「认证通过」。
 *
 * 背景（2026-11-07 实调）：测试按钮发送的是 2 秒纯静音。ACRCloud 先校验
 * access_key/签名、再处理音频，静音样本无法生成指纹 → 返回 2004，
 * 而旧实现只认 1001，于是「密钥完全正确」也报红：「音频太短，无法识别」。
 * 用户看到红字就会以为识曲连接坏了。
 *
 * 本测试拦截网络，不消耗真实额度，也不需要真实密钥。
 */
import { chromium } from 'playwright';

const BASE = process.env.DE_BASE_URL || 'http://127.0.0.1:5173/';

const CASES = [
  {
    name: '2004 静音无法生成指纹 → 判为连通正常',
    body: { status: { msg: "Can't generate fingerprint", code: 2004, version: '1.0' } },
    expectGreen: true,
    expectText: '连通正常',
  },
  {
    name: '1001 无匹配 → 判为连通正常',
    body: { status: { msg: 'No result', code: 1001, version: '1.0' } },
    expectGreen: true,
    expectText: '连通正常',
  },
  {
    name: '3014 签名错误 → 判为失败并提示 Secret',
    body: { status: { msg: 'invalid signature', code: 3014, version: '1.0' } },
    expectGreen: false,
    expectText: '签名校验失败',
  },
  {
    name: '3001 Access Key 无效 → 判为失败并提示 Key',
    body: { status: { msg: 'Missing/Invalid Access Key', code: 3001, version: '1.0' } },
    expectGreen: false,
    expectText: 'Access Key 无效',
  },
];

const browser = await chromium.launch();
let failed = 0;

for (const testCase of CASES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/v1/identify', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(testCase.body) })
  );
  await page.addInitScript(() => {
    localStorage.setItem('dance_echo_acr_host', 'identify-cn-north-1.acrcloud.cn');
    localStorage.setItem('dance_echo_acr_key', 'test_key');
    localStorage.setItem('dance_echo_acr_secret', 'test_secret');
  });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="sidebar-open-settings-collapsed"], button[title*="设置"]', {
      timeout: 30000,
    });
    await page
      .locator('[data-testid="sidebar-open-settings-collapsed"], button[title*="设置"]')
      .first()
      .click();
    await page.waitForSelector('[data-testid="settings-modal"]', { timeout: 10000 });
    await page.locator('[data-testid="settings-tab-music"]').click();
    await page.locator('[data-testid="acr-test"]').click();
    await page.waitForSelector('[data-testid="acr-test-result"]', { timeout: 20000 });

    const box = page.locator('[data-testid="acr-test-result"]').first();
    const text = (await box.innerText()).trim();
    const cls = (await box.getAttribute('class')) || '';
    const isGreen = !/rose/.test(cls);

    const ok = isGreen === testCase.expectGreen && text.includes(testCase.expectText);
    if (!ok) failed += 1;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${testCase.name}\n      绿色=${isGreen}（期望 ${testCase.expectGreen}） 文案=${text}`
    );
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${testCase.name}\n      ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 个用例失败`);
process.exit(failed === 0 ? 0 : 1);
