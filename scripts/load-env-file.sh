#!/usr/bin/env bash
# Load KEY=value lines from a .env file without bash-evaluating values (safe for passwords with ()$! etc.).
# Usage: load_env_file /path/to/.env.staging
load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "[load-env-file] missing: $file" >&2
    return 1
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      "" | \#*) continue ;;
    esac
    if [[ "$line" != *=* ]]; then
      continue
    fi
    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    if [[ "$val" == \"*\" && "$val" == *\" ]]; then
      val="${val:1:${#val}-2}"
    elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
      val="${val:1:${#val}-2}"
    fi
    export "${key}=${val}"
  done < "$file"
}
