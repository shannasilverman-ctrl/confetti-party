import { describe, expect, it } from "vitest";
import { safeExternalHref, validateSafeUrl } from "@/lib/safe-url";

describe("safe outbound URL guard", () => {
  it("accepts a normal HTTPS URL and normalizes it", () => {
    const r = validateSafeUrl(" https://Example.com/path?x=1 ");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hostname).toBe("example.com");
      expect(r.url.startsWith("https://example.com/")).toBe(true);
    }
  });

  it("rejects a battery of adversarial URLs", () => {
    const cases = [
      "",
      "   ",
      "not a url",
      "http://example.com",
      "ftp://example.com",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "//example.com/protocol-relative",
      "https://user:pass@example.com/",
      "https://user@example.com/",
      "https://example.com/\r\nX-Injected: 1",
      "https://exa\tmple.com/tab-in-host",
      "https://example.com:22/",
      "https://example.com:3306/",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.1/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/metadata",
      "https://100.64.0.1/x",
      "https://[::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://[fe80::1]/x",
      "https://[fd00::1]/x",
      "https://" + "a".repeat(2100) + ".com",
    ];
    for (const raw of cases) {
      expect(validateSafeUrl(raw).ok, `should reject: ${raw.slice(0, 60)}`).toBe(false);
    }
  });

  it("blocks bare IPv4 by default and honors host allowlist", () => {
    expect(validateSafeUrl("https://8.8.8.8/x").ok).toBe(false);
    expect(validateSafeUrl("https://8.8.8.8/x", { allowIpLiterals: true }).ok).toBe(true);
    expect(
      validateSafeUrl("https://evil.dropbox.com.attacker.test/x", {
        allowedHosts: ["dropbox.com"],
      }).ok,
    ).toBe(false);
    expect(
      validateSafeUrl("https://www.dropbox.com/request/abc", { allowedHosts: ["dropbox.com"] }).ok,
    ).toBe(true);
  });

  it("safeExternalHref returns null for unsafe input", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("https://example.com/ok")).toBe("https://example.com/ok");
  });
});
