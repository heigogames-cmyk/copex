$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath))
        exit 0
    }
    Write-Host 'COPEX - CONECTAR O ANDROID PELA REDE DE CASA' -ForegroundColor Green
    Write-Host 'O celular precisa estar no mesmo Wi-Fi. O PC precisa continuar ligado.'
    Write-Host 'Nao abra portas no roteador. Esta configuracao fica limitada a sua rede local privada.'
    Write-Host ''
    $connection = Get-NetIPConfiguration | Where-Object {
        $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and $_.InterfaceAlias -notmatch 'vEthernet|VPN|Tailscale'
    } | Select-Object -First 1
    if (-not $connection) { throw 'Nao encontrei a conexao de rede do PC. Conecte o PC e o celular a mesma rede.' }
    $pcAddress = @($connection.IPv4Address.IPAddress)[0]
    if ($pcAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw 'Use uma rede local privada de sua casa.' }
    $profile = Get-NetConnectionProfile -InterfaceIndex $connection.InterfaceIndex
    if ($profile.NetworkCategory -ne 'Private') {
        throw 'A rede do Windows esta como Publica. Se for sua rede de casa, abra Configuracoes > Rede e Internet > Propriedades e escolha Rede privada. Depois abra CONECTAR-CELULAR.cmd novamente.'
    }
    $linuxRoot = (& wsl.exe -d Ubuntu --exec wslpath -a $projectRoot | Select-Object -Last 1)
    if ($LASTEXITCODE -ne 0 -or -not $linuxRoot) { throw 'Abra Ubuntu e conclua seu usuario antes de conectar o celular.' }
    $linuxRoot = $linuxRoot.Trim()
    $random = New-Object byte[] 24
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $generator.GetBytes($random)
    $generator.Dispose()
    $candidate = [Convert]::ToBase64String($random)
    $password = ($candidate | & wsl.exe -d Ubuntu --exec sh "$linuxRoot/scripts/mobile-secret.sh" | Select-Object -Last 1)
    if ($LASTEXITCODE -ne 0 -or -not $password) { throw 'Abra Ubuntu, conclua seu usuario e tente novamente.' }
    $password = $password.Trim()
    Write-Host 'Guarde estes dados para entrar no seu Copex. Nao envie a senha no chat.'
    Write-Host 'Esta e a senha do Copex, diferente da senha do Ubuntu.'
    Write-Host 'Usuario: copex'
    Write-Host ('Senha:   ' + $password) -ForegroundColor Yellow
    Write-Host ''
    $ready = $null
    try { $ready = Invoke-RestMethod -Uri 'http://localhost:3001/api/ready' -TimeoutSec 5 } catch { }
    $accessOkay = $false
    if ($ready -and $ready.privateAccess) {
        try {
            $credential = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('copex:' + $password))
            $privateState = Invoke-RestMethod -Uri 'http://localhost:3001/api/state' -Headers @{ Authorization = 'Basic ' + $credential } -TimeoutSec 5
            $accessOkay = $null -ne $privateState.defaults
        } catch { }
    }
    if (-not $ready -or $ready.app -ne 'copex-studio' -or $ready.androidClient -lt 1 -or -not $ready.privateAccess -or -not $accessOkay) {
        Write-Host 'Primeiro precisamos abrir o Copex atualizado com a senha que acabou de ser preparada.' -ForegroundColor Yellow
        Write-Host '1. Feche a janela antiga do Copex, depois de terminar suas exportacoes.'
        Write-Host '2. Abra INICIAR-COPEX.cmd deste pacote novo.'
        Write-Host '3. Quando o Copex abrir, execute CONECTAR-CELULAR.cmd novamente.'
        Read-Host 'Pressione Enter para fechar'
        exit 0
    }
    $wslAddress = ((& wsl.exe -d Ubuntu --exec hostname -I).Trim() -split '\s+' | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
    if (-not $wslAddress) { throw 'Nao consegui identificar o IP do Ubuntu. Abra INICIAR-COPEX.cmd antes.' }
    $configPath = Join-Path $env:LOCALAPPDATA 'CopexStudio'
    New-Item -ItemType Directory -Force -Path $configPath | Out-Null
    $marker = Join-Path $configPath 'mobile-network.json'
    $old = $null
    if (Test-Path $marker) { $old = Get-Content -Raw $marker | ConvertFrom-Json }
    $rules = (& netsh.exe interface portproxy show v4tov4) -join "`n"
    if ($rules -match '(?m)^\s*0\.0\.0\.0\s+3001\s+') { throw 'Ja existe um encaminhamento global da porta 3001. Ele foi preservado; confira essa configuracao antes de continuar.' }
    $existing = $rules -split "`n" | Where-Object { $_ -match ('^\s*' + [regex]::Escape($pcAddress) + '\s+3001\s+') }
    if ($existing -and (-not $old -or $old.address -ne $pcAddress)) { throw 'Ja existe um encaminhamento nessa porta que este iniciador nao criou. Ele foi preservado.' }
    Start-Service iphlpsvc
    if ($old -and $old.address) {
        & netsh.exe interface portproxy delete v4tov4 ('listenaddress=' + $old.address) 'listenport=3001' | Out-Null
    }
    & netsh.exe interface portproxy add v4tov4 ('listenaddress=' + $pcAddress) 'listenport=3001' ('connectaddress=' + $wslAddress) 'connectport=3001'
    if ($LASTEXITCODE -ne 0) { throw 'O Windows nao conseguiu ativar o encaminhamento. A mensagem acima mostra o motivo.' }
    Get-NetFirewallRule -Name 'CopexStudio-Local-3001' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -Name 'CopexStudio-Local-3001' -DisplayName 'Copex Studio - rede local privada' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -LocalAddress $pcAddress -RemoteAddress LocalSubnet -Profile Private | Out-Null
    @{ address = $pcAddress; port = 3001 } | ConvertTo-Json | Set-Content -Path $marker -Encoding UTF8
    Write-Host ''
    Write-Host 'Agora abra o aplicativo Copex Studio no Android e informe:' -ForegroundColor Green
    Write-Host ('http://' + $pcAddress + ':3001') -ForegroundColor Green
    Write-Host 'Use o usuario copex e a senha mostrada acima.'
    Write-Host 'Se reiniciar o PC e parar de conectar, abra este arquivo novamente para atualizar o IP do Ubuntu.'
    Read-Host 'Pressione Enter para fechar'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Pressione Enter para fechar'
    exit 1
}
