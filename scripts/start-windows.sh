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
for tool in ffmpeg ffprobe curl tar xz sha256sum python3; do
  command -v "$tool" >/dev/null 2>&1 || need_system=true
done
test -r /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf || need_system=true
python3 -c 'import ensurepip' >/dev/null 2>&1 || need_system=true
if $need_system; then
  echo 'Instalando FFmpeg e fontes no Ubuntu. Pode pedir sua senha do Ubuntu.'
  if ((EUID == 0)); then
    apt-get update
    apt-get install -y ffmpeg curl ca-certificates xz-utils fonts-dejavu-core python3 python3-venv
  else
    sudo apt-get update
    sudo apt-get install -y ffmpeg curl ca-certificates xz-utils fonts-dejavu-core python3 python3-venv
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
# Reuse the matching version; do not silently leave an old server running.
existing_version="$(node --input-type=module -e 'const base="http://127.0.0.1:"+process.argv[1];let r=await fetch(base+"/api/ready",{signal:AbortSignal.timeout(1500)});if(r.ok){const s=await r.json();if(s.app==="copex-studio")console.log(s.version||"anterior");}else{r=await fetch(base+"/api/health",{signal:AbortSignal.timeout(1500)});const s=await r.json();if(r.ok&&s.ok&&s.ffmpeg)console.log(s.version||"anterior");}' "$port" 2>/dev/null || true)"
if [[ -n "$existing_version" ]]; then
  source_version="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version' "$source_root/package.json")"
  if [[ "$existing_version" != "$source_version" ]]; then
    echo 'Uma versao anterior do Copex esta aberta. Feche a janela antiga do Copex e abra este iniciador novamente.' >&2
    exit 1
  fi
  echo 'O Copex ja esta aberto neste computador.'; open_browser; exit 0
fi
mkdir -p "$app_dir"
for item in package.json package-lock.json requirements-tools.txt server shared scripts public dist; do
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
if ! python3 -c 'import sys; assert sys.version_info >= (3,12)' >/dev/null 2>&1; then
  echo 'Para todas as ferramentas, use Ubuntu atualizado com Python 3.12 ou superior.' >&2
  exit 1
fi
python_hash="$(sha256sum requirements-tools.txt | cut -d ' ' -f 1)"
installed_python="$(cat .installed-python.sha256 2>/dev/null || true)"
if [[ ! -x .tools/bin/python || "$installed_python" != "$python_hash" ]]; then
  echo 'Preparando importacao e transcricao. A primeira vez pode demorar alguns minutos...'
  python3 -m venv .tools
  .tools/bin/python -m pip install --disable-pip-version-check -r requirements-tools.txt
  .tools/bin/python -m pip check
  printf '%s\n' "$python_hash" > .installed-python.sha256
fi
model_pid=""
if [[ "${COPEX_INSTALL_MODEL:-1}" == 1 ]] && { [[ ! -f .data/models/whisper/model.bin ]] || [[ ! -f .data/models/whisper/config.json ]] || [[ ! -f .data/models/whisper/tokenizer.json ]]; }; then
  mkdir -p .data/models
  echo 'Preparando o modelo oficial de voz em segundo plano. As outras ferramentas ja podem abrir.'
  timeout 600 .tools/bin/python scripts/install-model.py --destination .data/models/whisper > .data/model-install.log 2>&1 &
  model_pid=$!
fi
echo 'Iniciando. Mantenha esta janela aberta enquanto usa o Copex.'
if [[ -s .access-password ]]; then export COPEX_ACCESS_PASSWORD="$(tr -d '\r\n' < .access-password)"; fi
if [[ -f .mobile-private || -s .access-password ]]; then export COPEX_REQUIRE_AUTH=1; fi
export NODE_ENV=production PORT="$port"
node server/index.js &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; if [[ -n "$model_pid" ]]; then kill "$model_pid" 2>/dev/null || true; fi' EXIT
trap 'exit 130' INT TERM
ready=false
for ((attempt=0; attempt<120; attempt++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then wait "$server_pid"; exit 1; fi
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$port/api/ready" >/dev/null; then ready=true; break; fi
  sleep 1
done
if ! $ready; then echo 'O servidor nao respondeu. Envie uma foto desta janela para receber ajuda.' >&2; exit 1; fi
open_browser
wait "$server_pid"
