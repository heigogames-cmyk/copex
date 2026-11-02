#!/bin/sh
set -eu
umask 077
app_dir="${COPEX_WINDOWS_APP_DIR:-$HOME/.local/share/copex-studio}"
mkdir -p "$app_dir"
exec 9>"$app_dir/.mobile-setup.lock"
flock -x 9
file="$app_dir/.access-password"
if [ ! -s "$file" ]; then
  temporary="$(mktemp "$app_dir/.mobile-password.XXXXXX")"
  trap 'rm -f "$temporary"' EXIT
  tr -d '\r\n' > "$temporary"
  if [ "$(wc -c < "$temporary")" -lt 16 ]; then echo 'Senha de preparacao incompleta. Execute o conector novamente.' >&2; exit 1; fi
  chmod 600 "$temporary"
  mv "$temporary" "$file"
  trap - EXIT
fi
chmod 600 "$file"
printf '%s' 1 > "$app_dir/.mobile-private"
chmod 600 "$app_dir/.mobile-private"
cat "$file"
