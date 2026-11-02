"""Install official local Whisper weights without replacing a working model on failure."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import sys
import time
import uuid
from huggingface_hub import snapshot_download

parser = argparse.ArgumentParser()
parser.add_argument('--destination', default='.data/models/whisper')
parser.add_argument('--model', choices=['tiny', 'base', 'small'], default='tiny')
args = parser.parse_args()
destination = Path(args.destination).absolute()
destination.parent.mkdir(parents=True, exist_ok=True)
status_file = Path(str(destination) + '.status.json')

def status(state, error=None):
    value = {'state': state, 'model': args.model, 'pid': os.getpid(), 'updatedAt': time.time(), 'error': error}
    temporary = Path(str(status_file) + '.tmp')
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.replace(status_file)

def complete(folder):
    return all((folder / name).is_file() and (folder / name).stat().st_size > 0 for name in ['model.bin', 'config.json', 'tokenizer.json'])

with open(str(destination) + '.install.lock', 'a') as lock:
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
    info = destination / 'copex-model.json'
    if complete(destination) and info.is_file():
        try:
            if json.loads(info.read_text()).get('model') == args.model:
                status('done')
                print('Modelo já instalado em', destination)
                raise SystemExit(0)
        except (ValueError, OSError):
            pass
    staging = Path(str(destination) + '.download-' + args.model)
    previous = Path(str(destination) + '.previous-' + uuid.uuid4().hex)
    moved = False
    try:
        status('downloading')
        snapshot_download(
            repo_id='Systran/faster-whisper-' + args.model,
            local_dir=str(staging),
            allow_patterns=['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.*', 'preprocessor_config.json'],
        )
        if not complete(staging):
            raise RuntimeError('O download não produziu todos os arquivos necessários.')
        (staging / 'copex-model.json').write_text(json.dumps({'model': args.model}), encoding='utf-8')
        if destination.exists():
            destination.rename(previous)
            moved = True
        try:
            staging.rename(destination)
        except Exception:
            if moved:
                previous.rename(destination)
            raise
        if moved:
            shutil.rmtree(previous, ignore_errors=True)
        status('done')
    except Exception:
        message = 'Não foi possível instalar o modelo oficial. Confira acesso HTTPS à Hugging Face e seus servidores de arquivos; mantenha a verificação TLS ativada. O modelo anterior foi preservado. Nenhum áudio foi transcrito.'
        status('failed', message)
        print(message, file=sys.stderr)
        raise SystemExit(1)
print('Modelo instalado em', destination)
