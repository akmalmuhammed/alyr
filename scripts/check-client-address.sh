#!/usr/bin/env bash
# From outside: does the API count the right address for a visitor (ALY-265)? Steps and what to
# do with the answer: docs/runbooks/client-address.md. Needs only curl. Reads no secret and changes
# nothing: it asks the API's read-only /api/client-address, which says what address it would
# count and who vouched for it.
#
#   scripts/check-client-address.sh
#
# Run it from your laptop, then again from a phone on mobile data (a second network): the address
# in the first line must differ between the two. Settings for another environment:
#   ALYR_EDGE_API=https://api.alyr.qa  ALYR_EDGE_APP=https://app.alyr.qa
#   ALYR_RUN_API=https://alyr-api-841433519399.me-central1.run.app   (the API's own address)
set -u

edge_api="${ALYR_EDGE_API:-https://api.alyr.qa}"
edge_app="${ALYR_EDGE_APP:-https://app.alyr.qa}"
run_api="${ALYR_RUN_API:-https://alyr-api-841433519399.me-central1.run.app}"
failed=0

say() { printf '%-4s %s\n' "$1" "$2"; }
pass() { say PASS "$1"; }
fail() { say FAIL "$1"; failed=1; }
get() { curl -sS --max-time 30 "$@" 2>/dev/null || true; }
# One field of the small JSON the route answers: {"address":"...","source":"...","counting":true}
field() { printf '%s' "$2" | sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p"; }

# What Cloudflare itself says your address is: the value the Worker signs.
mine="$(get "$edge_api/cdn-cgi/trace" | sed -n 's/^ip=//p' | tr -d '\r')"
[ -n "$mine" ] || { fail "could not read your address from $edge_api/cdn-cgi/trace"; exit 1; }
echo "     your address as Cloudflare sees it: $mine (compare it with the other network's)"

# 1. Through the edge to the API (api.alyr.qa).
a="$(get "$edge_api/api/client-address")"
if [ "$(field source "$a")" = signed ] && [ "$(field address "$a")" = "$mine" ]; then
  pass "$edge_api: the API counts your address, and the edge vouched for it"
else
  fail "$edge_api answered: $a"
fi
[ "$(field counting "$a")" = true ] && pass "per-address limits are counting" ||
  fail "per-address limits are not counting (ALYR_CLIENT_IP_HEADER is not set on the API)"

# 1b. A visitor who writes the Cloudflare and forwarding headers themselves is not believed: the
#     Worker reads the address Cloudflare saw, and drops what the visitor sent.
e="$(get -H 'CF-Connecting-IP: 198.51.100.77' -H 'x-alyr-client-ip: 198.51.100.78' \
      -H 'x-alyr-client-ip-sig: 0000' -H 'X-Forwarded-For: 198.51.100.79' "$edge_api/api/client-address")"
if [ "$(field source "$e")" = signed ] && [ "$(field address "$e")" = "$mine" ]; then
  pass "$edge_api: addresses a visitor writes themselves are ignored"
else
  fail "$edge_api answered: $e"
fi

# 2. Through the edge, the web app and its /api forwarding to the API (app.alyr.qa).
b="$(get "$edge_app/api/client-address")"
if [ "$(field source "$b")" = signed ] && [ "$(field address "$b")" = "$mine" ]; then
  pass "$edge_app: the same through the web app's forwarding"
else
  fail "$edge_app answered: $b"
fi

# 3. Skipping the edge, with an address and a signature made up: not believed, and not counted
#    as anyone's.
for name in api web; do
  if [ "$name" = api ]; then host="$run_api"; else host="${ALYR_RUN_WEB:-${run_api/alyr-api/alyr-web}}"; fi
  c="$(get -H 'x-alyr-client-ip: 198.51.100.1' -H "x-alyr-client-ip-sig: $(printf '0%.0s' $(seq 1 64))" \
        -H 'x-forwarded-for: 198.51.100.2' "$host/api/client-address")"
  if [ "$(field source "$c")" = unvouched ]; then
    pass "$host: a made-up address is not believed"
  else
    fail "$host answered: $c"
  fi
done

# 4. Skipping the edge with an address and no signature at all.
d="$(get -H 'x-alyr-client-ip: 198.51.100.1' "$run_api/api/client-address")"
[ "$(field source "$d")" = unvouched ] && pass "an address without a signature is not believed" ||
  fail "$run_api answered: $d"

if [ "$failed" = 0 ]; then echo "All checks passed."; else echo "Something is wrong: see docs/runbooks/client-address.md, 'If a check fails'."; fi
exit "$failed"
