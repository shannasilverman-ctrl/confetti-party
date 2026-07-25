// Subprocess child for scripts/tz-matrix.mjs. Runs in a specific IANA TZ
// (set via env) and prints JSON that the parent asserts against. Duplicates
// the small subset of date-only helpers to avoid TS compilation in the
// child.
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parse(s) {
  const m = RE.exec(s);
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  const probe = new Date(y, mo - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d)
    return null;
  return { y, m: mo, d };
}
function toLocal(iso) {
  const p = parse(iso);
  return new Date(p.y, p.m - 1, p.d);
}
function toISO(d) {
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(iso, n) {
  const p = parse(iso);
  return toISO(new Date(p.y, p.m - 1, p.d + n));
}
function diff(a, b) {
  const A = toLocal(a),
    B = toLocal(b);
  const aN = new Date(A.getFullYear(), A.getMonth(), A.getDate(), 12).getTime();
  const bN = new Date(B.getFullYear(), B.getMonth(), B.getDate(), 12).getTime();
  return Math.round((bN - aN) / 86400000);
}

const dt = toLocal("2027-05-22");
const formatted = dt.toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

console.log(
  JSON.stringify({
    tz: process.env.TZ,
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
    day: dt.getDate(),
    formatted,
    plusOne: addDays("2027-05-22", 1),
    leapPlusOne: addDays("2024-02-28", 1),
    dstSpring: diff("2025-03-08", "2025-03-10"),
    dstFall: diff("2025-11-01", "2025-11-03"),
    allDayStamp: "2027-05-22".replace(/-/g, ""),
  }),
);
