#!/usr/bin/env bash
# Post-change backend actions: format and run quick tests if available.
if [ -d "backend" ]; then
  if command -v black >/dev/null 2>&1; then
    (cd backend && black .) || true
  fi
  if command -v isort >/dev/null 2>&1; then
    (cd backend && isort .) || true
  fi
  if command -v ruff >/dev/null 2>&1; then
    (cd backend && ruff check .) || true
  elif command -v flake8 >/dev/null 2>&1; then
    (cd backend && flake8 .) || true
  fi
  if command -v pytest >/dev/null 2>&1; then
    (cd backend && pytest -q) || true
  fi
fi
exit 0
