import { describe, expect, it } from "vitest";
import { buildPrintableSignHtml } from "@/lib/printable-sign";

const LOCAL_QR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h1v1H0z"/></svg>';

describe("printable photo-drop sign", () => {
  it("embeds the locally generated QR without an outbound QR request", () => {
    const html = buildPrintableSignHtml({
      partyName: "Ava & Liam",
      title: "Share photos",
      note: "Straight to our album.",
      url: "https://www.dropbox.com/request/private-capability",
      qrSvg: LOCAL_QR,
    });

    expect(html).toContain(LOCAL_QR);
    expect(html).not.toMatch(/api\.qrserver|create-qr-code|<img\b/i);
    expect(html).toContain("https://www.dropbox.com/request/private-capability");
  });

  it("escapes host copy and refuses active or externally loaded SVG markup", () => {
    const safe = buildPrintableSignHtml({
      partyName: "<script>alert(1)</script>",
      title: '"Photo" & friends',
      url: "https://photos.app.goo.gl/example",
      qrSvg: LOCAL_QR,
    });
    expect(safe).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(safe).toContain("&quot;Photo&quot; &amp; friends");

    for (const qrSvg of [
      "<svg><script>alert(1)</script></svg>",
      '<svg onload="alert(1)"></svg>',
      '<svg><image href="https://tracker.example/pixel"/></svg>',
      "not-an-svg",
    ]) {
      expect(
        buildPrintableSignHtml({
          partyName: "Party",
          title: "Photos",
          url: "https://photos.app.goo.gl/example",
          qrSvg,
        }),
      ).toBeNull();
    }
  });
});
