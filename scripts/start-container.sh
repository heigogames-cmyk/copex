#!/bin/sh
set -eu
data_dir="${COPEX_DATA_DIR:-/var/lib/copex}"
if [ "$(id -u)" = 0 ]; then
  mkdir -p "$data_dir"
  chown node:node "$data_dir"
  exec gosu node:node /bin/sh /app/scripts/start-container.sh "$@"
fi
if [ "${COPEX_INSTALL_MODEL:-0}" = 1 ] && { [ ! -f "$data_dir/models/whisper/model.bin" ] || [ ! -f "$data_dir/models/whisper/config.json" ] || [ ! -f "$data_dir/models/whisper/tokenizer.json" ]; }; then
  mkdir -p "$data_dir/models"
  echo 'Preparando modelo de voz oficial em segundo plano. Acompanhe em Legendas e model-install.log.'
  timeout 600 /app/.tools/bin/python /app/scripts/install-model.py --destination "$data_dir/models/whisper" > "$data_dir/model-install.log" 2>&1 &
fi
exec "$@"
