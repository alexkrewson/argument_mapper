// Attaches a full-page screenshot tagged for tests/support/screenshot-report-reporter.mjs.
// Call once per meaningful step (not just at the end) — the reporter compiles
// every reportShot() call from a run, in order, into one scrollable HTML doc.
export async function reportShot(page, testInfo, label) {
  const body = await page.screenshot({ fullPage: true });
  await testInfo.attach(`report-shot:${label}`, { body, contentType: "image/png" });
}
