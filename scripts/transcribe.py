"""CPU-only offline Whisper transcription. Never downloads weights implicitly."""
import argparse, json, os, sys
parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True)
parser.add_argument('--model',required=True)
parser.add_argument('--output',required=True)
parser.add_argument('--language',default='pt')
args=parser.parse_args()
if not os.path.isfile(os.path.join(args.model,'model.bin')):
 raise SystemExit('Modelo Whisper ausente. Instale um modelo CTranslate2 em .data/models/whisper ou configure WHISPER_MODEL_PATH.')
from faster_whisper import WhisperModel
model=WhisperModel(args.model,device='cpu',compute_type='int8',cpu_threads=2,local_files_only=True)
segments, info=model.transcribe(args.input,language=None if args.language=='auto' else args.language,beam_size=3,word_timestamps=True,vad_filter=True)
result=[]
for segment in segments:
 result.append({'start':segment.start,'end':segment.end,'text':segment.text.strip(),'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for w in segment.words or []]})
 print(json.dumps({'end':segment.end}),flush=True)
with open(args.output,'w',encoding='utf8') as file:
 json.dump({'language':info.language,'probability':info.language_probability,'segments':result},file,ensure_ascii=False)
