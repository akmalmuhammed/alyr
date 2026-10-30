#!/usr/bin/env python3
"""Alert policies for ALYR on Google Cloud Monitoring (ALY-277). Called by monitoring.sh,
which puts a short-lived access token in ALYR_GCP_TOKEN; nothing else is needed. Standard library only.

  alerts.py channels                       the notification channels that can deliver (enabled, not unverified)
  alerts.py apply <file.json>... --db <project:instance> --channels <name,...>
                                           create or replace each policy, matched by display name
  alerts.py attach --channels <name,...>   put exactly these channels on every policy in the project
  alerts.py status                         channels, policies and alerts that are open now
  alerts.py test-fire --channels <name,...> open a throwaway alert, wait for it, delete it

No customer data is read or written; policies hold metric names and thresholds.
"""
import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = os.environ.get("ALYR_GCP_PROJECT", "alyr-prod")
BASE = f"https://monitoring.googleapis.com/v3/projects/{PROJECT}"
TEST_NAME = "ALYR test alert (throwaway, deleted within minutes)"


def call(method, path, body=None, missing_ok=False, **params):
    url = f"{BASE}/{path}" if not path.startswith("https://") else path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={"Authorization": "Bearer " + os.environ["ALYR_GCP_TOKEN"], "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        if e.code == 404 and missing_ok:
            return {}
        sys.exit(f"alerts: {method} {path} answered {e.code}: {e.read().decode()[:700]}")


def listing(path, key, **params):
    items, token = [], None
    while True:
        page = call("GET", path, **params, **({"pageToken": token} if token else {}))
        items += page.get(key, [])
        token = page.get("nextPageToken")
        if not token:
            return items


def usable_channels():
    # An SMS number that was never verified would be attached and then never deliver.
    return [c for c in listing("notificationChannels", "notificationChannels")
            if c.get("enabled", True) and c.get("verificationStatus") != "UNVERIFIED"]


def policies():
    return {p["displayName"]: p for p in listing("alertPolicies", "alertPolicies")}


def has_data(metric):
    """True once a log-based metric has reported at least one point in the last 7 days."""
    now = time.time()
    iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
    # A metric made a minute ago is not known to Monitoring yet: 404 means "no data".
    series = call("GET", "timeSeries", missing_ok=True, filter=f'metric.type="logging.googleapis.com/user/{metric}"',
                  **{"interval.startTime": iso(now - 7 * 86400), "interval.endTime": iso(now), "view": "HEADERS"})
    return bool(series.get("timeSeries"))


def put(body):
    """Create the policy, or replace the one with the same display name. Returns the verb."""
    existing = policies().get(body["displayName"])
    if existing:
        call("PATCH", existing["name"].split(f"projects/{PROJECT}/")[1], body)
        return "updated"
    call("POST", "alertPolicies", body)
    return "created"


def apply(args):
    channels = args.channels.split(",")
    for file in args.files:
        text = pathlib.Path(file).read_text(encoding="utf-8")
        body = json.loads(text.replace("__DB__", args.db).replace("__PROJECT__", PROJECT))
        # A "nothing for 30 hours" rule needs the metric to have reported once, or it would
        # fire the moment it is made. It is created on the first run after the first report.
        needs = body.pop("_needs_metric", None)
        body.setdefault("enabled", True)
        body["notificationChannels"] = channels
        if needs and not has_data(needs):
            print(f"  waiting  {body['displayName']} (metric {needs} has not reported yet; run apply again after the first night)")
            continue
        print(f"  {put(body):8} {body['displayName']}")


def attach(args):
    channels = args.channels.split(",")
    for name, policy in policies().items():
        if name == TEST_NAME or set(policy.get("notificationChannels", [])) == set(channels):
            continue
        call("PATCH", policy["name"].split(f"projects/{PROJECT}/")[1], {"notificationChannels": channels},
             updateMask="notificationChannels")
        print(f"  channels set on {name}")


def status(_args):
    print("Channels:")
    for c in listing("notificationChannels", "notificationChannels"):
        print(f"  {c['name'].split('/')[-1]:22} {c['type']:12} {c.get('displayName', ''):28} "
              f"enabled={c.get('enabled', True)} {c.get('verificationStatus', '')}")
    print("Policies:")
    for name, p in sorted(policies().items()):
        print(f"  {'on ' if p.get('enabled', True) else 'OFF'} {len(p.get('notificationChannels', []))} channel(s)  {name}")
    open_alerts = listing("alerts", "alerts", filter='state="OPEN"')
    print(f"Open alerts: {len(open_alerts)}")
    for a in open_alerts:
        print(f"  since {a['openTime']}  {a['policy']['displayName']}")


def test_fire(args):
    """A condition that is always met (the database CPU is above zero), so Google opens an
    alert and sends it to every channel. Deleting the policy closes it."""
    if TEST_NAME in policies():
        sys.exit("alerts: a test alert already exists; delete it in Monitoring first")
    body = {
        "displayName": TEST_NAME, "combiner": "OR", "enabled": True,
        "notificationChannels": args.channels.split(","),
        "documentation": {"mimeType": "text/markdown",
                          "content": "TEST ONLY. Started by infra/gcp/monitoring.sh test-fire to prove alerts arrive. Nothing is wrong. It is deleted within minutes."},
        "conditions": [{"displayName": "Always met (test)", "conditionThreshold": {
            "filter": 'metric.type="cloudsql.googleapis.com/database/cpu/utilization" AND resource.type="cloudsql_database"',
            "aggregations": [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_MEAN"}],
            "comparison": "COMPARISON_GT", "thresholdValue": 0, "duration": "0s", "trigger": {"count": 1}}}],
    }
    created = call("POST", "alertPolicies", body)
    policy_id = created["name"]
    started = time.time()
    print(f"Test policy made; waiting for Google to open the alert (took 5 minutes on 29 Oct 2026; gives up after 10)...")
    opened = None
    try:
        while time.time() - started < 600 and not opened:
            time.sleep(15)
            for a in listing("alerts", "alerts", filter=f'policy.name="{policy_id}"'):
                opened = a
                break
        if opened:
            print(f"OPENED after {int(time.time() - started)} s: alert {opened['name'].split('/')[-1]} "
                  f"state {opened['state']} openTime {opened['openTime']}")
            print("Google sends the notification when the alert opens; check the inbox and the phone now.")
            time.sleep(60)  # leave it open long enough to be seen on a phone
        else:
            print("NOT OPENED within 10 minutes.")
    finally:
        call("DELETE", policy_id.split(f"projects/{PROJECT}/")[1])
        print("Test policy deleted.")
    sys.exit(0 if opened else 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("channels")
    p = sub.add_parser("apply")
    p.add_argument("files", nargs="+")
    p.add_argument("--db", required=True)
    p.add_argument("--channels", required=True)
    for name in ("attach", "test-fire"):
        sub.add_parser(name).add_argument("--channels", required=True)
    sub.add_parser("status")
    args = parser.parse_args()
    if args.command == "channels":
        for c in usable_channels():
            print(f"{c['name']}\t{c['type']}\t{c.get('displayName', '')}")
    else:
        {"apply": apply, "attach": attach, "status": status, "test-fire": test_fire}[args.command](args)


if __name__ == "__main__":
    main()
