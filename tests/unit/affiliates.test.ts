import { afterEach, describe, expect, it } from "vitest";
import {
  AFFILIATE,
  AFFILIATE_DISCLOSURE,
  affiliateDisclosureEnabled,
  amazonSearchUrl,
  targetSearchUrl,
  walmartSearchUrl,
} from "@/lib/affiliates";

const originalTag = AFFILIATE.amazonTag;
afterEach(() => {
  AFFILIATE.amazonTag = originalTag;
});

describe("affiliate link builders", () => {
  it("URL-encodes queries and omits tag when empty", () => {
    AFFILIATE.amazonTag = "";
    const url = amazonSearchUrl("Unicorn tableware pack");
    expect(url).toBe("https://www.amazon.com/s?k=Unicorn%20tableware%20pack");
    expect(url).not.toContain("tag=");
  });

  it("appends the Amazon Associates tag when configured", () => {
    AFFILIATE.amazonTag = "confetti-20";
    expect(amazonSearchUrl("balloons")).toBe("https://www.amazon.com/s?k=balloons&tag=confetti-20");
    expect(affiliateDisclosureEnabled()).toBe(true);
    expect(AFFILIATE_DISCLOSURE).toMatch(/Amazon Associate/);
  });

  it("clamps overly long queries to <=80 chars before encoding", () => {
    const long = "party ".repeat(30).trim(); // ~180 chars
    const url = amazonSearchUrl(long);
    const q = decodeURIComponent(url.split("k=")[1].split("&")[0]);
    expect(q.length).toBeLessThanOrEqual(80);
  });

  it("builds Target and Walmart search URLs with encoded query", () => {
    expect(targetSearchUrl("thanksgiving decor")).toBe(
      "https://www.target.com/s?searchTerm=thanksgiving%20decor",
    );
    expect(walmartSearchUrl("bbq plates & cups")).toBe(
      "https://www.walmart.com/search?q=bbq%20plates%20%26%20cups",
    );
  });

  it("disables disclosure when the tag is blank/whitespace", () => {
    AFFILIATE.amazonTag = "   ";
    expect(affiliateDisclosureEnabled()).toBe(false);
  });
});
