import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('reports preserve selected content, print private-safe HTML and fit five viewport sizes', async ({ page, request }, info) => {
  const post = async (path: string, data: unknown, token?: string) => {
    const r = await request.post('http://localhost:3001' + path, { data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    expect(r.ok(), await r.text()).toBeTruthy(); return r.json();
  };
  const auth = await post('/auth/register', { name: 'Fictional parent', email: `report-${Date.now()}@test.example`, password: 'fictional safe passphrase' });
  const h = await post('/households', { name: 'Fictional report family', timezone: 'America/Chicago' }, auth.token);
  const c = await post(`/households/${h.id}/children`, { firstName: 'River', dateOfBirth: '2026-01-01' }, auth.token);
  const d = await post(`/households/${h.id}/children`, { firstName: 'Sage', dateOfBirth: '2026-01-01' }, auth.token);
  const mutations = Array.from({ length: 21 }, (_, i) => {
    const id = randomUUID(); return { mutationId: randomUUID(), eventId: id, baseVersion: 0, operation: 'create', event: { id, childIds: [c.id, d.id], category: 'bottle', occurredAt: new Date(Date.now() - i * 86400000 - 3600000).toISOString(), details: { quantity: 120, unit: 'ml' }, notes: 'PRIVATE fictional note <script>throw new Error("injected")</script>' } };
  });
  await post(`/households/${h.id}/sync`, mutations, auth.token);
  await page.addInitScript(value => sessionStorage.setItem('nestwise.session', JSON.stringify(value)), auth);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'River', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Last 30 days', exact: true }).click();
  await expect(page.getByText('21 recorded entries', { exact: true })).toHaveCount(2);
  for (const [width, height] of [[390,844],[412,915],[768,1024],[1366,768],[1920,1080]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`reports-${width}.png`), fullPage: true });
  }
  await page.getByRole('radio', { name: 'River', exact: true }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Export pediatrician PDF', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'River', exact: true })).toBeVisible();
  await expect(popup.getByText(/not a medical record/)).toBeVisible();
  expect(await popup.content()).not.toContain('PRIVATE');
  await popup.pdf({ path: info.outputPath('care-report.pdf'), format: 'A4', printBackground: true });
  await popup.close();
  await page.getByRole('radio', { name: 'Custom range', exact: true }).click();
  await page.getByRole('textbox', { name: 'From date', exact: true }).fill('2026-02-30');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export pediatrician PDF', exact: true })).toBeDisabled();
});
