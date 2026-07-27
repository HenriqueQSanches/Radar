@echo off
setlocal
cd /d "%~dp0"

set "EXE_NAME=OpenRadar-windows-amd64.exe"
set "DOWNLOAD_URL=https://github.com/HenriqueQSanches/Radar/releases/latest/download/%EXE_NAME%"

echo ==========================================
echo   Radar - Albion Online
echo ==========================================
echo.

if not exist "%EXE_NAME%" (
    echo Baixando o Radar pela primeira vez, aguarde...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%EXE_NAME%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo.
        echo Nao foi possivel baixar o Radar. Verifique sua conexao com a internet e tente novamente.
        pause
        exit /b 1
    )
    echo Download concluido!
    echo.
)

echo Iniciando o Radar...
start "Radar - Albion Online" "%EXE_NAME%"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5001"

echo.
echo O Radar esta rodando na janela que abriu. Pode fechar esta janela.
timeout /t 4 >nul
exit /b 0
