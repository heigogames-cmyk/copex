# Galeria de imagens e vídeos — 3.2.2

O importador de templates tratava qualquer arquivo como JSON. Agora reconhece imagens PNG/JPG/WebP e vídeos da galeria antes de interpretar templates portáteis. Imagens são guardadas como design com base visual; vídeos são guardados como presets com referência ao arquivo original. Aplicar um template de vídeo seleciona sua mídia-base no editor e informa quando ela foi removida. Backup de configuração preserva a referência; exportação portátil JSON informa que o vídeo precisa acompanhar a transferência separadamente. O catálogo mostra a miniatura da mídia. A biblioteca contabiliza referências dos vídeos-base.

O cliente Android existente recebe o novo fluxo ao atualizar o servidor. O pacote Windows 3.2.2 preserva os dados no Ubuntu. O teste móvel novo importa uma imagem real, renderiza um PNG e confere seus pixels; outro importa vídeo real, confere a seleção, a persistência e a reutilização do catálogo.

---

# Revisão 3.2.0

- Designs em massa deixaram de depender da conexão aberta com o editor; fila persistente, resultados por linha e repetição seletiva.
- Templates guardam CSV e formato no servidor; favoritos são compartilhados entre aparelhos e incluídos no backup de configuração.
- Imagens de designs recebem snapshot privado para recuperação posterior.
- Downloads grandes no Android usam o gerenciador do sistema; transferências incompletas são limpas ao trocar de servidor.
- Instalação do modelo usa trava e troca atômica, preservando o anterior em caso de falha; a interface atualiza o estado automaticamente.
- Strings importadas não ativam booleanos por engano; redução de ruído funciona também para imagens.
- Exclusão de exportações preserva originais e bloqueia arquivos usados em downloads ou publicações.
- Criação simultânea da senha local não pode produzir arquivos truncados ou senhas diferentes.
- Servidor temporário dos testes é encerrado diretamente, sem deixar um processo intermediário na porta.

Validação: 50 testes Node e 44 de navegador, sem ignorados. Histórico abaixo descreve o comportamento das versões anteriores; em 3.2.0, fechar o editor interrompe apenas a espera e o lote continua no servidor.

---

# Revisão de estabilidade — Copex Studio 3.0.1

Revisão realizada em 2 de novembro de 2026. O código e os dados de produção foram preservados; testes usam diretórios temporários exclusivos.

| Problema encontrado                                                                               | Correção e verificação                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API aceitava listas e ajustes malformados, datas inexistentes e alterações indevidas de metadados | Schemas para projetos, planos e receitas. Dados inválidos falham antes de gravar; updates preservam ID e data de criação. Testes de unidade e API.                                                                |
| Design podia exportar sem uma imagem removida ou ignorar dados de imagem corrompidos              | Conferência de referências, validação/decodificação explícita e mensagem de erro. Exportação real com WebP e cenários inválidos.                                                                                  |
| Exportação de design com falha/desconexão podia deixar arquivos intermediários                    | Renderização em pasta temporária privada, limpeza em `finally`, parada após desconexão e proteção das imagens contra exclusão enquanto usadas. Teste com conexão interrompida durante geração real.               |
| Fechar o editor deixava a solicitação de exportação ativa                                         | AbortController acompanha a montagem do editor e encerra a solicitação ao sair. O servidor limpa os intermediários.                                                                                               |
| Cancelar vídeo liberava referências antes de FFmpeg terminar                                      | Estado de interrupção mantém fontes e dependências protegidas e impede repetição prematura. Testes de estado e cancelamento real já existente.                                                                    |
| Resposta antiga de atualização podia sobrescrever estado mais recente                             | Numeração das solicitações descarta respostas antigas; teste com respostas deliberadamente fora de ordem.                                                                                                         |
| Rascunho restaurava PNG e preenchia novamente um CSV que estava vazio                             | Formato e CSV vazio são recuperados corretamente após recarregar e retomar. Teste no navegador.                                                                                                                   |
| Ctrl+S podia salvar o lote sob um diálogo de design                                               | O atalho do lote respeita diálogos e salvamento em curso; o design recebe o atalho. Teste confirma ausência de projeto criado por trás. Ctrl+Shift+Z também aceita a letra maiúscula produzida pelo teclado.      |
| Restauração podia congelar configurações globais dentro de ajustes individuais                    | Overrides continuam parciais; edição global posterior ainda se aplica aos campos não substituídos. Teste de restauração.                                                                                          |
| Receita ignorava formato e prefixo do preset                                                      | Repassa ambos à fila; teste gera arquivos WebP reais com prefixo esperado.                                                                                                                                        |
| Reinício ocultava ZIP de resultados prontos e deixava itens como “processando”                    | Recuperação conserva resultados, marca somente pendências como falha e classifica lotes parciais/concluídos. Teste de transições de estado.                                                                       |
| SRT aceitava minutos/segundos fora da faixa e duração dependia da última entrada                  | Rejeita timestamps inválidos, ordena entradas e calcula a maior duração mesmo com sobreposição. Testes de unidade e upload.                                                                                       |
| Filtros de texto/SRT falhavam em pastas com espaços e apóstrofos                                  | Arquivos auxiliares recebem nomes seguros, filtros usam caminhos relativos e subprocesso recebe diretório explícito. Teste FFmpeg real com ambos os overlays.                                                     |
| Variáveis CSV podiam ler propriedades herdadas, como `constructor`                                | Interpolação lê apenas colunas próprias, na prévia e no exportador. Teste de nomes especiais.                                                                                                                     |
| Radar podia falhar com timestamp fora de faixa ou aceitar registros sem estrutura                 | Datas inválidas ficam indisponíveis, datas reais de fallback são preservadas, registros inválidos são rejeitados e cálculo máximo evita espalhar listas grandes em argumentos. Testes de importação/normalização. |
| Importação de template podia manter referência para tipo errado de mídia                          | Referências são conferidas por tipo; schemas rejeitam tipos de template e camadas inválidos.                                                                                                                      |

## Verificação

- `npm test`: **38 testes passaram**, incluindo FFmpeg real.
- `npm run build`: build de produção concluído.
- `npm run test:e2e`: **28 testes passaram**, incluindo todas as telas em 320/768/1440 px e os fluxos anteriores em 390/1280 px.
- Não houve publicações em contas reais, envio de mensagens ou transcrição simulada.

As integrações reais continuam dependendo de rede/autorização e dos pesos oficiais do Whisper. O código não foi enviado ao GitHub nem implantado publicamente nesta revisão.
