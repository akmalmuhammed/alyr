#!/usr/bin/env bash
# After a release: does production answer, in both languages, with its security headers on?
# (ALY-122; the post-deploy check in docs/runbooks/release.md.)
#
# READ ONLY. Every request is a plain GET of a public address. It signs nobody in, sends no
# code, submits no form and creates nothing; it reads no secret and needs only curl. Anything
# that would change something (a POST, a header with a token) is not in this file, and must not
# be added: the journeys that sign in and order run against a local stack in CI instead
# (tests/e2e, the `e2e` job).
#
#   scripts/smoke-production.sh                      what is live, right now
#   scripts/smoke-production.sh --commit 267c68a     and the public site is that commit (alyr.qa/version.txt)
#   scripts/smoke-production.sh --signup open        and the sign-up door is open (or: closed)
#
# Other hosts, e.g. to try it on a staging copy:  ALYR_ZONE=alyr.qa  ALYR_APP=app.alyr.qa  ALYR_API=api.alyr.qa
# Exit status: 0 when nothing failed, 1 otherwise. A WARN is not a failure.
set -u

zone="${ALYR_ZONE:-alyr.qa}"
app="${ALYR_APP:-app.$zone}"
api="${ALYR_API:-api.$zone}"
expect_commit=""
expect_signup=""
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) expect_commit="${2:-}"; shift 2 ;;
    --signup) expect_signup="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "smoke-production: unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
done
case "$expect_signup" in ""|open|closed) ;; *) echo "smoke-production: --signup takes open or closed" >&2; exit 2 ;; esac

failed=0
say() { printf '%-5s %s\n' "$1" "$2"; }
pass() { say PASS "$1"; }
fail() { say FAIL "$1"; failed=1; }
warn() { say WARN "$1"; }
# The only three ways this script talks to the network, all GET. `|| true` keeps one failed request
# from stopping the rest; an empty answer is then reported as the failure it is.
get() { curl -sS --max-time 25 --request GET "$@" 2>/dev/null || true; }
code() { curl -sS --max-time 25 --request GET -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000; }
headers() { curl -sS --max-time 25 --request GET -o /dev/null -D - "$@" 2>/dev/null | tr -d '\r' || true; }
has_header() { printf '%s\n' "$1" | grep -qi "^$2:"; }

echo "== 1. The public site, in English and Arabic (https://$zone)"
for path in / /chat /bookings /privacy; do
  [ "$(code "https://$zone$path")" = 200 ] && pass "$zone$path answers 200" || fail "$zone$path does not answer 200"
  ar="/ar${path%/}"
  [ "$path" = / ] && ar=/ar
  [ "$(code "https://$zone$ar")" = 200 ] && pass "$zone$ar answers 200" || fail "$zone$ar does not answer 200"
done
home="$(get "https://$zone/")"
case "$home" in *'lang="en"'*) pass "the English home page says lang=en" ;; *) fail "the English home page does not say lang=en" ;; esac
arhome="$(get "https://$zone/ar")"
case "$arhome" in *'lang="ar"'*'dir="rtl"'*) pass "the Arabic home page says lang=ar and reads right to left" ;; *) fail "the Arabic home page is not marked lang=ar dir=rtl" ;; esac
version="$(get "https://$zone/version.txt")"
live="$(printf '%s\n' "$version" | sed -n 's/^commit //p' | head -1)"
if [ -z "$live" ]; then
  fail "https://$zone/version.txt names no commit"
else
  pass "the site is built from commit ${live:0:12} ($(printf '%s\n' "$version" | sed -n 's/^built //p' | head -1))"
  case "$live" in *-dirty) fail "the live site was built from uncommitted changes ($live)" ;; esac
  if [ -n "$expect_commit" ]; then
    case "$live" in "$expect_commit"*) pass "and that is the commit asked for ($expect_commit)" ;; *) fail "the site is ${live:0:12}, not $expect_commit" ;; esac
  fi
fi

echo "== 2. The app: sign-in and sign-up are up (https://$app)"
[ "$(code "https://$app/login")" = 200 ] && pass "$app/login answers 200" || fail "$app/login does not answer 200"
[ "$(code "https://$app/start")" = 200 ] && pass "$app/start (sign-up) answers 200" || fail "$app/start does not answer 200"
# The same list sign-up reads, through the web app to the API and its database.
types="$(get "https://$app/api/onboarding/types")"
case "$types" in
  *'"key":"salon"'*'"key":"bakery"'*) pass "sign-up's list of business types comes back through the web app, from the database" ;;
  *) fail "$app/api/onboarding/types answered: ${types:0:120}" ;;
esac
open="$(printf '%s' "$types" | grep -o '"signup_open":[a-z]*' | head -1 | cut -d: -f2)"
case "$expect_signup:$open" in
  open:true) pass "the sign-up door is open, as asked" ;;
  closed:false) pass "the sign-up door is closed, as asked" ;;
  open:*|closed:*) fail "the sign-up door is $([ "$open" = true ] && echo open || echo closed), not $expect_signup" ;;
  *:true) say INFO "the sign-up door is open" ;;
  *:false) say INFO "the sign-up door is closed" ;;
  *) warn "could not read whether sign-up is open" ;;
esac

echo "== 3. The API is healthy and nothing for developers is on (https://$api)"
for path in /health /health/ready /health/worker; do
  out="$(get "https://$api$path")"
  case "$out" in *'"status":"ok"'*) pass "$api$path says ok" ;; *) fail "$api$path answered: ${out:0:120}" ;; esac
done
case "$(get "https://$api/health/ready")" in *'"database":"ok"'*) pass "the API reaches its database" ;; *) fail "the API does not report its database as ok" ;; esac
for path in /docs /openapi.json /sim/personas; do
  s="$(code "https://$api$path")"
  [ "$s" = 404 ] && pass "$api$path answers 404 (off in production)" || fail "$api$path answered $s, expected 404"
done
for path in /api/auth/me /api/admin/today /api/orders; do
  s="$(code "https://$api$path")"
  [ "$s" = 401 ] && pass "$api$path asks for a sign-in (401)" || fail "$api$path answered $s without a sign-in, expected 401"
done

echo "== 4. Security headers"
for host in "$zone" "$app" "$api"; do
  case "$host" in "$api") h="$(headers "https://$host/health/ready")" ;; "$app") h="$(headers "https://$host/login")" ;; *) h="$(headers "https://$host/")" ;; esac
  missing=""
  for name in strict-transport-security x-content-type-options x-frame-options; do has_header "$h" "$name" || missing="$missing $name"; done
  if [ "$host" = "$app" ]; then
    for name in content-security-policy referrer-policy permissions-policy; do has_header "$h" "$name" || missing="$missing $name"; done
    has_header "$h" x-powered-by && missing="$missing (x-powered-by is sent)"
  fi
  [ "$host" = "$zone" ] && { has_header "$h" content-security-policy || missing="$missing content-security-policy"; }
  [ -z "$missing" ] && pass "$host sends its security headers" || fail "$host: missing$missing"
done
for host in "$zone" "$app" "$api"; do
  h="$(headers "http://$host/")"
  status="$(printf '%s\n' "$h" | head -1 | awk '{print $2}')"
  where="$(printf '%s\n' "$h" | grep -i '^location:' | head -1 | awk '{print $2}')"
  case "$where" in https://*) pass "http://$host/ moves to HTTPS ($status)" ;; *) fail "http://$host/ answered ${status:-nothing} and does not move to HTTPS" ;; esac
done

if [ "$failed" = 0 ]; then
  echo "All checks passed."
else
  echo "Something is wrong. If this is right after a release, roll back first: docs/runbooks/rollback.md."
fi
exit "$failed"
