#!/usr/bin/env bash
# The release path's two bookkeeping jobs (ALY-269): cut the CHANGELOG, tag the commit.
# Procedure and reasons: docs/runbooks/release.md.
#
#   scripts/release.sh cut   v0.3.1          Turn "## Unreleased" in CHANGELOG.md into the section
#                                            "## v0.3.1 (30 Oct 2026)" and leave an empty "## Unreleased"
#                                            above it. Edits the file; you commit it in a release PR.
#   scripts/release.sh check v0.3.1 [<sha>]  Fail unless v0.3.1 may ship: well formed, the newest cut
#                                            section of CHANGELOG.md, nothing left under "## Unreleased",
#                                            and the tag unused (or already on <sha>). Reads only.
#   scripts/release.sh tag   v0.3.1 <sha>    Tag <sha> v0.3.1 and push the tag. Does nothing if the tag
#                                            is already on <sha>; fails if it is on another commit.
#
# The deploy workflows run `check` before they ship (release-gate.yml) and `tag` after the deploy
# is healthy. CHANGELOG.md is read from the repository root; set CHANGELOG to use another file.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
changelog="${CHANGELOG:-$root/CHANGELOG.md}"

die() { echo "release: $*" >&2; exit 1; }

version_ok() { [[ "$1" =~ ^v0\.[0-9]+\.[0-9]+$ ]]; }

# The text between "## Unreleased" and the next "## " heading, without blank lines.
unreleased_lines() {
  awk '
    { sub(/\r$/, "") }
    /^## / { inside = ($0 ~ /^## Unreleased[[:space:]]*$/); next }
    inside && $0 !~ /^[[:space:]]*$/ { print }
  ' "$changelog"
}

# The first versioned heading below "## Unreleased": the newest cut section, as v0.x.y. Old
# headings read "## 0.2.0 · 16-17 Oct 2026" (no "v"); new ones "## v0.3.0 (30 Oct 2026)".
newest_section() {
  awk '
    { sub(/\r$/, "") }
    /^## Unreleased[[:space:]]*$/ { seen = 1; next }
    seen && /^## v?[0-9]+[.][0-9]+[.][0-9]+/ { v = $2; sub(/^v/, "", v); print "v" v; exit }
  ' "$changelog"
}

# The commit a tag points at on the remote, or nothing when the tag is free. A tag object is
# followed to its commit (the "^{}" line comes last).
tag_commit() {
  git ls-remote --tags origin "refs/tags/$1" "refs/tags/$1^{}" | awk 'END { print $1 }'
}

cmd="${1:-}"
version="${2:-}"
sha="${3:-}"

case "$cmd" in
  cut)
    version_ok "$version" || die "the version must look like v0.3.1, not '$version'"
    grep -q '^## Unreleased' "$changelog" || die "CHANGELOG.md has no '## Unreleased' section"
    [ -n "$(unreleased_lines)" ] || die "nothing under '## Unreleased': there is nothing to release"
    newest="$(newest_section)"
    if [ -n "$newest" ] && [ "$(printf '%s\n%s\n' "$newest" "$version" | sort -V | tail -n 1)" != "$version" ]; then
      die "$version is not newer than $newest, the newest section of CHANGELOG.md"
    fi
    [ "$newest" != "$version" ] || die "CHANGELOG.md already has a section for $version"
    today="$(date +'%-d %b %Y')"
    tmp="$(mktemp)"
    awk -v v="$version" -v d="$today" '
      /^## Unreleased[[:space:]]*\r?$/ && !done { print; print ""; print "## " v " (" d ")"; done = 1; next }
      { print }
    ' "$changelog" > "$tmp"
    cat "$tmp" > "$changelog"
    rm -f "$tmp"
    echo "release: CHANGELOG.md cut as $version ($today). Commit it in a release PR."
    ;;

  check)
    version_ok "$version" || die "the version must look like v0.3.1, not '$version'"
    newest="$(newest_section)"
    [ -n "$newest" ] || die "CHANGELOG.md has no cut section below '## Unreleased': run scripts/release.sh cut $version in a release PR first"
    [ "$newest" = "$version" ] \
      || die "the newest cut section of CHANGELOG.md is $newest, not $version: cut $version (release PR) or ship $newest"
    left="$(unreleased_lines | head -n 3)"
    [ -z "$left" ] || die "changes are still under '## Unreleased' in CHANGELOG.md, so they would ship without a version. Cut a new release (scripts/release.sh cut) and ship that"
    if [ -n "$sha" ]; then
      on="$(tag_commit "$version")"
      if [ -n "$on" ] && [ "$on" != "$sha" ]; then
        die "the tag $version already exists on another commit ($on). A version is used once: cut the next one"
      fi
    fi
    echo "release: $version is cut in CHANGELOG.md and may ship."
    ;;

  tag)
    version_ok "$version" || die "the version must look like v0.3.1, not '$version'"
    [ -n "$sha" ] || die "usage: scripts/release.sh tag $version <sha>"
    on="$(tag_commit "$version")"
    if [ -n "$on" ]; then
      [ "$on" = "$sha" ] || die "the tag $version already exists on another commit ($on)"
      echo "release: $version is already on ${sha:0:12}."
      exit 0
    fi
    git tag "$version" "$sha"
    git push origin "refs/tags/$version"
    echo "release: tagged ${sha:0:12} as $version."
    ;;

  *)
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
    exit 2
    ;;
esac
