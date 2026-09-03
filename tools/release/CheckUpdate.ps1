# Checa se ha uma versao mais nova do Radar publicada no GitHub e, se houver,
# pergunta ao usuario se quer atualizar. Se ele topar, apaga o .exe local pra
# que o IniciarRadar.bat baixe a versao nova na sequencia.
#
# Mantido como arquivo separado pra ficar legivel/testavel; o IniciarRadar.bat
# roda uma copia embutida (via -EncodedCommand) desta mesma logica, pra nao
# precisar distribuir dois arquivos no release.

$exeName = 'OpenRadar-windows-amd64.exe'
$repo = 'HenriqueQSanches/Radar'

if (-not (Test-Path $exeName)) {
    exit 0
}

try {
    $localRaw = & ".\$exeName" -version
    $local = ''
    if ($localRaw -match 'OpenRadar v(\S+)') {
        $local = $matches[1]
    }

    $latest = (Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -UseBasicParsing -TimeoutSec 5).tag_name

    if ($latest -and $local -and ($latest -ne $local)) {
        Write-Host ""
        Write-Host "Tem uma versao nova do Radar disponivel: $latest (voce tem $local)"
        $resp = Read-Host "Atualizar agora? (S/N)"
        if ($resp -match '^[sS]') {
            Remove-Item $exeName -Force
            Write-Host "Removido. O Radar vai baixar a versao nova."
        }
    }
} catch {
    # sem internet ou API fora do ar: segue com a versao local, sem travar o usuario
}
