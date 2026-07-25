#!/usr/bin/env bash
# Run the RPC integration harness inside a single transaction that is
# rolled back at the end. Nothing is persisted.
#
# Requires the standard PG* env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
# to point at a Supabase database with the current token RPCs deployed.
# See TESTING.md for safe execution surfaces.
set -euo pipefail

if [[ -z "${PGHOST:-}" ]]; then
  echo "test:db requires PG* env vars (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)." >&2
  echo "See TESTING.md → 'Database integration harness'." >&2
  exit 2
fi

HARNESS="supabase/tests/rpc_harness.sql"
echo "Running $HARNESS against $PGHOST/${PGDATABASE:-postgres} as ${PGUSER:-?}"
echo "The entire script runs inside BEGIN ... ROLLBACK."
echo

psql --set=ON_ERROR_STOP=1 --echo-errors -f "$HARNESS"

echo
echo "Post-run persistence check (should be 0):"
psql -tAc "SELECT count(*) FROM public.parties WHERE name LIKE 'rpc_harness_fixture_%'"
