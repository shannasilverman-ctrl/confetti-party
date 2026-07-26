import { describe, expect, it } from "vitest";
import { STATUS_LABEL, generateShoppingItems, resizePartySizedShopping } from "@/lib/shopping";
import { makeParty, setShoppingQuantity } from "@/lib/party-context";

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

  it("resizes only untouched needed quantities when the guest plan changes", () => {
    const items = generateShoppingItems("birthday", undefined, 8);
    const scalable = items.filter((item) => item.sizing);
    expect(scalable.length).toBeGreaterThan(0);
    const [inCart, purchased] = scalable;
    inCart.status = "in-cart";
    if (purchased) purchased.status = "purchased";

    const result = resizePartySizedShopping(items, 30);

    expect(result.resized).toBeGreaterThan(0);
    expect(result.protected).toBe(purchased ? 2 : 1);
    expect(result.items.find((item) => item.id === inCart.id)?.qty).toBe(inCart.qty);
    if (purchased) {
      expect(result.items.find((item) => item.id === purchased.id)?.qty).toBe(purchased.qty);
    }
    expect(
      result.items.some(
        (item) =>
          item.sizing &&
          item.status === "needed" &&
          item.qty > (items.find((before) => before.id === item.id)?.qty ?? 0),
      ),
    ).toBe(true);
  });

  it("treats a host quantity edit as authoritative", () => {
    const party = makeParty(
      {
        name: "Birthday",
        occasion: "birthday",
        date: "2027-04-10",
        guestEstimate: 10,
        budget: 300,
        theme: "",
      },
      "party",
    );
    const generated = party.shoppingItems.find((item) => item.sizing);
    expect(generated).toBeDefined();

    const edited = setShoppingQuantity(party, generated!.id, generated!.qty + 2);
    const item = edited.shoppingItems.find((candidate) => candidate.id === generated!.id);

    expect(item?.qty).toBe(generated!.qty + 2);
    expect(item?.sizing).toBeUndefined();
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
