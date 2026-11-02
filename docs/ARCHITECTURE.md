# Arquitetura — versão 3.2

## Módulos

- `src/main.jsx`: estúdio, editores, projetos e calendário.
- `src/catalog.jsx`, `src/library.jsx`, `src/exports.jsx`: catálogo, biblioteca e central de exportações.
- `src/identity.jsx`, `src/refinement.css`: identidade vetorial e acabamento responsivo.
- `src/drafts.js`: armazenamento local validado e rascunhos com indicação de falha.
- `server/records.js`: schemas de projetos, planejamento e receitas, com ajustes individuais parciais.
- `server/designs.js`: exportação de designs em diretório temporário, validação de imagens, proteção de fontes e limpeza após término/falha/desconexão.
- `server/jobs.js`: recuperação de lotes e itens interrompidos após reinício, conservando saídas concluídas.
- `server/templates.js`: validação e portabilidade de templates com imagens incorporadas.
- `server/library.js`: edição/exclusão em massa e proteção de dependências ativas.
- `server/backups.js`: validação integral e restauração de metadados sem ativar ações externas.
- `src/advanced.jsx`: radar, cortes, legendas, contas, publicação e métricas sociais.
- `src/studio-ui.jsx`: controles e estruturas compartilhadas.
- `server/index.js`: API Express, persistência JSON, upload, fila de renderização e execução de receitas.
- `server/media.js`: FFmpeg, ffprobe, filtros, áudio e SRT; `server/cuts.js`: detecção de cenas e pausas.
- `server/advanced.js`: operações de radar/download, cortes e transcrição; fila sequencial para essas operações.
- `server/social.js`: cofre, transporte com proxy, adaptadores sociais e agendador.
- `shared/radar.js`, `shared/captions.js`, `shared/scheduling.js`: normalização, cálculo e validações utilizadas pela aplicação.
- `scripts/transcribe.py`: faster-whisper local em CPU/int8. `scripts/install-model.py`: obtenção explícita dos pesos oficiais.

React 19 e Vite produzem os arquivos servidos pelo Express. As fontes são locais. Sharp renderiza designs SVG escapados em PNG/JPEG/WebP. Archiver produz ZIP em streaming. Os processos de mídia recebem argumentos em arrays, sem executar URLs ou nomes de arquivo no shell.

## Persistência e execução

O banco JSON usa gravação serializada e substituição atômica. Dados em `.data/uploads`, `.data/thumbs`, `.data/exports`, `.data/models`, `.data/private` e `.data/database.json`. Apenas uploads, miniaturas e exportações são servidos por HTTP. Pedidos a mídias inexistentes retornam 404; o fallback da SPA não se aplica a elas.

O cofre usa chave aleatória de 32 bytes e AES-256-GCM com IV único por gravação. Chave e arquivo ficam em diretório privado com permissões restritas. Tokens não são incluídos em `/api/state`, respostas de conexão ou backup JSON. Para backup completo, copie toda a pasta de dados, incluindo chave e arquivo criptografado, mantendo o ambiente privado.

O projeto é para um usuário e um processo de servidor. Não há login no Copex. Se exposto fora do ambiente privado, a proteção de acesso deve ficar no proxy de implantação. Não há armazenamento multiusuário ou coordenação entre processos independentes.

## Filas e estado

- Renderização sequencial, com duas threads de codificação. Cada item registra estado/erro/saídas; falhas não interrompem os itens seguintes. ZIP usa apenas saídas explicitamente concluídas. AbortController encerra o subprocesso ao cancelar, com escalada de SIGTERM para SIGKILL se necessário. Repetição conserva resultados prontos e enfileira apenas pendências/falhas.
- Cortes e transcrições são sequenciais na fila de operações avançadas.
- Receitas habilitadas verificam novas mídias a cada 10 segundos. Um arquivo só entra na lista de processados após o lote terminar. Falhas não entram em repetição automática infinita.
- O agendador social verifica horários vencidos a cada 15 segundos, em ordem cronológica, quando ativado. A confirmação de vídeos já enviados continua sendo consultada.
- Publicações passam por rascunho/agendada, enviando, processando na rede e publicado. A resposta de upload não é tratada como publicação confirmada quando a plataforma ainda está processando.
- Reinicialização durante envio vira estado incerto. Não se repete o envio automaticamente. Consultas de estado incerto não iniciam nova publicação. Há verificação manual de ID e posse ou retorno explícito ao rascunho após conferência do usuário.
- Reinicialização durante renderização marca itens interrompidos como falha e conserva o lote parcial quando há resultados concluídos; um lote com todos os itens prontos volta como concluído. Transcrições interrompidas ficam com falha. Processos não são preservados pelo snapshot.

Restauração JSON não ativa conexões, receitas ou envios futuros. As contas voltam para não verificadas, receitas ficam desativadas e envios pendentes viram rascunhos. Metadados de mídias restaurados podem apontar a arquivos que precisam do backup completo.

## Rede e integrações

O transporte Node usa Undici com `EnvHttpProxyAgent`, preservando proxy, confiança TLS e credenciais herdadas. Os destinos de upload retornados por APIs são validados antes de encaminhar bytes ou autorização. O downloader só aceita URLs HTTPS de plataformas conhecidas.

YouTube usa upload resumível; TikTok usa inicialização de publicação, upload em blocos e consulta de status; Instagram usa contêiner de Reel a partir de URL pública e `media_publish` após confirmação. Tokens são fornecidos pelo usuário na interface e devem ter permissões aprovadas nas redes. Não há criação automática de contas ou envio de mensagens.

Os contratos foram testados por injeção de transporte com respostas controladas. A rede atual bloqueou APIs e o download do modelo; não houve publicação ao vivo nem transcrição com pesos reais. A aplicação apresenta esses requisitos explicitamente.

## Iniciar e verificar

Use o checkout existente em `/workspace/copex`, sem criar worktrees para inicialização. `npm run dev` inicia API e Vite. `npm run build && npm start` serve a produção na porta 3001. `npm test` cobre lógica/FFmpeg/adaptadores e `npm run test:e2e` usa Chromium e porta 3002 com dados temporários exclusivos.

## Cliente Android e hospedagem

`android/src/com/copex/studio` contém o cliente WebView, políticas de origem e integração com seletores/downloads nativos. Não inclui o backend nem processamento offline. `android/assets/downloads.js` encaminha blobs em blocos para salvamento pelo Android. `server/access.js` fornece acesso privado opcional ao estúdio inteiro; `Dockerfile` exige senha no modo online. `render.yaml` configura HTTPS do provedor e disco durável; `scripts/start-container.sh` prepara permissões, reduz privilégios e pode instalar o modelo oficial em segundo plano. O cliente Android e o navegador de PC usam a mesma API e banco quando configurados para o mesmo servidor.

## Designs persistentes e preferências — 3.2

`server/design-render.js` valida e renderiza linhas; `server/design-jobs.js` integra designs à mesma fila dos vídeos. Documentos, linhas e snapshots das imagens ficam privados em `DATA/design-jobs`, enquanto o banco guarda metadados e resultados por item. O backup de configuração inclui preferências e CSV dos templates, mas não os arquivos dos lotes; um backup completo deve preservar toda a pasta de dados, inclusive `design-jobs`. A projeção de `/api/state` omite o CSV e fornece `hasDataset`; `/api/presets/:id` retorna o template completo sob o mesmo acesso privado. `server/preferences.js` compartilha favoritos entre clientes.
