#!/usr/bin/env bash
# =============================================================================
# WAF & DDoS Protection Verification Script
# Wedding Digital SaaS Platform
# =============================================================================
# Usage: ./verify-waf.sh <domain>
# Example: ./verify-waf.sh api.weddingdigital.id
# =============================================================================

set -euo pipefail

DOMAIN="${1:-api.weddingdigital.id}"
PASS=0
FAIL=0

echo "============================================="
echo "WAF & DDoS Protection Verification"
echo "Domain: ${DOMAIN}"
echo "============================================="
echo ""

# Helper function to check if request is blocked (expects 403)
check_blocked() {
  local description="$1"
  local url="$2"
  local expected_status="${3:-403}"

  local status_code
  status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

  if [ "$status_code" = "$expected_status" ]; then
    echo "✅ PASS: ${description} (HTTP ${status_code})"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL: ${description} (Expected HTTP ${expected_status}, got HTTP ${status_code})"
    FAIL=$((FAIL + 1))
  fi
}

# Helper function to check if request passes (expects 200 or similar)
check_allowed() {
  local description="$1"
  local url="$2"

  local status_code
  status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

  if [ "$status_code" != "403" ] && [ "$status_code" != "000" ]; then
    echo "✅ PASS: ${description} (HTTP ${status_code} - not blocked)"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL: ${description} (HTTP ${status_code} - unexpectedly blocked)"
    FAIL=$((FAIL + 1))
  fi
}

echo "--- Test 1: SQL Injection Protection ---"
check_blocked "SQLi in query string (UNION SELECT)" "https://${DOMAIN}/api/test?id=1%20UNION%20SELECT%20*%20FROM%20users"
check_blocked "SQLi in query string (OR 1=1)" "https://${DOMAIN}/api/test?id=1%27%20OR%20%271%27%3D%271"
check_blocked "SQLi comment injection" "https://${DOMAIN}/api/test?id=1--"
echo ""

echo "--- Test 2: XSS Protection ---"
check_blocked "XSS script tag" "https://${DOMAIN}/api/test?q=%3Cscript%3Ealert(1)%3C/script%3E"
check_blocked "XSS javascript: protocol" "https://${DOMAIN}/api/test?url=javascript:alert(1)"
check_blocked "XSS onerror handler" "https://${DOMAIN}/api/test?img=%3Cimg%20onerror%3Dalert(1)%3E"
echo ""

echo "--- Test 3: Path Traversal Protection ---"
check_blocked "Path traversal (../)" "https://${DOMAIN}/../../etc/passwd"
check_blocked "Path traversal (/etc/passwd)" "https://${DOMAIN}/api/../etc/passwd"
check_blocked "Path traversal (/proc/self)" "https://${DOMAIN}/proc/self/environ"
echo ""

echo "--- Test 4: Attack Tool Blocking ---"
local_status=$(curl -s -o /dev/null -w "%{http_code}" -A "sqlmap/1.0" "https://${DOMAIN}/api/health" 2>/dev/null || echo "000")
if [ "$local_status" = "403" ]; then
  echo "✅ PASS: sqlmap user agent blocked (HTTP ${local_status})"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: sqlmap user agent not blocked (HTTP ${local_status})"
  FAIL=$((FAIL + 1))
fi
echo ""

echo "--- Test 5: Legitimate Traffic Passes ---"
check_allowed "Normal API request" "https://${DOMAIN}/api/health"
check_allowed "Normal page request" "https://${DOMAIN}/"
echo ""

echo "--- Test 6: Cloudflare Headers Present ---"
cf_ray=$(curl -s -I "https://${DOMAIN}/" 2>/dev/null | grep -i "cf-ray" || echo "")
if [ -n "$cf_ray" ]; then
  echo "✅ PASS: Cloudflare cf-ray header present (traffic is proxied)"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: Cloudflare cf-ray header missing (traffic may not be proxied)"
  FAIL=$((FAIL + 1))
fi
echo ""

echo "============================================="
echo "Results: ${PASS} passed, ${FAIL} failed"
echo "============================================="

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "⚠️  Some tests failed. Please verify:"
  echo "  1. Domain is proxied through Cloudflare (orange cloud)"
  echo "  2. WAF managed rulesets are enabled"
  echo "  3. Custom WAF rules are deployed"
  exit 1
fi

echo ""
echo "✅ All WAF protection tests passed!"
exit 0
