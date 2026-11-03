$ErrorActionPreference = 'Stop'
$toolsHash = '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99'
$apkHash = '80a33910852e444c878eaec46f04d8dc3b6f052b14738d2202997083a5429b31'
$root = Split-Path -Parent $PSScriptRoot
$work = Join-Path $env:LOCALAPPDATA 'CopexStudio\android-usb'
$report = Join-Path $work 'diagnostico.txt'
$log = New-Object System.Collections.Generic.List[string]
$phoneSerial = ''

function Record([string]$Message) {
    Write-Host $Message
    $log.Add($Message)
}

function Invoke-Adb([string[]]$AdbArguments) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& $adb @AdbArguments 2>&1 | ForEach-Object { $_.ToString() })
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return [PSCustomObject]@{ Code = $code; Text = ($lines -join "`r`n") }
}

try {
    New-Item -ItemType Directory -Force -Path $work | Out-Null
    Record 'COPEX ANDROID 3.2.1 - INSTALACAO E DIAGNOSTICO POR USB'
    Record ('Data: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    Record ''
    Record '1. No celular: Configuracoes > Sobre o telefone > Informacoes do software.'
    Record '2. Toque 7 vezes em Numero de compilacao e confirme o PIN do proprio celular.'
    Record '3. Volte a Configuracoes > Opcoes do desenvolvedor e ative Depuracao USB.'
    Record '4. Conecte o celular ao PC com um cabo USB de dados e desbloqueie a tela.'
    Record '5. Se aparecer Permitir depuracao USB, autorize este computador.'
    Record ''
    [void](Read-Host 'Depois desses passos, pressione ENTER aqui no PC')
    $apk = Join-Path $root 'Copex-Android-3.2.1.apk'
    if (-not (Test-Path -LiteralPath $apk)) {
        $apk = Join-Path $root 'releases\Copex-Android-3.2.1.apk'
    }
    if (-not (Test-Path -LiteralPath $apk)) { throw 'APK ausente. Extraia TODO o ZIP antes de abrir o iniciador.' }
    if ((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash -ne $apkHash) {
        throw 'O APK nao corresponde ao arquivo verificado. Baixe e extraia novamente o pacote USB.'
    }
    $archive = Join-Path $work 'platform-tools_r37.0.1-win.zip'
    if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $toolsHash) {
        Record 'Baixando ferramentas oficiais do Google (cerca de 10 MB)...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri 'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip' -OutFile $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $toolsHash) {
        throw 'Falha na verificacao das ferramentas oficiais. O download sera repetido ao executar novamente.'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $work -Force
    $adb = Join-Path $work 'platform-tools\adb.exe'
    $devices = Invoke-Adb -AdbArguments @('devices', '-l')
    if ($devices.Code -ne 0) { throw $devices.Text }
    $connected = @()
    $unauthorized = $false
    foreach ($line in ($devices.Text -split "`r?`n")) {
        if ($line -match '^(\S+)\s+(device|unauthorized|offline)(?:\s|$)') {
            if ($Matches[1] -like 'emulator-*' -or $Matches[1].Contains(':')) { continue }
            if ($Matches[2] -eq 'device') { $connected += $Matches[1] }
            if ($Matches[2] -eq 'unauthorized') { $unauthorized = $true }
        }
    }
    if ($unauthorized) {
        Record 'Desbloqueie o celular e autorize a depuracao USB na mensagem que aparece nele.'
        [void](Read-Host 'Depois de autorizar, pressione ENTER')
        $devices = Invoke-Adb -AdbArguments @('devices', '-l')
        $connected = @()
        foreach ($line in ($devices.Text -split "`r?`n")) {
            if ($line -match '^(\S+)\s+device(?:\s|$)' -and $Matches[1] -notlike 'emulator-*' -and -not $Matches[1].Contains(':')) {
                $connected += $Matches[1]
            }
        }
    }
    if ($connected.Count -eq 0) {
        throw 'Nenhum celular USB autorizado foi encontrado. Confira o cabo de dados, a depuracao USB e a autorizacao na tela do telefone. Se o Windows nao reconhecer o Samsung, instale o driver USB oficial da Samsung.'
    }
    if ($connected.Count -ne 1) { throw 'Ha mais de um celular conectado. Deixe somente o aparelho em que deseja instalar o Copex e execute novamente.' }
    $phoneSerial = $connected[0]
    foreach ($property in @('ro.product.model', 'ro.build.version.release', 'ro.build.version.sdk')) {
        $value = Invoke-Adb -AdbArguments @('-s', $phoneSerial, 'shell', 'getprop', $property)
        if ($value.Code -ne 0) { throw $value.Text }
        Record ($property + ': ' + $value.Text.Trim())
    }
    Record 'Instalando o APK verificado. Aguarde...'
    $install = Invoke-Adb -AdbArguments @('-s', $phoneSerial, 'install', '-r', '--no-streaming', $apk)
    Record $install.Text
    if ($install.Code -ne 0 -or $install.Text -notmatch '(?m)^Success\s*$') {
        throw 'O Android recusou a instalacao. O motivo tecnico esta registrado acima.'
    }
    Record 'INSTALACAO CONCLUIDA. Abrindo o Copex...'
    $launch = Invoke-Adb -AdbArguments @('-s', $phoneSerial, 'shell', 'am', 'start', '-n', 'com.copex.studio/.MainActivity')
    Record $launch.Text
    if ($launch.Code -ne 0) { throw 'Instalado, mas nao foi possivel abrir automaticamente. Procure Copex Studio no celular.' }
    Record 'Depois de concluir, voce pode desativar Depuracao USB nas Opcoes do desenvolvedor.'
    $exitCode = 0
} catch {
    Record ('ERRO: ' + $_.Exception.Message)
    $exitCode = 1
} finally {
    if (Test-Path -LiteralPath $work) {
        $content = $log -join "`r`n"
        if ($phoneSerial) { $content = $content.Replace($phoneSerial, '[aparelho]') }
        $content | Set-Content -LiteralPath $report -Encoding UTF8
        Write-Host ('Relatorio: ' + $report)
        if ($exitCode -eq 1) { Start-Process notepad.exe -ArgumentList @('"' + $report + '"') }
    }
}
exit $exitCode
