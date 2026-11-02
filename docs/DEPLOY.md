# Hospedagem privada para PC e Android

A hospedagem mantém o estúdio funcionando quando o PC estiver desligado. Esta entrega inclui Dockerfile testado e blueprint Render, mas **nenhuma hospedagem foi contratada ou ativada**. O APK ainda precisa do endereço que será criado.

## Opção preparada: Render

1. Entre no Render com uma conta sua. Conecte o GitHub e selecione `heigogames-cmyk/copex`, branch `entrega-windows-20261102`.
2. Crie um **Blueprint** usando `render.yaml`. O arquivo escolhe serviço Docker `standard` e disco persistente de 20 GB. É uma configuração paga: confira o preço atual do provedor antes de confirmar. Não há cobrança de assinatura do Copex.
3. Aguarde build e inicialização. O provedor fornecerá uma URL HTTPS. `COPEX_ACCESS_PASSWORD` é gerada pelo provedor; consulte-a nas variáveis do serviço, sem enviar no chat.
4. No navegador do PC, abra a URL. No app Android, informe essa mesma URL. Use usuário `copex` e a senha do serviço quando solicitado.
5. O blueprint solicita o modelo oficial tiny na primeira inicialização. A instalação ocorre em segundo plano, com prazo de 10 minutos por tentativa. As demais ferramentas abrem antes. Confira **Legendas automáticas** e, se necessário, `model-install.log` no disco persistente. O download precisa de rede para Hugging Face; falhas não são apresentadas como transcrição bem-sucedida.

Não use disco efêmero para guardar suas mídias. O blueprint desativa implantação automática. Atualizar o serviço reinicia o processo: resultados prontos são preservados e itens interrompidos podem ser repetidos. Para 4K, lotes grandes e modelos maiores, confira memória/CPU e espaço disponíveis; o plano pode precisar ser aumentado.

## O que foi testado

Imagem `copex-studio:3.1.0` construída com Node 24, FFmpeg, libass, fontes, Python, yt-dlp e faster-whisper. Contêiner executado com senha de teste, acesso anônimo bloqueado, `api/ready` disponível sem dados privados e servidor Node com UID 1000. Testados: upload real, vídeo com texto/marca/SRT, imagem WebP, ZIP, design com duas linhas CSV, projeto compartilhado e dados preservados após reinício em volume Docker. Interface móvel acessada sob autenticação HTTP. Pesos do Whisper não foram baixados neste ambiente e o serviço Render não foi criado.

## Outro provedor / VPS

Use o Dockerfile em um servidor com Docker, disco persistente e proxy HTTPS. Defina senha forte via `COPEX_ACCESS_PASSWORD`; `COPEX_REQUIRE_AUTH=1` impede iniciar sem senha. Monte armazenamento em `/var/lib/copex` e publique a porta interna 3001 atrás do HTTPS. `/api/ready` é o health check público; outras rotas exigem a senha, com exceção dos links temporários de vídeo descritos abaixo. O ponto de entrada prepara a pasta e reduz o processo a usuário sem privilégios. `COPEX_INSTALL_MODEL=1` solicita o modelo oficial no início; não é necessário para edição local.

O modelo é único para o serviço. Para backups completos, copie `/var/lib/copex` inteiro, incluindo uploads, exportações, banco e chave/cofre privados. O backup JSON da interface não inclui mídias nem credenciais. As conexões sociais só funcionam após autorização oficial das contas. Instagram também requer endereço público HTTPS dos vídeos conforme a configuração da API.

## Limitações externas ainda presentes

Conta/ativação da hospedagem, download do modelo e autorizações sociais não podem ser substituídos pelo APK. O código oferece os módulos e exibe seus requisitos; não cria contas sociais, não simula métricas/transcrições e não publica sem configuração do usuário. O motor de cortes usa sinais de cena/pausa, não uma análise semântica das falas.

## Vídeos para Instagram com o estúdio privado

Quando a publicação usa a mídia hospedada pelo próprio Copex, a integração recebe um link assinado para um único vídeo, válido por até 24 horas. O link é renovado ao iniciar o envio, inclusive após agendamento. Só funciona enquanto a publicação estiver enviando, processando, incerta ou publicada; cancelá-la invalida o acesso. A biblioteca e os demais arquivos continuam atrás da senha. Links explicitamente informados para hospedagens externas permanecem externos. No Render, a base HTTPS é obtida de `RENDER_EXTERNAL_URL` automaticamente. Em outros provedores, configure `COPEX_PUBLIC_URL` ou a base pela interface. A chave de assinatura fica no diretório privado e deve acompanhar o backup completo.
