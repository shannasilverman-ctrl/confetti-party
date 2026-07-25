import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogoLockup, LogoMark } from "@/components/logo";

describe("Logo", () => {
  it("renders the full Confetti wordmark in the lockup", () => {
    render(<LogoLockup />);
    expect(screen.getByText("Confetti")).toBeInTheDocument();
  });

  it("exposes an accessible name on the mark", () => {
    render(<LogoMark title="Confetti" />);
    expect(screen.getByRole("img", { name: "Confetti" })).toBeInTheDocument();
  });

  it("scales via the size prop", () => {
    const { container, rerender } = render(<LogoLockup size="nav" />);
    expect(container.querySelector("svg")?.getAttribute("class") ?? "").toMatch(/h-8/);
    rerender(<LogoLockup size="hero" />);
    expect(container.querySelector("svg")?.getAttribute("class") ?? "").toMatch(/h-10/);
  });
});
