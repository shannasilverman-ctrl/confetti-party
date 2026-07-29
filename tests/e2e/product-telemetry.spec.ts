import { expect, test, type Request } from "@playwright/test";

function telemetryRequests(requests: Request[]) {
  return requests.filter((request) => new URL(request.url()).pathname === "/api/telemetry");
}

test("telemetry endpoint accepts only the fixed privacy-safe schema", async ({ request }) => {
  const accepted = await request.post("/api/telemetry", {
    data: { event: "plan_created", surface: "quick_start" },
  });
  expect(accepted.status()).toBe(204);
  expect(accepted.headers()["cache-control"]).toBe("no-store");

  const rejected = await request.post("/api/telemetry", {
    data: {
      event: "plan_created",
      surface: "quick_start",
      partyId: "private-party-id",
    },
  });
  expect(rejected.status()).toBe(400);
  expect(rejected.headers()["cache-control"]).toBe("no-store");
});

test("landing activation sends neither credentials nor a referrer", async ({ page }) => {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/\/app(?:\?.*)?$/);
  await expect(page.getByRole("dialog", { name: "What are you thinking?" })).toBeVisible();
  await expect.poll(() => telemetryRequests(requests).length).toBe(1);

  const telemetry = telemetryRequests(requests)[0]!;
  expect(telemetry.postDataJSON()).toEqual({
    event: "landing_plan_started",
    surface: "landing",
  });
  const headers = await telemetry.allHeaders();
  expect(headers.cookie).toBeUndefined();
  expect(headers.referer).toBeUndefined();
});

test("sample invitation reports only aggregate journey events", async ({ page }) => {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));

  await page.goto("/sample-invite", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() =>
      telemetryRequests(requests).some(
        (request) => request.postDataJSON().event === "invite_opened",
      ),
    )
    .toBe(true);

  await page.getByLabel("Your name").first().fill("Sample Guest");
  await page.getByRole("button", { name: "Send RSVP" }).click();
  await expect(page.getByRole("heading", { name: "You're on the list!" })).toBeVisible();
  await expect
    .poll(() =>
      telemetryRequests(requests).some(
        (request) => request.postDataJSON().event === "rsvp_completed",
      ),
    )
    .toBe(true);

  for (const request of telemetryRequests(requests)) {
    const body = request.postData() ?? "";
    expect(body).not.toContain("Sample Guest");
    expect(body).not.toContain("Ava & Liam");
    expect(Object.keys(request.postDataJSON()).sort()).toEqual(["event", "surface"]);
  }
});
