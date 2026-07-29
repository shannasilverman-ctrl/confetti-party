import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const INVITE_TOKEN = "123e4567-e89b-42d3-a456-426614174000";

test("cohost fragment is scrubbed before sign-in and never sent in a request", async ({
  page,
}, testInfo) => {
  const requestUrls: string[] = [];
  page.on("request", (request) => requestUrls.push(request.url()));

  const response = await page.goto(`/collaborate#invite=${INVITE_TOKEN}`, {
    waitUntil: "networkidle",
  });
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/collaborate$/);
  await expect(page.getByRole("heading", { name: "Plan this party together" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to join" })).toBeVisible();
  expect(requestUrls.some((url) => url.includes(INVITE_TOKEN))).toBe(false);

  await page.getByRole("link", { name: "Sign in to join" }).click();
  await expect(page).toHaveURL(/\/auth\?/);
  expect(page.url()).not.toContain(INVITE_TOKEN);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/collaborate");

  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach("collaborator-sign-in", { body: screenshot, contentType: "image/png" });
});

test("cohost landing page is keyboard reachable, contained, and accessible", async ({
  page,
}, testInfo) => {
  await page.goto(`/collaborate#invite=${INVITE_TOKEN}`, { waitUntil: "networkidle" });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${testInfo.project.name} horizontal overflow`).toBeLessThanOrEqual(1);

  const signIn = page.getByRole("link", { name: "Sign in to join" });
  await signIn.focus();
  await expect(signIn).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Create account" })).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
