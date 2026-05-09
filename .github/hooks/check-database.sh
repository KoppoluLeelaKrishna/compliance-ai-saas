#!/usr/bin/env bash
# Safe database checks: report migration folders and presence of migration tooling.
if [ -d "backend" ]; then
  echo "Checking backend migrations..."
  if [ -d "backend/migrations" ]; then
    ls -1 backend/migrations || true
  else
    echo "No backend/migrations directory found."
  fi
fi
if [ -d "worker" ]; then
  echo "Checking worker migrations..."
  if [ -d "worker/migrations" ]; then
    ls -1 worker/migrations || true
  else
    echo "No worker/migrations directory found."
  fi
fi
# Check for alembic presence
if command -v alembic >/dev/null 2>&1; then
  echo "Alembic available: version $(alembic --version 2>/dev/null || true)"
fi
exit 0
