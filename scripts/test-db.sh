#!/usr/bin/env bash
# Run the RPC integration harness inside a single BEGIN ... ROLLBACK.
# Nothing is persisted.
#
# Safe execution surfaces (default):
#   - `supabase start` local instance
#   - dedicated staging database
#
# The connected Lovable Cloud database is a SHARED database. Running the
# harness against it requires the explicit opt-in:
#
#   CONFETTI_ALLOW_CONNECTED_ROLLBACK=1 bun run test:db
#
# Even with the opt-in, obvious production hostnames are refused.
set -euo pipefail

HARNESS="supabase/tests/rpc_harness.sql"

if [[ ! -f "$HARNESS" ]]; then
  echo "harness file not found: $HARNESS" >&2
  exit 2
fi

if [[ -z "${PGHOST:-}" ]]; then
  echo "test:db requires PG* env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)." >&2
  echo "See TESTING.md → 'Database integration harness'." >&2
  exit 2
fi

# ---- Static safety checks on the SQL file ------------------------------
# Refuse to run any harness that does not open a top-level transaction and
# roll it back. Prevents an accidental edit from persisting fixture rows.
if ! grep -Eiq '^[[:space:]]*BEGIN;' "$HARNESS"; then
  echo "refusing to run: $HARNESS has no top-level BEGIN;" >&2
  exit 2
fi
if ! grep -Eiq '^[[:space:]]*ROLLBACK;' "$HARNESS"; then
  echo "refusing to run: $HARNESS has no top-level ROLLBACK;" >&2
  exit 2
fi
if grep -Eiq '^[[:space:]]*COMMIT;' "$HARNESS"; then
  echo "refusing to run: $HARNESS contains a top-level COMMIT;" >&2
  exit 2
fi

# ---- Host classification ------------------------------------------------
# Anything that isn't localhost / a supabase-local docker DNS name is
# treated as connected/shared and requires the explicit opt-in.
lc_host="${PGHOST,,}"
is_local=0
case "$lc_host" in
  localhost|127.0.0.1|::1|host.docker.internal|supabase_db_*|db.supabase_*|*.supabase.internal)
    is_local=1
    ;;
esac

# Refuse hosts that look like production regardless of the opt-in.
if [[ "$lc_host" == *prod* || "$lc_host" == *production* ]]; then
  echo "refusing to run against a host that looks like production: $PGHOST" >&2
  exit 2
fi

if [[ "$is_local" -ne 1 ]]; then
  if [[ "${CONFETTI_ALLOW_CONNECTED_ROLLBACK:-}" != "1" ]]; then
    echo "refusing to run against connected/shared database $PGHOST." >&2
    echo "This host is not local. Re-run with:" >&2
    echo "  CONFETTI_ALLOW_CONNECTED_ROLLBACK=1 bun run test:db" >&2
    echo "See TESTING.md → 'Database integration harness'." >&2
    exit 2
  fi
  echo "NOTE: running against connected database $PGHOST with explicit opt-in." >&2
fi

MARKER_PREFIX='rpc_harness_fixture_'
FIXTURE_EMAIL_LIKE="${MARKER_PREFIX}%@rpc-harness.invalid"

echo "Running $HARNESS against $PGHOST/${PGDATABASE:-postgres} as ${PGUSER:-?}"
echo "The entire script runs inside BEGIN ... ROLLBACK."
echo

psql --set=ON_ERROR_STOP=1 --echo-errors -f "$HARNESS"

# ---- Independent post-run leak checks (never destructive) --------------
echo
echo "Independent post-run leak checks (both must return 0):"

parties_leak=$(psql -tAc "SELECT count(*) FROM public.parties WHERE name LIKE '${MARKER_PREFIX}%'")
auth_leak=$(psql -tAc "SELECT count(*) FROM auth.users WHERE email LIKE '${FIXTURE_EMAIL_LIKE}'")

echo "  public.parties marker rows: $parties_leak"
echo "  auth.users     marker rows: $auth_leak"

if [[ "$parties_leak" != "0" || "$auth_leak" != "0" ]]; then
  echo "FAIL: fixture rows persisted after ROLLBACK (parties=$parties_leak, auth=$auth_leak)." >&2
  echo "Do NOT delete them manually here — investigate the harness first." >&2
  exit 1
fi

echo "OK: harness completed with zero residue."
