# shellcheck shell=bash
# Sourced by the scripts in infra/gcp: `gcloud_run <args>` runs gcloud.
#
# On Windows (Git Bash) gcloud is gcloud.cmd, and cmd.exe mangles a command line that has a
# quoted path and a quoted argument (any argument with a space), so the Cloud SDK's own
# Python is called directly instead. Its output ends lines with CR; callers that capture a
# value strip it.
export MSYS_NO_PATHCONV=1
if command -v gcloud.cmd >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
  _sdk="$(cd "$(dirname "$(command -v gcloud.cmd)")/.." && pwd)"
  gcloud_run() { "$_sdk/platform/bundledpython/python.exe" "$(cygpath -w "$_sdk/lib/gcloud.py")" "$@"; }
else
  gcloud_run() { gcloud "$@"; }
fi
