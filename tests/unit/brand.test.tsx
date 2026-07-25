import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRouter, RouterProvider, createRootRoute, createRoute, Outlet } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand";

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });
  return render(<RouterProvider router={router as never} />);
}

describe("BrandLockup", () => {
  it("exposes exactly one accessible name (no duplicate 'Confetti')", async () => {
    renderWithRouter(<BrandLockup />);
    const link = await screen.findByRole("link", { name: /confetti/i });
    // The link's accessible name is "Confetti — home" from aria-label; the
    // inner SVG mark and glyph spans are aria-hidden so screen readers don't
    // repeat the wordmark.
    expect(link.getAttribute("aria-label")).toBe("Confetti — home");
    // No nested img role — the mark is decorative.
    expect(link.querySelectorAll('[role="img"]').length).toBe(0);
  });
});
