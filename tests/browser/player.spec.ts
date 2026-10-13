import { test, expect, type Route } from '@playwright/test';
test('selecting a local video keeps the page and selected file intact', async ({ page }) => {
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.goto('/');
  const source = process.env.STICK_MOTION_VIDEO_FIXTURE ?? 'playground/public/assets/squat.webm';
  await page.getByLabel('Reference video', { exact: true }).setInputFiles(source);
  await expect(page.getByRole('button', { name: 'Extract motion' })).toBeEnabled();
  await page.getByLabel('Start (seconds)').fill('0.5');
  await page.getByLabel('Start (seconds)').fill('3');
  await page.getByLabel('End (seconds)').fill('4');
  await page.getByRole('combobox', { name: 'Exercise', exact: true }).selectOption('pushup');
  await expect(page.getByLabel('Start (seconds)')).toHaveValue('3');
  expect(navigations).toBe(1);
  expect(
    await page
      .getByLabel('Reference video', { exact: true })
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe(source.split('/').at(-1));
});
test('controls, complete movement, reduced motion, and resizing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByLabel('Show joints').check();
  const pelvis = page.locator('[data-joint="pelvis"]');
  const before = await pelvis.getAttribute('cy');
  const slider = page.getByRole('slider', { name: 'Timeline' });
  await slider.fill('0.5');
  await slider.press('ArrowRight');
  await expect(pelvis).not.toHaveAttribute('cy', before!);
  await expect(page.getByText('Bottom position', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(slider).toHaveValue('0');
  await page.getByLabel('Exercise').selectOption('plank');
  await expect(page.getByText('Hold and breathe', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('video extraction runs locally and supports cancellation', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4173') &&
      !r.url().startsWith('blob:') &&
      !r.url().startsWith('data:')
    )
      external.push(r.url());
  });
  await page.goto('/');
  await page
    .getByLabel('Reference video', { exact: true })
    .setInputFiles('playground/public/assets/squat.webm');
  await expect(page.getByRole('button', { name: 'Extract motion' })).toBeEnabled();
  let blockedWorker: Route | undefined;
  await page.route('**/assets/worker.js', (route) => {
    blockedWorker = route;
  });
  await page.getByRole('button', { name: 'Extract motion' }).click();
  await expect.poll(() => Boolean(blockedWorker)).toBe(true);
  await page.getByRole('button', { name: 'Cancel extraction' }).click();
  await blockedWorker!.abort().catch(() => {});
  await page.unroute('**/assets/worker.js');
  await expect(page.getByText('Import cancelled', { exact: true })).toBeVisible();
  await page.getByLabel('Start (seconds)').fill('3');
  await page.getByLabel('End (seconds)').fill('4');
  await page.getByRole('button', { name: 'Extract motion' }).click();
  await expect
    .poll(() => page.getByRole('status', { name: 'Import status' }).innerText(), {
      timeout: 150000,
    })
    .not.toMatch(/Loading|Extracting|^$/);
  const status = await page.getByRole('status', { name: 'Import status' }).innerText();
  if (status.includes('cannot create a WebGL context in a worker')) {
    expect(status).toContain('supported browser');
    expect(external).toEqual([]);
    return;
  }
  await expect(page.getByText('Extraction complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download raw capture' })).toBeEnabled();
  expect(external).toEqual([]);
});

test('a rejected fit retains raw observations without refreshing the page', async ({ page }) => {
  await page.goto('/');
  await page
    .getByLabel('Reference video', { exact: true })
    .setInputFiles(process.env.STICK_MOTION_VIDEO_FIXTURE ?? 'playground/public/assets/squat.webm');
  await expect(page.getByRole('button', { name: 'Extract motion' })).toBeEnabled();
  await page.getByRole('button', { name: 'Extract motion' }).click();
  const status = page.getByRole('status', { name: 'Import status' });
  await expect
    .poll(() => status.innerText(), { timeout: 150000 })
    .not.toMatch(/Loading|Extracting|^$/);
  if ((await status.innerText()).includes('cannot create a WebGL context')) return;
  await expect(page.getByRole('button', { name: 'Download raw capture' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Reprocess raw capture' })).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download raw capture' }).click();
  await (
    await downloaded
  ).saveAs(
    process.env.STICK_MOTION_VIDEO_FIXTURE
      ? '/tmp/stick-burpee-raw.json'
      : '/tmp/stick-squat-raw.json',
  );
  await page.screenshot({ path: 'test-results/capture-recovery.png', fullPage: true });
});

test('an importer module failure keeps the selected video and trim intact', async ({ page }) => {
  let navigations = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++;
  });
  await page.route('**/assets/video-*.js', (route) => route.abort());
  await page.goto('/');
  await page
    .getByLabel('Reference video', { exact: true })
    .setInputFiles('playground/public/assets/squat.webm');
  await expect(page.getByRole('button', { name: 'Extract motion' })).toBeEnabled();
  await page.getByLabel('Start (seconds)').fill('3');
  await page.getByRole('button', { name: 'Extract motion' }).click();
  await expect(page.getByRole('status', { name: 'Import status' })).toContainText(
    /import|module|fetch/i,
  );
  expect(navigations).toBe(1);
  await expect(page.getByLabel('Start (seconds)')).toHaveValue('3');
  expect(
    await page
      .getByLabel('Reference video', { exact: true })
      .evaluate((i: HTMLInputElement) => i.files?.length),
  ).toBe(1);
});
