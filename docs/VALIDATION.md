# Validação da versão 3.2.0

Em 2 de novembro de 2026: **50 testes Node e 44 testes Playwright passaram (94 no total)**, sem casos ignorados. Os testes novos cobrem fila persistente de designs, saída parcial, cancelamento, recuperação de imagens, repetição e correção de linhas, CSV/formato entre aparelhos, favoritos no servidor, download Android por HTTP, atualização do estado do modelo, redução de ruído real e exclusão protegida de exportações.

A instalação atômica do modelo foi testada com transporte controlado, incluindo falha de download e preservação da versão anterior. Isso não valida reconhecimento de fala. Os pesos oficiais continuam indisponíveis neste ambiente. As integrações sociais não foram usadas com contas reais. Não há hospedagem pública ativada; o uso local depende do PC ligado. O APK precisa de validação em aparelho Android real e a conexão local precisa ser conferida no Windows do usuário.

---

# Histórico: validação 3.1.0

Em 2 de novembro de 2026: **43 testes Node e 33 testes Playwright passaram (76 no total)**, sem casos ignorados. Build de produção concluído. Além disso, APK compilado e assinatura verificada, regras Java testadas, Docker construído e processamento real validado em contêiner privado com disco persistente. Veja [Android](ANDROID.md) e [hospedagem](DEPLOY.md) para evidências e limites. O APK não foi executado em Android real; as integrações externas não foram validadas ao vivo.

Links temporários do Instagram foram testados quanto a expiração, alteração de assinatura/referência, estado da publicação e leitura HTTP Range sem liberar as demais rotas privadas.

As verificações móveis incluem uploads, vídeo/imagem reais, presets, projetos, ZIP, design/camadas/CSV, download em blocos com falha simulada, gestos de toque e menu completo. A suíte de desktop anterior continua passando. A captura `android-server.png` mostra a interface web em viewport móvel, com dados de teste no contêiner; não é captura de um telefone real.

---

# Histórico: validação 3.0.1

Executada em 2 de novembro de 2026 no ambiente preparado.

## Verificações concluídas

- Build de produção concluído.
- **38 testes Node passaram**: CSV/SVG, designs, filtros e renderização real FFmpeg; SRT; radar com dados ausentes; cenas/pausas; agrupamento de palavras; fusos e datas inválidas; cofre criptografado; contratos YouTube/TikTok/Instagram; validação de destinos; agendamento sem duplicação; consulta de estado incerto sem nova postagem; conferência de posse de vídeo.
- **28 testes Playwright passaram**: importação; editor; templates; ZIP; imagem WebP; divisão de vídeo; design/CSV; calendário e backup; interface móvel; tratamento de erros; arrastar/redimensionar/desfazer; receitas manuais; radar com CSV; cortes múltiplos com durações verificadas nos MP4; estado de modelo ausente; configuração social sem falsa conexão; bloqueio de arquivo privado; receita automática com mídia real.
- Revisão adicional: schemas de templates e backups, restauração atômica e conexões desativadas, armazenamento corrompido/cheio, proteção de dependências da biblioteca e cancelamento de FFmpeg real.
- Navegador: atualização/cópia de projetos; recuperação de rascunhos e CSV; fontes; templates com imagens incorporadas; favoritos e duplicação; lote parcialmente concluído e ZIP; repetição apenas de falhas; correção individual de corte; cancelamento real; busca global, histórico, foco dos diálogos; biblioteca em massa; telas principais em 1280/768/390/320 px.
- O fluxo de template portátil foi repetido após acrescentar tratamento de erro de download e limite de 12 MB. Build final passou. Saúde, estado e capacidades retornaram 200 no servidor de produção; caminhos privados retornaram 404, sem erros de execução no navegador ao capturar as telas.
- Dependências de produção não foram alteradas nesta revisão. A auditoria da entrega anterior registrou zero vulnerabilidades; isso não substitui uma consulta atualizada a avisos externos.
- Ambiente Python: `pip check` sem dependências quebradas; versões fixadas em `requirements-tools.txt`.

Os testes não possuem casos ignorados na execução final. Os testes sociais usam transporte controlado, sem contas reais e sem enviar publicações. A confirmação do estado de modelo ausente é um teste de tratamento de requisito; **não valida reconhecimento de fala**.

## Revisão de estabilidade

A suíte passou integralmente com 66 testes, sem casos ignorados. Foram acrescentados testes para dados inválidos sem mutação, limpeza de arquivos após falha/desconexão, imagens corrompidas/ausentes, proteção de mídias, respostas atrasadas, recuperação de CSV vazio/formato, isolamento do Ctrl+S, receitas WebP reais, SRT fora de ordem, caminhos com espaços/apóstrofos, dados de radar inválidos e recuperação de lotes após reinicialização. Todas as telas foram conferidas entre celular, tablet e desktop; as principais também em 390 px. Os testes continuam usando banco temporário separado dos dados de produção.

Veja [o relatório de correções](BUGFIXES.md). A cobertura descrita não constitui garantia de ausência de qualquer bug e não valida serviços externos bloqueados.

## Requisitos externos bloqueados

- O proxy retornou 403 para Velyra, documentação/APIs externas e Hugging Face.
- O motor faster-whisper está instalado, mas o modelo oficial não foi baixado. Nenhum áudio foi transcrito com um modelo real.
- Nenhuma credencial social estava configurada e nenhuma conta foi conectada. A publicação ao vivo e a consulta de métricas reais precisam de rede e autorização dos provedores.
- Instagram precisa de um endereço HTTPS público dos vídeos, além das permissões da conta profissional.

Os domínios necessários foram salvos no rascunho do ambiente. Salvar não comprova aplicação da política, publicação do snapshot ou restauração em uma nova máquina.

## Limites da entrega

Não houve envio do código ao GitHub ou implantação pública. O projeto funciona localmente para edição, templates, radar com dados importados, cortes e receitas. Os módulos externos estão implementados, mas sua ativação e validação dependem dos requisitos acima. A gravação não permite garantir equivalência com todas as funcionalidades internas da plataforma original.
