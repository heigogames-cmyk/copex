"""Explicit trusted model installation; honors the configured HTTPS proxy and TLS."""
import argparse
import os
import sys
from huggingface_hub import snapshot_download

parser = argparse.ArgumentParser()
parser.add_argument('--destination', default='.data/models/whisper')
parser.add_argument('--model', choices=['tiny', 'base', 'small'], default='tiny')
args = parser.parse_args()
try:
    snapshot_download(
        repo_id='Systran/faster-whisper-' + args.model,
        local_dir=args.destination,
        allow_patterns=['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.*', 'preprocessor_config.json'],
    )
    if not all(os.path.isfile(os.path.join(args.destination, f)) for f in ['model.bin', 'config.json', 'tokenizer.json']):
        raise RuntimeError('O download não produziu todos os arquivos necessários.')
except Exception:
    print('Não foi possível instalar o modelo oficial. Confira acesso HTTPS à Hugging Face e seus servidores de arquivos; mantenha a verificação TLS ativada. Nenhum áudio foi transcrito.', file=sys.stderr)
    raise SystemExit(1)
print('Modelo instalado em', args.destination)
