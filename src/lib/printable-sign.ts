// Client-side printable sign generator. Opens a new window with a
// self-contained HTML page (QR + party name + short instructions) ready to
// print or save-as-PDF. No server, no external services.

type SignInput = {
  partyName: string;
  title: string;
  note?: string;
  url: string;
  /** Trusted SVG generated locally by qrcode.react. */
  qrSvg: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isTrustedQrSvg(svg: string): boolean {
  const normalized = svg.trim();
  return (
    normalized.startsWith("<svg") &&
    normalized.endsWith("</svg>") &&
    !/<(?:script|foreignObject|iframe|object|embed)\b/i.test(normalized) &&
    !/\bon\w+\s*=/i.test(normalized) &&
    !/\b(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/i.test(normalized)
  );
}

export function buildPrintableSignHtml(input: SignInput): string | null {
  const { partyName, title, note, url, qrSvg } = input;
  if (!isTrustedQrSvg(qrSvg)) return null;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — ${escapeHtml(partyName)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #FFF9F0;
    color: #1F2544;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .sheet {
    width: 640px;
    max-width: 100%;
    background: #ffffff;
    border-radius: 24px;
    padding: 48px 40px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.08);
    text-align: center;
  }
  .kicker { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #6B7089; }
  h1 { font-size: 40px; margin: 8px 0 4px; font-weight: 800; letter-spacing: -0.01em; }
  h2 { font-size: 22px; margin: 0 0 24px; color: #6B7089; font-weight: 500; }
  .qr { margin: 24px auto; width: 320px; height: 320px; background: #fff; border-radius: 16px; padding: 12px; border: 2px solid #F1EEE6; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .note { font-size: 16px; color: #1F2544; margin: 16px auto 8px; max-width: 480px; line-height: 1.4; }
  .url { font-size: 12px; color: #6B7089; word-break: break-all; margin-top: 8px; }
  .footer { margin-top: 28px; font-size: 11px; color: #6B7089; }
  .brand { font-weight: 700; color: #E85D75; }
  .toolbar { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; }
  .toolbar button {
    background: #E85D75; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 999px; font-weight: 600; cursor: pointer;
  }
  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; padding: 32px; }
    .toolbar { display: none; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print</button></div>
<div class="sheet">
  <div class="kicker">${escapeHtml(partyName)}</div>
  <h1>${escapeHtml(title)}</h1>
  <h2>Scan with your phone camera</h2>
  <div class="qr">${qrSvg}</div>
  ${note ? `<p class="note">${escapeHtml(note)}</p>` : ""}
  <p class="url">${escapeHtml(url)}</p>
  <p class="footer">Made with <span class="brand">Confetti</span></p>
</div>
</body>
</html>`;
}

export function openPrintableSign(input: SignInput): boolean {
  if (typeof window === "undefined") return false;
  const html = buildPrintableSignHtml(input);
  if (!html) return false;
  const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
