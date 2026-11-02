# Copex Studio para Android — 3.1.0

## Instalação

1. No Android 10 ou mais recente, baixe [Copex-Android.apk](https://github.com/heigogames-cmyk/copex/raw/refs/heads/entrega-windows-20261102/releases/Copex-Android.apk).
2. Abra o arquivo e autorize a instalação por esse navegador quando o Android solicitar. O app é distribuído diretamente, fora da Play Store.
3. Abra **Copex Studio** e informe o endereço HTTPS da sua hospedagem. O app guarda o endereço e reutiliza na próxima abertura.
4. No servidor privado, use o usuário `copex` e a senha configurada na hospedagem. Não envie essa senha no chat.

O APK não tem um servidor público já contratado ou predefinido. Ative a hospedagem seguindo [DEPLOY.md](DEPLOY.md) para usar sem PC ligado. O servidor deve estar atualizado para 3.1 ou superior; o aplicativo confere a compatibilidade na conexão inicial. Também aceita um IP privado com porta para redes locais, desde que o servidor esteja acessível pela rede; instalar WSL sozinho não garante esse encaminhamento de portas do Windows.

## Recursos

A interface é a mesma do estúdio no PC e usa a mesma API e arquivos. Todos os módulos continuam disponíveis no menu. Edição em lote, ajustes individuais, biblioteca, templates, camadas, fontes, CSV, cortes, SRT, radar, calendário, receitas, contas, publicação e resultados não são removidos do celular. Os fluxos de camadas e CSV, antes ocultos por CSS móvel, foram expostos.

O aplicativo oferece seleção múltipla de arquivos pelo seletor do Android, reprodução de vídeo com tela cheia, retorno, recarregamento, mudança de servidor e tratamento de conexão interrompida. Arquivos HTTP são baixados para Downloads com nomes distintos. ZIP/CSV/JSON/exports gerados por Blob são transmitidos em blocos para um arquivo temporário privado, e o Android pergunta onde salvá-lo. O app não pede acesso irrestrito ao armazenamento.

Arquivos e projetos salvos no servidor são compartilhados entre celular e PC quando ambos usam o mesmo endereço. Rascunhos não salvos e favoritos de templates ainda pertencem ao navegador/dispositivo; salve o projeto/template antes de trocar de aparelho. O processamento de vídeo, imagens, voz e integrações ocorre no servidor. O aplicativo não edita vídeos offline nem incorpora FFmpeg/Whisper no APK.

## Privacidade e conexão

O cliente aceita HTTPS para serviços online e HTTP somente para IPs privados/loopback. Links externos abrem no navegador. Navegação interna e downloads HTTP ficam limitados à origem escolhida. Certificados HTTPS inválidos não são ignorados. A senha do servidor é usada na sessão e não é gravada nas preferências. O endereço do servidor é lembrado; acesso a arquivos `file://` do aparelho fica desabilitado. Importações usam o seletor de documentos.

## Validação e limites

- APK compilado para API 35, mínimo API 29 (Android 10); assinatura v3 verificada por `apksigner`.
- Regras Java de endereços, portas, credenciais e origem executadas na JVM. A rotina de conexão do próprio APK foi executada contra o servidor Docker real, incluindo rejeição de servidores antigos e respostas inválidas.
- Chromium com tela 390×844, toque e geração de UUID sem `crypto.randomUUID`: upload múltiplo, vídeo/imagem reais, preset, projeto, exportação/ZIP, camadas, bloqueio, visibilidade, duplicação, fonte, CSV com duas imagens geradas e downloads pela ponte Android.
- Transferência em cinco blocos de um arquivo de 1.048.593 bytes conferida integralmente; falha de gravação também testada.
- Arrastar camada usando eventos de toque reais do Chromium/CDP e navegação por todos os módulos testados.
- Não havia telefone Android conectado nem emulador com KVM neste ambiente. O APK foi compilado/validado, mas instalação, seletor de documentos, tela cheia e DownloadManager precisam de confirmação em dispositivo real. Os testes da ponte de downloads usam a interface JavaScript emulada no Chromium; não simulam um Android inteiro.
- Transcrição real e publicações reais continuam dependendo de pesos/permissões/rede. Nenhuma postagem foi enviada e nenhuma fala foi simulada.

## Recompilar

Ferramentas oficiais utilizadas: Android Platform 35 r02 e Build Tools 35.0.0; Eclipse ECJ 3.37.0, Java 21. Os arquivos não são baixados implicitamente pelo build. Defina `ANDROID_PLATFORM_JAR`, `ANDROID_BUILD_TOOLS`, `ANDROID_ECJ_JAR`, `COPEX_ANDROID_KEYSTORE` e `COPEX_ANDROID_KEYSTORE_PASS_FILE`, então execute `bash scripts/build-android.sh`.

A chave de assinatura desta entrega fica privada em `.data/private/android-signing.p12`, com senha em arquivo privado separado. Preserve-a em backup seguro para publicar atualizações compatíveis. Não publique esses arquivos no Git. O certificado público está no APK. Atualizações futuras precisam aumentar `android:versionCode` no manifest.
