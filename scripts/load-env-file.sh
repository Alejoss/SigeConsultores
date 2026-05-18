#!/usr/bin/env bash
# Parse KEY=value lines from a .env file (no bash evaluation — safe for () $ ! in values).
# Usage:
#   load_env_file /path/to/.env
#   load_env_file_keys /path/to/.env AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

_load_env_file_line() {
  local key="$1"
  local val="$2"
  export "${key}=${val}"
}

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
    _load_env_file_line "$key" "$val"
  done < "$file"
}

load_env_file_keys() {
  local file="$1"
  shift
  local -a wanted=("$@")
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
    local match=0
    for w in "${wanted[@]}"; do
      if [ "$key" = "$w" ]; then
        match=1
        break
      fi
    done
    [ "$match" -eq 1 ] || continue
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    if [[ "$val" == \"*\" && "$val" == *\" ]]; then
      val="${val:1:${#val}-2}"
    elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
      val="${val:1:${#val}-2}"
    fi
    _load_env_file_line "$key" "$val"
  done < "$file"
}
