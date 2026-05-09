#!/usr/bin/env bash
# Security scanner: search repository for common secret patterns.
# Set SKIP_SECURITY_HOOK=1 to bypass (useful in CI or trusted envs).
if [ "${SKIP_SECURITY_HOOK}" = "1" ]; then
  echo "SKIP_SECURITY_HOOK set, skipping security checks."
  exit 0
fi
PATTERNS=(
  "AWS_SECRET_ACCESS_KEY"
  "AWS_ACCESS_KEY_ID"
  "ANTHROPIC_API_KEY"
  "STRIPE_SECRET_KEY"
  "SECRET_KEY"
  "PASSWORD="
  "password ="
  "-----BEGIN PRIVATE KEY-----"
)
FOUND=0
for p in "${PATTERNS[@]}"; do
  if grep -RI --line-number --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv --exclude="*.lock" "$p" . >/dev/null 2>&1; then
    echo "Potential secret pattern found: $p"
    grep -RI --line-number --color=always --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.venv --exclude="*.lock" "$p" || true
    FOUND=1
  fi
done
if [ "$FOUND" -eq 1 ]; then
  echo "Security check failed: potential secrets detected. Set SKIP_SECURITY_HOOK=1 to bypass if this is a false positive."
  exit 1
fi
echo "Security check passed."
exit 0
