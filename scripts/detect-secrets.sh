#!/usr/bin/env bash
# Secret Detection Script
# Scans staged files for common secret patterns (API keys, passwords, tokens, private keys)
# Used by the pre-commit hook to block commits containing secrets.
#
# Exit codes:
#   0 - No secrets detected
#   1 - Secrets detected (commit should be blocked)

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Patterns that indicate secrets in source code
# Each pattern is a regex followed by a description separated by |||
SECRET_PATTERNS=(
  # AWS
  'AKIA[0-9A-Z]{16}|||AWS Access Key ID'
  # Generic API keys (common formats)
  '(?i)(api[_-]?key|apikey)\s*[:=]\s*["\x27][a-zA-Z0-9_\-]{20,}["\x27]|||API Key assignment'
  # Generic secrets/passwords in assignments
  '(?i)(password|passwd|pwd)\s*[:=]\s*["\x27][^\s"'\'']{8,}["\x27]|||Password assignment'
  '(?i)(secret|token)\s*[:=]\s*["\x27][a-zA-Z0-9_\-/.+]{20,}["\x27]|||Secret/Token assignment'
  # Private keys
  '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|||Private Key'
  # GitHub tokens
  'gh[pousr]_[A-Za-z0-9_]{36,}|||GitHub Token'
  # Generic bearer tokens
  '(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}|||Bearer Token'
  # Supabase keys
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+|||JWT Token (possible Supabase key)'
  # Database connection strings with credentials
  '(?i)(postgres|mysql|mongodb|redis)://[^:]+:[^@]+@|||Database Connection String with credentials'
  # Slack webhooks
  'https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[a-zA-Z0-9]+|||Slack Webhook URL'
  # Stripe keys
  '(sk|pk)_(test|live)_[a-zA-Z0-9]{20,}|||Stripe API Key'
  # SendGrid
  'SG\.[a-zA-Z0-9_\-]{22}\.[a-zA-Z0-9_\-]{43}|||SendGrid API Key'
  # Cloudflare API tokens
  '(?i)cloudflare[_-]?(api[_-]?)?token\s*[:=]\s*["\x27][a-zA-Z0-9_\-]{40,}["\x27]|||Cloudflare API Token'
  # Generic high-entropy strings in env-like assignments (hex or base64, 32+ chars)
  '(?i)(secret|key|token|password|credential)_?[a-z_]*\s*[:=]\s*["\x27][A-Fa-f0-9]{32,}["\x27]|||High-entropy hex secret'
)

# Files/patterns to exclude from scanning
EXCLUDE_PATTERNS=(
  '\.lock$'
  'node_modules/'
  '\.min\.js$'
  '\.min\.css$'
  'package-lock\.json$'
  '\.turbo/'
  'dist/'
  '\.next/'
  'coverage/'
  'detect-secrets\.sh$'
  '\.example$'
  '\.sample$'
  '\.md$'
)

found_secrets=0
declare -a findings=()

# Get list of staged files (or all files if run standalone)
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  # Running inside git repo - check staged files
  staged_files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
else
  echo "Not inside a git repository"
  exit 0
fi

if [ -z "$staged_files" ]; then
  exit 0
fi

# Filter out excluded files
filter_files() {
  local files="$1"
  local filtered=""
  
  while IFS= read -r file; do
    local exclude=false
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
      if echo "$file" | grep -qE "$pattern"; then
        exclude=true
        break
      fi
    done
    if [ "$exclude" = false ]; then
      filtered="${filtered}${file}"$'\n'
    fi
  done <<< "$files"
  
  echo "$filtered"
}

filtered_files=$(filter_files "$staged_files")

if [ -z "$filtered_files" ]; then
  exit 0
fi

# Scan each file for secret patterns
while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ ! -f "$file" ] && continue
  
  for pattern_entry in "${SECRET_PATTERNS[@]}"; do
    pattern="${pattern_entry%%|||*}"
    description="${pattern_entry##*|||}"
    
    # Use grep with perl-compatible regex (-- separates options from pattern)
    matches=$(grep -nP -- "$pattern" "$file" 2>/dev/null || true)
    
    if [ -n "$matches" ]; then
      found_secrets=1
      while IFS= read -r match; do
        [ -z "$match" ] && continue
        line_num="${match%%:*}"
        findings+=("  ${RED}✗${NC} ${file}:${line_num} - ${YELLOW}${description}${NC}")
      done <<< "$matches"
    fi
  done
done <<< "$filtered_files"

# Report findings
if [ $found_secrets -eq 1 ]; then
  echo ""
  echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  🚨 SECRETS DETECTED - COMMIT BLOCKED                       ║${NC}"
  echo -e "${RED}╠══════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${RED}║  Potential secrets found in staged files:                    ║${NC}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  for finding in "${findings[@]}"; do
    echo -e "$finding"
  done
  
  echo ""
  echo -e "${YELLOW}To fix:${NC}"
  echo "  1. Remove the secret from the file"
  echo "  2. Store secrets in environment variables or a secret manager"
  echo "  3. Add the file to .gitignore if it should not be tracked"
  echo "  4. If this is a false positive, use: git commit --no-verify"
  echo ""
  echo -e "${YELLOW}Note:${NC} If you believe this is a false positive, review the pattern"
  echo "  and consider adding an exclusion in scripts/detect-secrets.sh"
  echo ""
  exit 1
fi

exit 0
