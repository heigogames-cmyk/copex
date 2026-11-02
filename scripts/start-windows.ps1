$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
try {
    Write-Host ''
    Write-Host 'COPEX STUDIO - ABRIR NO WINDOWS' -ForegroundColor Green
    Write-Host 'Na primeira vez, precisamos do Ubuntu pelo recurso WSL do Windows.'
    Write-Host 'Seus arquivos continuam no seu computador. Nao e hospedagem publica.'
    Write-Host ''
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
        throw 'Este Windows nao possui WSL. Use Windows 10 atualizado ou Windows 11 e consulte LEIA-PRIMEIRO-WINDOWS.txt.'
    }
    $ErrorActionPreference = 'Continue'
    $distros = ((& wsl.exe --list --quiet 2>$null) -join "`n").Replace([string][char]0, '')
    $listExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($listExitCode -ne 0 -or $distros -notmatch '(?m)^Ubuntu\s*$') {
        Write-Host 'O Ubuntu ainda nao esta instalado.' -ForegroundColor Yellow
        Write-Host 'A instalacao usa o comando oficial: wsl --install -d Ubuntu'
        Write-Host 'O Windows pode pedir permissao de administrador e reinicializacao.'
        $answer = Read-Host 'Deseja abrir a instalacao agora? Digite S para sim'
        if ($answer -notmatch '^[sS]$') { exit 0 }
        Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-NoExit', '-Command', 'wsl.exe --install -d Ubuntu')
        Write-Host ''
        Write-Host 'Depois da instalacao/reinicio, abra Ubuntu no menu Iniciar.'
        Write-Host 'Crie o nome de usuario e a senha que ele solicitar. Ao digitar a senha, nada aparece: isso e normal.'
        Write-Host 'Depois execute INICIAR-COPEX.cmd novamente.' -ForegroundColor Green
        Read-Host 'Pressione Enter para fechar esta janela'
        exit 0
    }
    Write-Host 'Se o Ubuntu pedir um usuario e senha na primeira abertura, conclua essa etapa.'
    $linuxRoot = (& wsl.exe -d Ubuntu --exec wslpath -a $projectRoot | Select-Object -Last 1)
    if ($LASTEXITCODE -ne 0 -or -not $linuxRoot -or -not $linuxRoot.StartsWith('/')) {
        throw 'Abra Ubuntu no menu Iniciar, conclua a criacao do usuario e tente novamente.'
    }
    $linuxRoot = $linuxRoot.Trim()
    Write-Host 'Preparando o Copex. A primeira abertura pode levar alguns minutos.'
    Write-Host 'Se pedir [sudo] password, digite a senha criada no Ubuntu e pressione Enter.'
    Write-Host ''
    & wsl.exe -d Ubuntu --exec bash "$linuxRoot/scripts/start-windows.sh" $linuxRoot
    if ($LASTEXITCODE -ne 0) { throw 'A inicializacao nao terminou. Veja a mensagem acima e envie uma foto desta janela para receber ajuda.' }
} catch {
    Write-Host ''
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Pressione Enter para fechar'
    exit 1
}
