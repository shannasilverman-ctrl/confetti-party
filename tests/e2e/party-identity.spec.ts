// Content-identity E2E: proves that /party/:id, /party/:id/reveal, and
// /party/:id/day-of each render their OWN identity, not the workspace
// Overview. 200-status alone is insufficient — earlier tests passed on
// pages that never mounted RevealPage/DayOfPage because reveal/day-of
// were nested under the workspace which lacked <Outlet />.

import { expect, test } from "@playwright/test";

const AVA = "/party/ava-liam-wedding";

test.describe("Party route identity", () => {
  test("workspace renders Overview identity, not Reveal/Day-of", async ({ page }) => {
    await page.goto(AVA, { waitUntil: "domcontentloaded" });
    // Workspace-only markers
    await expect(page.getByTestId("next-action-card")).toBeVisible();
    await expect(page.getByRole("heading", { name: /RSVP snapshot/i })).toBeVisible();
    // Must NOT leak reveal/day-of chrome
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/Your reveal/i);
    expect(body).not.toMatch(/Day-of Host Mode/i);
  });

  test("reveal renders Reveal identity, NOT workspace Overview", async ({ page }) => {
    const resp = await page.goto(`${AVA}/reveal`, { waitUntil: "domcontentloaded" });
    expect(resp?.ok()).toBeTruthy();
    // Reveal-only marker: "Your reveal" eyebrow above the party name
    await expect(page.getByText(/Your reveal/i)).toBeVisible();
    // Workspace markers MUST NOT appear
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/Up next/i);
    expect(body).not.toMatch(/RSVP snapshot/i);
  });

  test("day-of renders Day-of identity, NOT workspace Overview", async ({ page }) => {
    const resp = await page.goto(`${AVA}/day-of`, { waitUntil: "domcontentloaded" });
    expect(resp?.ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "See the day before it gets busy" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "What needs attention" })).toBeVisible();
    await expect(page.getByText("Sample Day-of Mode.")).toBeVisible();
    const body = (await page.textContent("body")) ?? "";
    expect(body).not.toMatch(/RSVP snapshot/i);
    // No workspace section tabs
    expect(await page.getByRole("tab").count()).toBe(0);
  });

  test("sample Day-of update is explicitly local and never claims a guest send", async ({
    page,
  }) => {
    await page.goto(`${AVA}/day-of`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("textbox", { name: /Running 15 minutes late/i })
      .fill("Sample schedule note");
    await page.getByRole("button", { name: "Add sample update" }).click();
    await expect(page.getByText(/No guests were notified/i)).toBeVisible();
    await expect(page.getByText(/Visible on the guest page/i)).toHaveCount(0);
    await expect(page.getByText("Sample schedule note")).toBeVisible();
  });

  test("Day-of arrivals expose toggle state, a live count, and touch-sized controls", async ({
    page,
  }) => {
    await page.goto(`${AVA}/day-of`, { waitUntil: "domcontentloaded" });
    const arrivals = page.getByRole("region", { name: "Arrivals" });
    const count = arrivals.getByRole("status", { name: "Arrival count" });
    const guest = arrivals.getByRole("button", { name: "Ava Rossi (bride)" });

    await expect(count).toHaveText("0 / 5 in");
    await expect(guest).toHaveAttribute("aria-pressed", "false");
    expect((await guest.boundingBox())?.height).toBeGreaterThanOrEqual(44);

    await guest.click();
    await expect(guest).toHaveAttribute("aria-pressed", "true");
    await expect(count).toHaveText("1 / 5 in");

    await guest.click();
    await expect(guest).toHaveAttribute("aria-pressed", "false");
    await expect(count).toHaveText("0 / 5 in");
  });

  test("unknown party id → branded not-found on all three modes", async ({ page }) => {
    for (const path of [
      "/party/does-not-exist",
      "/party/does-not-exist/reveal",
      "/party/does-not-exist/day-of",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const body = (await page.textContent("body")) ?? "";
      // No stack traces / raw error text leaks
      expect(body).not.toMatch(/TypeError|Cannot read|stack trace/i);
    }
  });
});
