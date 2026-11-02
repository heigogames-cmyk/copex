#!/usr/bin/env bash
set -euo pipefail
source_root="${1:?Informe a pasta do projeto extraido.}"
app_dir="${COPEX_WINDOWS_APP_DIR:-$HOME/.local/share/copex-studio}"
runtime_dir="${COPEX_WINDOWS_RUNTIME_DIR:-$HOME/.local/share/copex-runtime}"
export PATH="$runtime_dir/node/bin:$PATH"
port="${PORT:-3001}"
if [[ ! "$port" =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
  echo 'Porta invalida.' >&2; exit 1
fi
open_browser() {
  echo "Abra no navegador: http://localhost:$port"
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process 'http://localhost:$port'" >/dev/null 2>&1 || true
  fi
}
need_system=false
for tool in ffmpeg ffprobe curl tar xz sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || need_system=true
done
test -r /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf || need_system=true
if $need_system; then
  echo 'Instalando FFmpeg e fontes no Ubuntu. Pode pedir sua senha do Ubuntu.'
  if ((EUID == 0)); then
    apt-get update
    apt-get install -y ffmpeg curl ca-certificates xz-utils fonts-dejavu-core
  else
    sudo apt-get update
    sudo apt-get install -y ffmpeg curl ca-certificates xz-utils fonts-dejavu-core
  fi
fi
if ! command -v npm >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1 || ! node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' 2>/dev/null; then
  echo 'Baixando Node.js 24 do site oficial e verificando SHA-256...'
  case "$(uname -m)" in x86_64) node_arch=x64 ;; aarch64) node_arch=arm64 ;; *) echo 'Processador nao suportado.' >&2; exit 1 ;; esac
  mkdir -p "$runtime_dir"
  download_dir="$(mktemp -d "$runtime_dir/download.XXXXXX")"
  trap 'rm -rf -- "$download_dir"' EXIT
  curl --fail --location --retry 2 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$download_dir/SHASUMS256.txt"
  node_file="$(awk -v arch="$node_arch" '$2 ~ ("^node-v24[.][0-9]+[.][0-9]+-linux-" arch "[.]tar[.]xz$") {print $2; exit}' "$download_dir/SHASUMS256.txt")"
  test -n "$node_file" || { echo 'Pacote oficial do Node nao encontrado.' >&2; exit 1; }
  curl --fail --location --retry 2 "https://nodejs.org/dist/latest-v24.x/$node_file" -o "$download_dir/$node_file"
  (cd "$download_dir"; awk -v name="$node_file" '$2 == name' SHASUMS256.txt | sha256sum --check --status)
  mkdir -p "$download_dir/node"
  tar -xJf "$download_dir/$node_file" -C "$download_dir/node" --strip-components=1
  rm -rf -- "$runtime_dir/node"
  mv "$download_dir/node" "$runtime_dir/node"
  rm -rf -- "$download_dir"
  trap - EXIT
fi
node --version
# Reuse only an actual Copex server, never an unrelated service on this port.
if node --input-type=module -e 'const r=await fetch("http://127.0.0.1:"+process.argv[1]+"/api/state",{signal:AbortSignal.timeout(1500)});const s=await r.json();if(!r.ok||!Array.isArray(s.assets)||!Array.isArray(s.jobs)||!s.defaults)process.exit(1)' "$port" >/dev/null 2>&1; then
  echo 'O Copex ja esta aberto neste computador.'; open_browser; exit 0
fi
mkdir -p "$app_dir"
for item in package.json package-lock.json server shared scripts public dist; do
  test -e "$source_root/$item" || { echo "Arquivo ausente: $item. Extraia o ZIP inteiro antes de abrir." >&2; exit 1; }
  cp -R -- "$source_root/$item" "$app_dir/"
done
cd "$app_dir"
lock_hash="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
installed_hash="$(cat .installed-lock.sha256 2>/dev/null || true)"
if [[ ! -d node_modules || "$installed_hash" != "$lock_hash" ]]; then
  echo 'Instalando dependencias do aplicativo...'
  npm ci --omit=dev --no-audit --no-fund --cache "$app_dir/.npm-cache"
  printf '%s\n' "$lock_hash" > .installed-lock.sha256
fi
echo 'Iniciando. Mantenha esta janela aberta enquanto usa o Copex.'
export NODE_ENV=production PORT="$port"
node server/index.js &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
ready=false
for ((attempt=0; attempt<120; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then wait "$server_pid"; exit 1; fi
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null; then ready=true; break; fi
  sleep 1
done
if ! $ready; then echo 'O servidor nao respondeu. Envie uma foto desta janela para receber ajuda.' >&2; exit 1; fi
open_browser
wait "$server_pid"
