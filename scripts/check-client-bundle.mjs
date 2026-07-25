import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const ASSET_DIR = path.resolve(".output/public/assets");
const MAX_ENTRY_BYTES = 585_000;
const MAX_ENTRY_GZIP_BYTES = 170_000;

const files = await readdir(ASSET_DIR);
const entries = files.filter((name) => /^index-[A-Za-z0-9_-]+\.js$/.test(name));
if (entries.length !== 1) {
  throw new Error(`Expected exactly one client entry in ${ASSET_DIR}; found ${entries.length}.`);
}

const entryPath = path.join(ASSET_DIR, entries[0]);
const [metadata, source] = await Promise.all([stat(entryPath), readFile(entryPath)]);
const gzipBytes = gzipSync(source, { level: 9 }).byteLength;

if (metadata.size > MAX_ENTRY_BYTES || gzipBytes > MAX_ENTRY_GZIP_BYTES) {
  throw new Error(
    [
      `Client entry exceeded its performance budget: ${entries[0]}`,
      `raw ${metadata.size}/${MAX_ENTRY_BYTES} bytes`,
      `gzip ${gzipBytes}/${MAX_ENTRY_GZIP_BYTES} bytes`,
      "Move optional providers, integrations, or interaction-only UI behind dynamic imports.",
    ].join("\n"),
  );
}

console.log(
  `[bundle] ${entries[0]}: ${metadata.size} raw bytes, ${gzipBytes} gzip bytes (within budget)`,
);
