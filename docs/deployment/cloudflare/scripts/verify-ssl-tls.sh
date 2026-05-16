#!/usr/bin/env bash
# =============================================================================
# SSL/TLS Verification Script
# Verifies SSL/TLS configuration is correctly applied across all domains
#
# Usage:
#   export DOMAIN="example.com"
#   ./verify-ssl-tls.sh
# =============================================================================

set -euo pipefail

: "${DOMAIN:?Error: DOMAIN is not set (e.g., export DOMAIN=example.com)}"

SUBDOMAINS=("dashboard" "scanner" "api" "ws")
PASS=0
FAIL=0

echo "=== SSL/TLS Verification for ${DOMAIN} ==="
echo ""

# Helper function
check() {
  local description="$1"
  local result="$2"
  if [ "$result" = "PASS" ]; then
    echo "  ✓ ${description}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${description}"
    FAIL=$((FAIL + 1))
  fi
}

# -----------------------------------------------------------------------------
# 1. Verify HTTPS is accessible on all subdomains
# -----------------------------------------------------------------------------
echo "[1] Checking HTTPS accessibility..."
for sub in "${SUBDOMAINS[@]}"; do
  HOST="${sub}.${DOMAIN}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://${HOST}" --max-time 10 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" != "000" ]; then
    check "HTTPS accessible: ${HOST} (HTTP ${HTTP_CODE})" "PASS"
  else
    check "HTTPS accessible: ${HOST}" "FAIL"
  fi
done
echo ""

# -----------------------------------------------------------------------------
# 2. Verify HTTP → HTTPS redirect (301)
# -----------------------------------------------------------------------------
echo "[2] Checking HTTP → HTTPS redirect (301)..."
for sub in "${SUBDOMAINS[@]}"; do
  HOST="${sub}.${DOMAIN}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}" --max-time 10 -L --max-redirs 0 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "301" ]; then
    check "HTTP 301 redirect: ${HOST}" "PASS"
  else
    check "HTTP 301 redirect: ${HOST} (got ${HTTP_CODE})" "FAIL"
  fi
done
echo ""

# -----------------------------------------------------------------------------
# 3. Verify minimum TLS version (reject TLS 1.1)
# -----------------------------------------------------------------------------
echo "[3] Checking TLS 1.1 is rejected..."
for sub in "${SUBDOMAINS[@]}"; do
  HOST="${sub}.${DOMAIN}"
  # Attempt TLS 1.1 connection — should fail
  TLS11_RESULT=$(curl -s -o /dev/null -w "%{http_code}" --tls-max 1.1 "https://${HOST}" --max-time 10 2>&1 || echo "REJECTED")
  if echo "$TLS11_RESULT" | grep -qi "rejected\|error\|000\|failed"; then
    check "TLS 1.1 rejected: ${HOST}" "PASS"
  else
    check "TLS 1.1 rejected: ${HOST} (connection succeeded — should be blocked)" "FAIL"
  fi
done
echo ""

# -----------------------------------------------------------------------------
# 4. Verify TLS 1.3 is supported
# -----------------------------------------------------------------------------
echo "[4] Checking TLS 1.3 support..."
for sub in "${SUBDOMAINS[@]}"; do
  HOST="${sub}.${DOMAIN}"
  TLS_VERSION=$(curl -s -o /dev/null -w "%{ssl_version}" --tlsv1.3 "https://${HOST}" --max-time 10 2>/dev/null || echo "NONE")
  if [ "$TLS_VERSION" = "TLSv1.3" ]; then
    check "TLS 1.3 supported: ${HOST}" "PASS"
  else
    check "TLS 1.3 supported: ${HOST} (got ${TLS_VERSION})" "FAIL"
  fi
done
echo ""

# -----------------------------------------------------------------------------
# 5. Verify HSTS header
# -----------------------------------------------------------------------------
echo "[5] Checking HSTS header..."
for sub in "${SUBDOMAINS[@]}"; do
  HOST="${sub}.${DOMAIN}"
  HSTS_HEADER=$(curl -s -I "https://${HOST}" --max-time 10 2>/dev/null | grep -i "strict-transport-security" || echo "")
  if echo "$HSTS_HEADER" | grep -qi "max-age=31536000"; then
    if echo "$HSTS_HEADER" | grep -qi "includeSubDomains"; then
      check "HSTS header correct: ${HOST}" "PASS"
    else
      check "HSTS header missing includeSubDomains: ${HOST}" "FAIL"
    fi
  else
    check "HSTS header present: ${HOST}" "FAIL"
  fi
done
echo ""

# -----------------------------------------------------------------------------
# 6. Verify certificate validity
# -----------------------------------------------------------------------------
echo "[6] Checking certificate validity..."
for sub in "${SUBDOMAINS[@]}"; do
  HOST="${sub}.${DOMAIN}"
  CERT_EXPIRY=$(echo | openssl s_client -servername "${HOST}" -connect "${HOST}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "UNKNOWN")
  if [ "$CERT_EXPIRY" != "UNKNOWN" ]; then
    EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$CERT_EXPIRY" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
    if [ "$DAYS_LEFT" -gt 30 ]; then
      check "Certificate valid: ${HOST} (${DAYS_LEFT} days remaining)" "PASS"
    else
      check "Certificate expiring soon: ${HOST} (${DAYS_LEFT} days remaining)" "FAIL"
    fi
  else
    check "Certificate check: ${HOST}" "FAIL"
  fi
done
echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo "=== Results ==="
echo "  Passed: ${PASS}"
echo "  Failed: ${FAIL}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "⚠ Some checks failed. Review the output above."
  exit 1
else
  echo "✓ All SSL/TLS checks passed."
  exit 0
fi
