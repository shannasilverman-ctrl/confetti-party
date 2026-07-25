import { describe, expect, it } from "vitest";
import { STATUS_LABEL, generateShoppingItems } from "@/lib/shopping";

describe("generateShoppingItems", () => {
  it("returns seeded items for a known occasion", () => {
    const items = generateShoppingItems("birthday", undefined, 10);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.status === "needed")).toBe(true);
    expect(items.every((i) => typeof i.id === "string" && i.id.length > 0)).toBe(true);
  });

  it("scales qty by guests / serves ratio (ceil, min 1)", () => {
    const g10 = generateShoppingItems("birthday", undefined, 10);
    const g30 = generateShoppingItems("birthday", undefined, 30);
    // Every serves-based item should have qty >= the smaller-party equivalent.
    for (let i = 0; i < g10.length; i++) {
      expect(g30[i].qty).toBeGreaterThanOrEqual(g10[i].qty);
      expect(g10[i].qty).toBeGreaterThanOrEqual(1);
    }
  });

  it("falls back to the 'other' seed list for unknown occasions", () => {
    // @ts-expect-error intentional: exercise the fallback branch
    const items = generateShoppingItems("does-not-exist", undefined, 8);
    expect(items.length).toBeGreaterThan(0);
  });

  it("exposes a status label map covering every status", () => {
    expect(STATUS_LABEL).toMatchObject({
      needed: expect.any(String),
      "in-cart": expect.any(String),
      purchased: expect.any(String),
    });
  });
});
