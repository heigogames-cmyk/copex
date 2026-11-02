# Copex Studio 3.2.0 — PC e Android

Estúdio de criação para uso individual, sem login, assinatura ou cotas comerciais. O foco é preparar vídeos em lote e reutilizar templates. Implementação independente, orientada pelas telas da gravação fornecida; não utiliza código, identidade visual ou serviços internos da plataforma de referência.

## Aplicativo Android e uso online

[Baixar APK Android 10+](https://github.com/heigogames-cmyk/copex/raw/refs/heads/entrega-windows-20261102/releases/Copex-Android.apk) · [Guia do aplicativo](docs/ANDROID.md) · [Hospedagem privada](docs/DEPLOY.md)

O APK acessa o mesmo servidor que a interface do PC: biblioteca, edição em lote, templates, design com camadas/CSV, cortes, legendas, radar, receitas, publicação, calendário e resultados. Os controles de camadas e CSV também ficam visíveis no celular. Upload múltiplo, downloads de mídia e salvamento dos arquivos gerados no navegador são tratados pelo aplicativo. O processamento permanece no servidor.

Para usar com o PC ligado, o pacote Windows inclui `CONECTAR-CELULAR.cmd`, que prepara a conexão privada pela rede de casa e mostra os dados para o Android. Para usar sem PC ligado é necessário ativar uma hospedagem. A imagem Docker foi construída e testada com senha, processamento real e disco persistente. `render.yaml` prepara um serviço HTTPS privado com disco e senha gerada pelo provedor. O plano do provedor é pago; nenhuma conta ou cobrança foi criada nesta entrega. Não há hospedagem pública ativa nem URL de servidor já configurada no APK.

## Abrir no Windows

Extraia o ZIP inteiro, abra a pasta `copex-studio` e execute `INICIAR-COPEX.cmd`. O iniciador oferece a instalação oficial do Ubuntu/WSL quando necessário e usa esse ambiente para preparar Node.js 24, FFmpeg, fontes e dependências. A primeira execução pode exigir permissão de administrador, reinicialização e criação de usuário/senha no Ubuntu. As instruções completas estão em `LEIA-PRIMEIRO-WINDOWS.txt`.

Depois da preparação, abre o navegador em `http://localhost:3001`. Mantenha a janela aberta. Dados locais ficam em `~/.local/share/copex-studio/.data` dentro do Ubuntu; a extração do ZIP não transfere os dados deste ambiente na nuvem. O iniciador prepara as ferramentas Python e solicita o modelo oficial de voz em segundo plano na primeira execução; as contas sociais continuam exigindo autorização dos provedores.

A parte Linux do iniciador foi executada em cópia isolada, com instalação de dependências, upload, exportação WebP com texto, ZIP e interface no Chromium. O trecho PowerShell/WSL não pôde ser executado em um Windows real nesta entrega.

## Iniciar

Requisitos: ambiente Linux (ou WSL2), Node.js 24 LTS, npm, FFmpeg/ffprobe com libx264 e libass e fontes DejaVu Sans. O ambiente preparado já possui essas ferramentas.

```bash
cd /workspace/copex
npm ci
npm run build
npm start
```

O servidor de produção atende a aplicação e a API na porta **3001**. `PORT` permite escolher outra porta. Para desenvolvimento com atualização automática:

```bash
npm run dev
```

Vite usa a porta 5173 e encaminha API e mídia para o servidor na porta 3001. Não execute os dois modos ao mesmo tempo na mesma porta. Use o encaminhamento de portas do seu ambiente para acessar a interface. Não é necessário cadastro.

## Fluxo principal

1. Importe vídeos, imagens, áudios ou legendas SRT pela **Biblioteca**. Os arquivos originais são preservados.
2. No **Editor em lote**, selecione as mídias, escolha um template e ajuste formato, corte, velocidade, cor, texto, áudio e qualidade.
3. Use **Só esta mídia** para substituir ajustes de um arquivo sem alterar o restante do lote.
4. Salve um projeto para continuar depois ou salve os ajustes como template.
5. Envie o lote para **Exportações**. A fila processa um vídeo por vez e permite continuar usando outras telas.
6. Baixe um ZIP do lote ou cada arquivo separadamente.

### Acabamento e continuidade

Identidade própria com marca vetorial, composição editorial, paleta oliva e creme, tipografia local e prévias dos templates. As telas se adaptam a larguras de 320 px até monitores grandes, com suporte a movimento reduzido. Veja [desktop](docs/preview.png), [templates](docs/templates.png) e [celular](docs/mobile.png).

Projetos abertos são atualizados ao salvar; **Salvar cópia** cria outro projeto. O editor guarda um rascunho neste navegador, incluindo ajustes individuais. O editor de design recupera documento, CSV e formato após recarregar e permite manter o rascunho ao sair. Salvar um template guarda também o CSV e o formato no servidor, permitindo reabri-los em outro aparelho. Rascunhos não substituem o salvamento no servidor nem um backup e não passam automaticamente para outro navegador. A interface informa falhas de armazenamento.

Use **Ctrl+K** para buscar telas e projetos e **Ctrl+S** para salvar no editor. Diálogos mantêm o foco, aceitam Escape e devolvem o foco ao controle que os abriu.

### Editor de vídeo

- MP4/H.264 e AAC; resoluções personalizadas e formatos 9:16, 1:1, 16:9 e 4:5.
- Preenchimento com recorte ou ajuste com bordas pretas, rotação e espelhamento.
- Corte por tempo, velocidade entre 0,25× e 4× e divisão em segmentos.
- Brilho, contraste, saturação, P&B, quente, frio, vintage, nitidez e redução de ruído visual.
- Texto multilinha com cor, tamanho, opacidade, posição e caixa de contraste.
- Marca d’água com tamanho, posição e opacidade.
- Importação e gravação de legendas SRT com tempos ajustados ao corte e à velocidade.
- Silenciamento, volume, normalização a -16 LUFS, trilha de fundo em loop e mixagem.
- Fade de entrada e saída, CRF e taxa de quadros.

A prévia do navegador é aproximada: mixagem, fades, legendas e certos filtros só são aplicados no resultado exportado. Textos longos precisam de quebras de linha para caber no quadro. Legendas SRT podem ser importadas ou geradas na seção Legendas automáticas, quando o modelo Whisper estiver disponível.

### Templates e criação em massa

Há seis presets iniciais para vídeos e seis designs editáveis. É possível salvar novos templates, sem limite comercial. O catálogo oferece busca, categorias, favoritos, duplicação, renomeação e importação/exportação de `.copex.json`. Favoritos são salvos no servidor e compartilhados entre PC e celular.

Templates de design portáteis incorporam as imagens da biblioteca com até 2048 px. O arquivo portátil tem limite técnico de 12 MB para permitir reimportação; reduza imagens/camadas caso exceda. Templates de vídeo levam os ajustes, mas áudio, SRT e marca d’água precisam ser selecionados novamente no destino. O exportador informa referências ausentes. Imagens incorporadas são importadas como novos arquivos na biblioteca.

O editor de design possui camadas de texto, formas e imagens da biblioteca; arraste para mover, use os cantos para redimensionar ou os campos para valores exatos. Há alinhamento de texto, opacidade, rotação, ordenação, duplicação, visibilidade, bloqueio de posição, desfazer e refazer. As famílias DejaVu Sans, Serif e Mono são distribuídas com licença para manter consistência entre editor e exportação.

Para produzir variações, coloque `{{titulo}}`, `{{subtitulo}}` ou outros nomes no texto e abra **Criar em massa · CSV**. O cabeçalho do CSV define os nomes das variáveis:

```csv
titulo,subtitulo,cta
Novo drop.,O extraordinário chegou.,DESCUBRA AGORA
Sua nova fase.,Design para todos os dias.,CONHEÇA A COLEÇÃO
```

Campos com vírgulas ou quebras de linha devem estar entre aspas duplas. O exportador gera um PNG, JPEG ou WebP por linha, em um ZIP, na resolução do documento. Imagens da biblioteca são incorporadas pelo servidor. Fontes da interface são locais e não dependem do Google Fonts.

### Organização

- Biblioteca com busca por nome ou etiquetas, ordenação, filtros, favoritos, renomeação, prévia, download e etiquetas em massa. A exclusão em lote valida todos os arquivos antes de remover qualquer um, bloqueia mídias em processamento e informa vínculos com projetos/templates.
- Projetos persistidos e templates pessoais.
- Calendário com planejamento local, horários vinculados a publicações conectadas e exportação `.ics`.
- Receitas manuais ou automáticas para novas mídias; os arquivos só são marcados como processados após a exportação terminar.
- Resultados de produção local e métricas sociais consultadas nas APIs, apresentadas separadamente.
- Identidade da marca e backup/restauração de configurações em JSON.

## Ferramentas de mídia e transcrição

```bash
python3 -m venv .tools
.tools/bin/pip install -r requirements-tools.txt
```

As versões das dependências Python também estão fixadas. O importador usa yt-dlp para tentar baixar um vídeo público específico do TikTok, Instagram ou YouTube. Não usa cookies ou credenciais, não contorna login e a análise de perfis públicos fica no Radar de conteúdo. Pode-se selecionar os vídeos encontrados para download em lote. O site e os servidores de mídia precisam estar liberados na rede. Essa operação **não foi validada contra redes sociais neste ambiente**, pois o acesso externo é restrito. A importação de arquivos locais foi validada.

## Radar, cortes, legendas e publicação

- **Radar de conteúdo:** consulta de vídeo ou perfil público; importação de CSV/JSON; filtros por alcance, curtidas, duração e índice relativo; seleção e download em lote; CSV dos resultados. Campos desconhecidos ficam sem valor. Não é uma previsão de viralidade.
- **Cortes inteligentes:** usa mudanças de cena e pausas detectadas pelo FFmpeg. Ajuste as durações, revise os trechos, aplique um template e exporte todos em um ZIP. O índice de continuidade audiovisual não avalia o significado das falas.
- **Legendas automáticas:** motor faster-whisper instalado, processamento em CPU/int8 com duas threads e revisão de texto/tempos. A transcrição usa pesos locais. O iniciador Windows e o blueprint de hospedagem podem preparar o modelo na inicialização; executar apenas `npm start` não inicia downloads de modelos.

Para instalar o modelo oficial quando a rede permitir:

```bash
npm run model:install
# Ou escolha um modelo maior, com mais custo de CPU/memória:
.tools/bin/python scripts/install-model.py --model small
```

O instalador consulta `Systran/faster-whisper-tiny` na Hugging Face por padrão. Nesta entrega o download foi bloqueado por HTTP 403 do proxy: **não foi possível validar reconhecimento de fala real**. A interface mostra o modelo ausente e não simula uma transcrição. Também é possível usar um diretório de modelo CTranslate2 já obtido por fonte confiável via `WHISPER_MODEL_PATH`.

- **Contas conectadas:** tokens autorizados das próprias contas, guardados em cofre local AES-256-GCM. Nenhuma senha de rede social é solicitada. Verifique escopos e validade. Este fluxo não cria cadastro no Copex.
- **Publicação:** rascunhos e lotes para YouTube, TikTok e Instagram. YouTube e TikTok recebem upload dos bytes; Instagram exige URL HTTPS pública. O TikTok depende de aprovação da Content Posting API. O Instagram exige conta profissional e as permissões da Instagram API com Instagram Login.
- **Agendamento:** selecione um fuso e intervalo entre vídeos. O agendador precisa estar ativado e o servidor precisa continuar funcionando. Horários são armazenados em UTC e o calendário apresenta o vínculo em Brasília. Verificações a cada 15 segundos; publicação depende também da latência da rede.
- **Resultados sociais:** consultas sob demanda, campos indisponíveis sem valores inventados e exportação CSV. A confirmação de envio e as métricas são estados distintos.

Os conectores foram testados com respostas controladas das APIs oficiais. Não houve conexão ou publicação em contas reais: **rede e credenciais continuam necessárias para validação ao vivo**. Não publique automaticamente dados restaurados sem conferir os rascunhos; o restaurador desativa receitas e transforma envios pendentes em rascunhos.

Se um envio for interrompido, ele fica em estado incerto. Confira a rede, informe um ID para verificar a identidade da conta ou confirme explicitamente que não houve publicação antes de voltar ao rascunho. Não há repetição automática de envios incertos.

## Persistência e recursos

Dados em `.data/`: banco JSON, uploads, miniaturas, exportações, modelos e cofre privado. Copie a chave e o arquivo criptografado juntos para restaurar conexões. A escrita do banco é serializada e atômica. As mídias ficam no disco, não no navegador. `COPEX_DATA_DIR` permite selecionar outra pasta. O backup JSON da interface contém configurações, projetos e calendário, **não contém os binários de mídia**. Copie toda a pasta de dados para um backup completo.

Não há cotas por plano. Há proteções técnicas: upload de até 2 GB por arquivo, imagens de até 4096 px, vídeos de até 3840 px por dimensão e processamento sequencial com duas threads de codificação. Espaço de disco, memória e CPU continuam sendo recursos finitos. Não há exclusão automática de originais ou exportações.

Uma reinicialização interrompe trabalhos ativos; itens pendentes são marcados para nova tentativa e resultados já concluídos permanecem disponíveis no ZIP de um lote parcial. Cancelar encerra o processo FFmpeg ativo e remove o arquivo incompleto. Arquivos já concluídos continuam disponíveis. A aplicação foi projetada para um único processo de servidor.

Falhas de um item não impedem os demais: o lote pode terminar parcialmente. Exportações mostra diagnóstico por arquivo, permite revisar os ajustes e repetir apenas falhas/pendências. O ZIP contém somente resultados concluídos; não inclui arquivos intermediários ou incompletos. A restauração de backup valida o conjunto inteiro antes de alterar o banco e mantém desativadas as ações externas.

## Verificação

```bash
npm test
npm run build
npm run test:e2e
```

Os testes de navegador usam Chromium em `/usr/bin/chromium` por padrão e dados separados em uma pasta temporária exclusiva por execução (porta 3002). Ajuste `CHROMIUM_PATH` se necessário. Incluem upload real, corte e conversão, divisão de vídeo, áudio, templates, CSV, download ZIP, calendário, navegação móvel e tratamento de erros. Os testes incluem SVG, CSV, renderização real, radar, cenas/pausas, legendas SRT, fusos, cofre e contratos dos três provedores sociais. A transcrição real não foi executada por falta dos pesos do modelo.

## Escopo da referência

A gravação não demonstra os detalhes de todas as telas e o acesso direto ao site continuou bloqueado. A identidade visual, os templates e a implementação são próprios. Não há garantia de equivalência com recursos que não estavam visíveis. Veja [o mapa de funcionalidades](docs/FEATURES.md), [a arquitetura](docs/ARCHITECTURE.md) e [a validação](docs/VALIDATION.md).

## Revisão de estabilidade 3.0.1

A revisão corrigiu a validação de dados persistidos, exportações de design interrompidas, referências de imagens, recuperação de rascunhos, respostas atrasadas da API, legendas SRT e recuperação de lotes após reiniciar o servidor. Consulte [as correções e regressões verificadas](docs/BUGFIXES.md).

## Atualização 3.2.0

Designs em massa agora entram na fila persistente de exportações. Você pode fechar o editor ou o aplicativo depois que o lote for criado; o servidor continua processando. Resultados ficam na central de exportações, com cancelamento, ZIP parcial, repetição apenas das falhas e revisão das linhas pendentes. Uma cópia privada das imagens do design permite recuperar uma exportação mesmo quando a imagem original foi removida. Reiniciar o servidor preserva os resultados concluídos; pendências interrompidas podem ser repetidas.

Lotes concluídos podem ser excluídos para liberar espaço, preservando os arquivos originais. Downloads e publicações em andamento bloqueiam a exclusão. No Android, ZIPs de designs são baixados diretamente pelo gerenciador do sistema.

A instalação do modelo de voz usa uma pasta temporária e só substitui o modelo anterior após conferir os arquivos; instalações simultâneas são bloqueadas e a interface acompanha o estado. A redução de ruído passou a ser aplicada também às imagens. Consulte [validação](docs/VALIDATION.md) para os testes e requisitos externos ainda não ativados.
