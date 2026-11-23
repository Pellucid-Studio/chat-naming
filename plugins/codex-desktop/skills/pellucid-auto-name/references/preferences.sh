#!/bin/sh
set -eu
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$(/usr/bin/uname -s)" = Darwin ] || fail "unsupported-platform"
profile=${CODEX_HOME:-${HOME:?}/.codex}
case "$profile" in /*) ;; *) fail "invalid-profile" ;; esac
profile=$(cd -P -- "$profile" && pwd -P) || fail "invalid-profile"
dir="$profile/pellucid-chat-naming"
prefs="$dir/preferences.plist"
[ ! -L "$dir" ] && [ ! -L "$prefs" ] || fail "unsafe-preferences-path"

check_values() {
    [ "$#" -eq 5 ] || fail "invalid-preferences"
    language_mode=$1 fixed_language=$2 stage_kind=$3 stage_label=$4 mode=$5
    case "$language_mode" in
        auto) [ -z "$fixed_language" ] || fail "invalid-language" ;;
        fixed)
            case "$fixed_language" in *[!A-Za-z0-9-]*) fail "invalid-language" ;; esac
            [ "${#fixed_language}" -le 63 ] &&
                printf '%s\n' "$fixed_language" | LC_ALL=C /usr/bin/grep -Eq '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' ||
                fail "invalid-language"
            ;;
        *) fail "invalid-language" ;;
    esac
    case "$stage_kind" in
        phase|level|step) [ -z "$stage_label" ] || fail "invalid-label" ;;
        custom)
            [ -n "$stage_label" ] || fail "invalid-label"
            case "$stage_label" in *'·'*|*'—'*|*'…'*) fail "invalid-label" ;; esac
            without_controls=$(printf '%s' "$stage_label" | LC_ALL=C /usr/bin/tr -d '\000-\037\177')
            [ "$without_controls" = "$stage_label" ] || fail "invalid-label"
            [ "$(printf '%s' "$stage_label" | LC_ALL=en_US.UTF-8 /usr/bin/wc -m)" -le 24 ] ||
                fail "invalid-label"
            printf '%s' "$stage_label" | LC_ALL=C /usr/bin/grep -q '[^[:space:]]' || fail "invalid-label"
            ;;
        *) fail "invalid-label" ;;
    esac
    case "$mode" in auto|on-demand) ;; *) fail "invalid-mode" ;; esac
}

extract() {
    /usr/bin/plutil -extract "$1" raw -expect "$2" -o - "$prefs"
}

read_settings() {
    [ -f "$prefs" ] || { printf '%s\n' '{"configured":false}'; return; }
    [ "$(/usr/bin/stat -f %z "$prefs")" -le 4096 ] || fail "invalid-preferences"
    [ "$(extract schema_version integer)" = 1 ] || fail "invalid-preferences"
    selected_language=$(extract language_mode string) || fail "invalid-language"
    language_tag=$(extract fixed_language string) || fail "invalid-language"
    selected_kind=$(extract stage_label_kind string) || fail "invalid-label"
    selected_label=$(extract stage_label string) || fail "invalid-label"
    selected_mode=$(extract invocation_mode string) || fail "invalid-mode"
    check_values "$selected_language" "$language_tag" "$selected_kind" "$selected_label" "$selected_mode"
    /usr/bin/plutil -convert json -o - "$prefs"
}

case "${1-}" in
    read) [ "$#" -eq 1 ] || fail "invalid-command"; read_settings ;;
    save)
        shift
        check_values "$@"
        /bin/mkdir -p -- "$dir"
        [ ! -L "$dir" ] && [ ! -L "$prefs" ] || fail "unsafe-preferences-path"
        scratch=$(/usr/bin/mktemp "$dir/.preferences.XXXXXXXX")
        trap '/bin/rm -f -- "$scratch"' EXIT
        trap 'exit 1' HUP INT TERM
        /usr/bin/plutil -create xml1 "$scratch"
        /usr/bin/plutil -insert schema_version -integer 1 "$scratch"
        /usr/bin/plutil -insert language_mode -string "$language_mode" "$scratch"
        /usr/bin/plutil -insert fixed_language -string "$fixed_language" "$scratch"
        /usr/bin/plutil -insert stage_label_kind -string "$stage_kind" "$scratch"
        /usr/bin/plutil -insert stage_label -string "$stage_label" "$scratch"
        /usr/bin/plutil -insert invocation_mode -string "$mode" "$scratch"
        /bin/mv -f -- "$scratch" "$prefs"
        read_settings
        ;;
    *) fail "invalid-command" ;;
esac
