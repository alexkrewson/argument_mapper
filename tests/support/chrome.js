/**
 * Bring the header and footer back if a finished turn hid them.
 *
 * Since 2026-08-08 a completed turn hides the chrome to reveal the whole map.
 * Anything that reaches for the settings button or the input afterwards finds it
 * translated off-viewport, and Playwright waits for it to become clickable until
 * the test times out — which reads as a hang rather than as "it is hidden on
 * purpose". The app's own reveal strips are the honest way back in: this is what
 * a person taps.
 */
export async function revealChrome(page) {
  const top = page.getByTestId("reveal-chrome-top");
  if ((await top.count()) === 0) return;   // already showing
  await top.click({ position: { x: 10, y: 10 } });
  await page.getByTestId("reveal-chrome-top").waitFor({ state: "detached", timeout: 5000 });
}
