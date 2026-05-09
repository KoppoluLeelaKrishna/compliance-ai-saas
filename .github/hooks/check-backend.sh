#!/usr/bin/env bash
# Safe backend checks: run pytest and flake8 if available; do not fail the hook on test failures.
if [ -d "backend" ]; then
  if command -v pytest >/dev/null 2>&1; then
    (cd backend && pytest -q) || true
  fi
  if command -v flake8 >/dev/null 2>&1; then
    (cd backend && flake8 .) || true
  fi
fi
exit 0
