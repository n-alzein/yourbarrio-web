import { chromium } from '@playwright/test';

const out = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', async (msg) => {
  const vals = [];
  for (const arg of msg.args()) {
    try {
      vals.push(await arg.jsonValue());
    } catch {
      vals.push(arg.toString());
    }
  }
  const line = vals.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
  if (line.includes('[RSC_LOOP_DIAG]')) out.push(line);
});

await page.route('**/*_rsc=*', (route) => route.abort('failed'));

async function emitAuthBurst(label) {
  await page.waitForFunction(() => typeof window.__YB_DIAG_SIMULATE_AUTH_EVENT === 'function');
  out.push(`--- ${label}:begin ---`);
  for (let i = 0; i < 5; i += 1) {
    try {
      await page.evaluate(() => {
        window.__YB_DIAG_SIMULATE_AUTH_EVENT('TOKEN_REFRESHED');
      });
    } catch {
      // context replaced by navigation
    }
    await page.waitForTimeout(250);
  }
  try {
    await page.evaluate(async () => {
      await window.fetch('/business?_rsc=probe', { cache: 'no-store' });
    });
  } catch {
    // expected abort/failure
  }
  await page.waitForTimeout(1200);
  out.push(`--- ${label}:end ---`);
}

await page.goto('http://localhost:3000/business', { waitUntil: 'domcontentloaded' });
await emitAuthBurst('phase_1_initial');
await page.reload({ waitUntil: 'domcontentloaded' });
await emitAuthBurst('phase_2_after_reload');

const refreshAttempts = out.filter((line) => line.includes('router.refresh_attempt')).length;
const blockedEvents = out.filter((line) => line.includes('auto_refresh_blocked')).length;
console.log(`SUMMARY refresh_attempts=${refreshAttempts} blocked_events=${blockedEvents}`);

for (const line of out) {
  console.log(line);
}

await browser.close();
