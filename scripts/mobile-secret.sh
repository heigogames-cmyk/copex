#!/bin/sh
set -eu
umask 077
app_dir="${COPEX_WINDOWS_APP_DIR:-$HOME/.local/share/copex-studio}"
mkdir -p "$app_dir"
file="$app_dir/.access-password"
if [ ! -s "$file" ]; then tr -d '\r\n' > "$file"; fi
chmod 600 "$file"
printf '%s' 1 > "$app_dir/.mobile-private"
chmod 600 "$app_dir/.mobile-private"
cat "$file"
