#!/usr/bin/env bash
# From outside: is the Cloudflare edge and DNS of alyr.qa as docs/runbooks/cloudflare-edge.md says
# (ALY-116, ALY-266 CLD-7 and CLD-18)? Needs only curl; openssl is used for the TLS-version checks when
# it is there. Reads no secret and changes nothing: it asks the public addresses and public DNS (over
# HTTPS, so it works where port 53 is blocked). The two webhook checks send an empty body, which the
# API refuses before it does anything.
#
#   scripts/check-edge.sh
#
# Other hosts or another zone:  ALYR_ZONE=alyr.qa  ALYR_APP=app.alyr.qa  ALYR_API=api.alyr.qa
#                               ALYR_MEDIA=media.alyr.qa  ALYR_PARKED=alyr.online (the domain that sends no mail)
set -u

zone="${ALYR_ZONE:-alyr.qa}"
app="${ALYR_APP:-app.$zone}"
api="${ALYR_API:-api.$zone}"
media="${ALYR_MEDIA:-media.$zone}"
failed=0

say() { printf '%-5s %s\n' "$1" "$2"; }
pass() { say PASS "$1"; }
fail() { say FAIL "$1"; failed=1; }
warn() { say WARN "$1"; }
get() { curl -sS --max-time 25 "$@" 2>/dev/null || true; }
code() { curl -sS --max-time 25 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000; }
headers() { curl -sS --max-time 25 -o /dev/null -D - "$@" 2>/dev/null | tr -d '\r' || true; }
has_header() { printf '%s\n' "$1" | grep -qi "^$2:"; }
# TXT or CAA records of a name, one per line, through Cloudflare's DNS-over-HTTPS (JSON).
dns() {
  # Cloudflare's resolver first; Google's if it has nothing (a new record can hide behind a short negative cache).
  # The answer section only: a name with no record comes back with the zone's SOA under "Authority".
  local out
  out="$(curl -sS --max-time 25 -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=$1&type=$2" 2>/dev/null |
    tr -d '\n' | sed 's/"Authority":\[[^]]*\]//g' | grep -o '"data":"[^}]*')"
  [ -n "$out" ] || out="$(curl -sS --max-time 25 "https://dns.google/resolve?name=$1&type=$2" 2>/dev/null |
    tr -d '\n' | sed 's/"Authority":\[[^]]*\]//g' | grep -o '"data":"[^}]*')"
  printf '%s\n' "$out" | sed 's/^"data":"//; s/"$//; s/\\"/"/g; s/" "//g; s/^"//; s/"$//'
}

echo "== 1. HTTPS only (CLD-7)"
for host in "$zone" "$app" "$api" "$media"; do
  h="$(headers "http://$host/")"
  status="$(printf '%s\n' "$h" | head -1 | awk '{print $2}')"
  where="$(printf '%s\n' "$h" | grep -i '^location:' | head -1 | awk '{print $2}')"
  case "$where" in
    https://*) [ "$status" = 301 ] && pass "http://$host/ moves to HTTPS (301)" || fail "http://$host/ answered $status, not 301" ;;
    *) fail "http://$host/ answered $status and does not point to HTTPS" ;;
  esac
done

echo "== 2. The site, sign-in and the API answer"
[ "$(code "https://$zone/")" = 200 ] && pass "https://$zone/ answers 200" || fail "https://$zone/ does not answer 200"
[ "$(code "https://$app/login")" = 200 ] && pass "https://$app/login answers 200" || fail "https://$app/login does not answer 200"
ready="$(get "https://$api/health/ready")"
case "$ready" in *'"status":"ok"'*) pass "https://$api/health/ready says ok" ;; *) fail "https://$api/health/ready answered: $ready" ;; esac

echo "== 3. The webhooks still reach the API (the answer must come from the API, not from Cloudflare)"
w="$(get -X POST -H 'content-type: application/json' -d '{}' "https://$api/webhooks/whatsapp")"
case "$w" in *'bad signature'*) pass "WhatsApp webhook: an unsigned post is refused by the API" ;; *) fail "WhatsApp webhook answered: $w" ;; esac
v="$(get "https://$api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1")"
case "$v" in *'verification failed'*) pass "WhatsApp webhook: a wrong verify token is refused by the API" ;; *) fail "WhatsApp verification answered: $v" ;; esac
p="$(get -X POST -H 'content-type: application/json' -d '{}' "https://$api/api/billing/paddle/webhook")"
case "$p" in *'not signed by Paddle'*) pass "Paddle webhook: an unsigned post is refused by the API" ;; *) fail "Paddle webhook answered: $p" ;; esac
s="$(code -X POST -H 'content-type: application/json' -d '{}' "https://$api/api/auth/code")"
[ "$s" = 422 ] && pass "sign-in code route answers (an empty body is refused with 422, no email sent)" || fail "sign-in code route answered $s, expected 422"

echo "== 4. Security headers (SEC-11, CLD-7)"
for host in "$zone" "$app" "$api" "$media"; do
  case "$host" in "$api") h="$(headers "https://$host/health/ready")" ;; "$app") h="$(headers "https://$host/login")" ;; *) h="$(headers "https://$host/")" ;; esac
  missing=""
  for name in strict-transport-security x-content-type-options; do has_header "$h" "$name" || missing="$missing $name"; done
  if [ "$host" = "$api" ] || [ "$host" = "$app" ] || [ "$host" = "$zone" ]; then
    has_header "$h" x-frame-options || missing="$missing x-frame-options"
  fi
  if [ "$host" = "$app" ]; then
    has_header "$h" content-security-policy || missing="$missing content-security-policy"
    has_header "$h" x-powered-by && missing="$missing (x-powered-by is still sent)"
  fi
  [ -z "$missing" ] && pass "$host sends its security headers" || fail "$host: missing$missing"
done

echo "== 5. TLS versions (CLD-7)"
if command -v openssl >/dev/null 2>&1; then
  for host in "$zone" "$app" "$api" "$media"; do
    for v in tls1 tls1_1; do
      if [ "$v" = tls1 ]; then label="TLS 1.0"; else label="TLS 1.1"; fi
      out="$(echo | timeout 20 openssl s_client -connect "$host:443" -servername "$host" "-$v" -cipher 'ALL:@SECLEVEL=0' 2>&1)"
      if printf '%s' "$out" | grep -q 'alert protocol version'; then
        pass "$host refuses $label"
      elif printf '%s' "$out" | grep -q 'Protocol *: TLSv1'; then
        fail "$host still accepts $label (the minimum TLS version is not 1.2)"
      else
        warn "$host $label: this machine's openssl could not try it (not a failure)"
      fi
    done
    echo | timeout 20 openssl s_client -connect "$host:443" -servername "$host" -tls1_2 2>/dev/null | grep -q 'Protocol *: TLSv1.2' &&
      pass "$host accepts TLS 1.2" || fail "$host does not accept TLS 1.2"
  done
else
  warn "openssl is not installed here: TLS versions not checked"
fi

echo "== 6. Names: CAA, SPF, DKIM, DMARC, MX (CLD-18)"
caa="$(dns "$zone" CAA)"
for ca in letsencrypt.org pki.goog ssl.com; do
  if printf '%s\n' "$caa" | grep -q "$ca"; then pass "CAA lets $ca issue"
  else fail "CAA does not mention $ca (Cloudflare could not renew a certificate from it)"; fi
done
txt="$(dns "$zone" TXT)"
spf="$(printf '%s\n' "$txt" | grep -i '^v=spf1' | head -1)"
case "$spf" in
  *zohomail.com*) pass "SPF lets Zoho Mail send: $spf" ;;
  *) fail "SPF does not include zohomail.com: ${spf:-none}" ;;
esac
case "$spf" in *_spf.mx.cloudflare.net*) fail "SPF still carries the retired Cloudflare Email Routing include" ;; *) pass "SPF has no retired include" ;; esac
case "$spf" in *' -all'|*' ~all') pass "SPF ends in a policy" ;; *) fail "SPF has no ~all or -all at the end" ;; esac
[ "$(printf '%s\n' "$spf" | grep -oi 'v=spf1' | wc -l)" -le 1 ] || fail "more than one SPF record"
dns "send.$zone" TXT | grep -qi 'v=spf1 include:amazonses.com' && pass "send.$zone has Resend's SPF" || fail "send.$zone has no Resend SPF"
dns "send.$zone" MX | grep -qi 'amazonses.com' && pass "send.$zone has Resend's bounce MX" || fail "send.$zone has no Resend MX"
dns "resend._domainkey.$zone" TXT | grep -q 'p=' && pass "Resend's DKIM key is published" || fail "Resend's DKIM key is missing"
dns "zmail._domainkey.$zone" TXT | grep -qi 'v=DKIM1' && pass "Zoho Mail's DKIM key is published" || fail "Zoho Mail's DKIM key is missing"
mx="$(dns "$zone" MX)"
printf '%s\n' "$mx" | grep -qi 'mx.zoho.com' && pass "MX is Zoho Mail (not to be changed)" || fail "MX is not Zoho Mail: ${mx:-none}"
dmarc="$(dns "_dmarc.$zone" TXT | head -1)"
case "$dmarc" in
  *p=reject*) warn "DMARC is p=reject: $dmarc (the plan stops at quarantine, runbook 'Dates')" ;;
  *p=quarantine*|*p=none*) pass "DMARC: $dmarc" ;;
  *) fail "DMARC is missing or odd: ${dmarc:-none}" ;;
esac
case "$dmarc" in *rua=mailto:*) pass "DMARC reports go to a mailbox" ;; *) fail "DMARC has no rua= report address" ;; esac

echo "== 7. alyr.online sends no mail, so nobody may send as it (CLD-18)"
parked="${ALYR_PARKED:-alyr.online}"
[ "$(dns "$parked" TXT | grep -i '^v=spf1')" = "v=spf1 -all" ] && pass "$parked: SPF allows no sender" || fail "$parked: SPF is not exactly v=spf1 -all"
case "$(dns "_dmarc.$parked" TXT | head -1)" in
  *p=quarantine*|*p=reject*) pass "$parked: DMARC asks receivers to quarantine or reject" ;;
  *) fail "$parked: DMARC is missing or p=none" ;;
esac
[ -z "$(dns "$parked" MX)" ] && pass "$parked: no MX (it receives no mail either)" || fail "$parked has an MX record"

if [ "$failed" = 0 ]; then echo "All checks passed."; else echo "Something is wrong: see docs/runbooks/cloudflare-edge.md, 'How to undo each change'."; fi
exit "$failed"
