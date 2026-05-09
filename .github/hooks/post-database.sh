#!/usr/bin/env bash
# Post-change database actions: run lightweight checks and report migration status.
echo "Running database post-change checks..."
if [ -d "backend" ]; then
  if command -v alembic >/dev/null 2>&1; then
    echo "Alembic available:" && alembic --version || true
  fi
  if [ -d "backend/migrations" ]; then
    echo "Backend migrations list:" && ls -1 backend/migrations || true
  fi
fi
if [ -d "worker" ]; then
  if [ -d "worker/migrations" ]; then
    echo "Worker migrations list:" && ls -1 worker/migrations || true
  fi
fi
exit 0
