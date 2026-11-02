# Copex Studio para Android — 3.2.0

## Instalação

1. No Android 10 ou mais recente, baixe [Copex-Android.apk](https://github.com/heigogames-cmyk/copex/raw/refs/heads/entrega-windows-20261102/releases/Copex-Android.apk).
2. Abra o arquivo e autorize a instalação por esse navegador quando o Android solicitar. O app é distribuído diretamente, fora da Play Store.
3. Abra **Copex Studio** e informe o endereço HTTPS da sua hospedagem. O app guarda o endereço e reutiliza na próxima abertura.
4. No servidor privado, use o usuário `copex` e a senha configurada na hospedagem. Não envie essa senha no chat.

O APK não tem um servidor público já contratado ou predefinido. Ative a hospedagem seguindo [DEPLOY.md](DEPLOY.md) para usar sem PC ligado. O servidor deve estar atualizado para 3.1 ou superior; o aplicativo confere a compatibilidade na conexão inicial. Também aceita um IP privado com porta para redes locais, desde que o servidor esteja acessível pela rede; instalar WSL sozinho não garante esse encaminhamento de portas do Windows.

## Recursos

A interface é a mesma do estúdio no PC e usa a mesma API e arquivos. Todos os módulos continuam disponíveis no menu. Edição em lote, ajustes individuais, biblioteca, templates, camadas, fontes, CSV, cortes, SRT, radar, calendário, receitas, contas, publicação e resultados não são removidos do celular. Os fluxos de camadas e CSV, antes ocultos por CSS móvel, foram expostos.

O aplicativo oferece seleção múltipla de arquivos pelo seletor do Android, reprodução de vídeo com tela cheia, retorno, recarregamento, mudança de servidor e tratamento de conexão interrompida. Arquivos HTTP são baixados para Downloads com nomes distintos. ZIP/CSV/JSON/exports gerados por Blob são transmitidos em blocos para um arquivo temporário privado, e o Android pergunta onde salvá-lo. O app não pede acesso irrestrito ao armazenamento.

Arquivos e projetos salvos no servidor são compartilhados entre celular e PC quando ambos usam o mesmo endereço. Favoritos de templates ficam no servidor. Templates salvos incluem CSV e formato. Rascunhos não salvos pertencem ao navegador/dispositivo; salve o projeto/template antes de trocar de aparelho. O processamento de vídeo, imagens, voz e integrações ocorre no servidor. O aplicativo não edita vídeos offline nem incorpora FFmpeg/Whisper no APK.

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

## Usar o PC como servidor na rede de casa

Esta opção não exige hospedagem, mas mantém o processamento no PC ligado. Baixe o pacote Windows atualizado e instale o APK no celular. No Windows, execute `CONECTAR-CELULAR.cmd`: ele prepara uma senha privada no Ubuntu e informa os dados de acesso. Na primeira vez, feche a janela antiga do Copex, abra `INICIAR-COPEX.cmd` deste pacote novo e execute `CONECTAR-CELULAR.cmd` de novo. A senha passa a proteger também a interface do PC; usuário `copex`. Não envie a senha no chat.

O script pede elevação do Windows, exige que a rede esteja marcada como **Privada**, verifica o servidor atualizado e protegido, encaminha apenas a porta 3001 do IP local do PC para o WSL e cria uma regra de firewall limitada à rede privada/sub-rede local. Não configura o roteador e não publica o estúdio na internet. O celular deve estar no mesmo Wi-Fi doméstico, sem isolamento de dispositivos/rede de convidados. A senha fica em `~/.local/share/copex-studio/.access-password`, com permissão restrita. Se o IP do WSL mudar após reiniciar, execute novamente o conector. Encaminhamentos desconhecidos são preservados. A implementação PowerShell não pôde ser executada em Windows real neste ambiente.

A senha local e a marcação `.mobile-private` devem acompanhar o backup da pasta de instalação no Ubuntu, além de `.data`. Quando o modo privado já foi preparado, o iniciador exige senha para não abrir sem proteção por engano. O parser oficial PowerShell validou a sintaxe dos dois scripts; os comandos específicos de rede ainda não foram executados em um Windows real nesta entrega.

## Continuidade na versão 3.2

Depois de criar um lote de designs, é possível sair do editor ou fechar o app: a fila continua no servidor. Consulte a central de exportações para baixar os resultados ou repetir falhas. O APK usa download HTTP direto para esses ZIPs, evitando manter o arquivo inteiro na memória da WebView. O servidor precisa estar ligado; isso não transforma o processamento em edição offline.
