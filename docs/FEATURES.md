# Funcionalidades — Copex Studio 3.0

A referência disponível é a gravação enviada pelo usuário. O acesso direto à Velyra continua bloqueado pelo proxy. A implementação é independente e não reproduz código ou algoritmos proprietários.

| Área                                    | Implementação                                                                                                                                | Validação e requisitos                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Painel de produção                      | Acervo, projetos, exportações e planos reais                                                                                                 | Funciona localmente                                                                                               |
| Cadastro, assinatura e cotas comerciais | Omitidos, conforme solicitado                                                                                                                | Nenhum login de aplicativo                                                                                        |
| Biblioteca                              | Upload, prévia, busca por nome/etiqueta, ordenação, favoritos, renomeação, etiquetas e exclusão em lote                                      | Upload local testado                                                                                              |
| Downloader                              | Vídeo público por URL; vários vídeos selecionados no radar; deduplicação de origem                                                           | yt-dlp instalado; consultas reais dependem da rede e das permissões dos sites                                     |
| Radar                                   | Perfis públicos via yt-dlp e importação CSV, JSON ou JSONL; alcance, curtidas, comentários, compartilhamentos, duração, filtros e exportação | Dados importados e cálculos testados; não prevê viralidade                                                        |
| Edição em lote                          | Formato, corte, velocidade, espelhamento, rotação, imagem, texto, marca, áudio, SRT, efeitos e qualidade                                     | Renderização real de vídeo e imagem testada                                                                       |
| Cortes inteligentes                     | Detecção FFmpeg de cenas e pausas; sugestões com duração configurável; revisão dos tempos e exportação de vários trechos em um lote          | Análise e arquivos MP4 independentes testados                                                                     |
| Legendas automáticas                    | Whisper local em CPU, Português/Inglês/Espanhol/detecção, agrupamento de palavras, revisão, SRT e aplicação no editor                        | Motor instalado; pesos do modelo ainda bloqueados pelo proxy. Não houve reconhecimento real de fala nesta máquina |
| Templates                               | Catálogo com favoritos, duplicação, portabilidade de imagens; editor de design, camadas bloqueáveis, fontes locais, CSV e rascunhos          | Interface, geração e arquivos testados                                                                            |
| Exportação                              | Fila, diagnósticos por item, sucesso parcial, cancelamento real, repetição só de falhas, ZIP dos concluídos                                  | Arquivos reais e divisão de vídeo testados                                                                        |
| Contas                                  | Instagram, TikTok e YouTube por token autorizado; consulta de verificação; atualização e remoção                                             | Cofre AES-256-GCM testado. Nenhuma conta real foi conectada                                                       |
| Publicação em lote                      | Rascunhos, seleção de vídeos, privacidade, confirmação, envio e histórico                                                                    | Adaptadores testados com respostas controladas das APIs; sem postagem real                                        |
| Agendamento                             | Horário por fuso, intervalo entre vídeos, fila persistida, processamento sequencial e calendário vinculado                                   | Conversão de horários, execução e prevenção de duplicação testadas                                                |
| Recuperação de envio                    | Estado incerto após interrupção; consulta sem repetição automática; confirmação por ID/posse da conta ou retorno explícito ao rascunho       | Contratos e estado de recuperação testados                                                                        |
| Receitas automáticas                    | Aplicação de presets às novas mídias a cada 10 segundos, ativação individual e confirmação após renderização                                 | Fluxo automático testado com mídia real                                                                           |
| Métricas sociais                        | Consulta às APIs, métricas indisponíveis em branco, filtros por plataforma e CSV                                                             | Contratos dos provedores testados; dados reais dependem de contas autorizadas                                     |
| Backup                                  | JSON de metadados, projetos e configurações; cópia integral de `.data` para mídias e cofre                                                   | Credenciais não aparecem no JSON da interface                                                                     |

## Radar: leitura do índice

O índice é relativo aos vídeos de uma mesma análise: 50% visualizações em escala logarítmica, 30% engajamento e 20% recência. Dados ausentes são excluídos e os pesos restantes são normalizados. Ele não estima probabilidade de viralizar nem inventa visualizações. A taxa de engajamento exige curtidas, comentários, compartilhamentos e visualizações disponíveis.

## Publicação: autorização de terceiros

A ausência de login do Copex não elimina a autorização exigida pelas redes:

- YouTube usa token OAuth e upload resumível. Privacidade inicial privada.
- TikTok usa Content Posting API, verifica opções do criador, envia os bytes em blocos e aguarda confirmação. A rede exige escopos e aprovação do aplicativo.
- Instagram usa a API com Instagram Login, conta profissional, contêiner de Reel e confirmação. O vídeo precisa estar em uma URL HTTPS pública acessível pela Meta.

Não há automação de mensagens, comentários ou criação de contas. Essas ações não foram demonstradas na gravação nem solicitadas de forma específica. Nenhuma mensagem ou publicação foi enviada durante o desenvolvimento.

## Prerequisitos externos ainda não satisfeitos

1. Aplicar a política de rede salva no rascunho do ambiente. As alterações salvas não comprovam que a liberação entrou em vigor.
2. Baixar os pesos oficiais do Whisper para habilitar reconhecimento de fala.
3. Autorizar suas contas nas respectivas APIs e informar os tokens na interface protegida de Contas conectadas.
4. Para Instagram, disponibilizar uma URL HTTPS pública dos vídeos e as permissões exigidas pela Meta.

O código desses módulos está implementado. A ativação e a validação real dos serviços externos continuam dependendo desses requisitos.

## Revisão visual e de continuidade da versão 3

Identidade vetorial original e tema editorial; layouts conferidos entre 320 e 1280 px sem rolagem horizontal nas telas principais. Projetos são atualizados no mesmo registro e cópias são explícitas. Rascunhos de lote/design e CSV recuperam o trabalho neste navegador. Busca global, navegação pelo histórico, atalhos e foco dos diálogos foram testados. Veja as capturas em `docs/` e os testes específicos em `tests/polish.spec.js`.
