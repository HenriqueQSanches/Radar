import fs from "fs";
import path from "path";

// Parse CLI arguments
const args = process.argv.slice(2);

function getArg(name: string): string | null {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split("=")[1] : null;
}

const OUTPUT_DIR = getArg("output-dir") || "dist";
const VERSION = getArg("version") || getVersionFromPackage();

function getVersionFromPackage(): string {
    try {
        const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
        return packageJson.version || "dev";
    } catch {
        return "dev";
    }
}

console.log(`\n Generating README files in ${OUTPUT_DIR}/\n`);
console.log(` Version: ${VERSION}`);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
}

// Platform configurations
interface PlatformConfig {
    exeName: string;
    platform: string;
    readmeFileName: string;
}

const platforms: Record<string, PlatformConfig> = {
    windows: {
        exeName: "OpenRadar-windows-amd64.exe",
        platform: "win64",
        readmeFileName: "README-windows.txt",
    },
    linux: {
        exeName: "OpenRadar-linux-amd64",
        platform: "linux-x64",
        readmeFileName: "README-linux.txt",
    },
};

function createWindowsReadme(exeName: string): string {
    return `# OpenRadar v${VERSION} - Radar do Albion Online (Windows)

## Sobre

OpenRadar é um aplicativo Go nativo (~95 MB) com tudo embutido.
Não precisa de nenhuma dependência externa além do Npcap.

## Instalação

1. **Instale o Npcap** (OBRIGATÓRIO - versão 1.84 ou mais nova)
   Download: https://npcap.com/
   Link direto (v1.84): https://npcap.com/dist/npcap-1.84.exe

2. **Abra o ${exeName}**
   Dê duplo clique no ${exeName}

3. **Selecione seu adaptador de rede**
   Escolha o adaptador que você usa pra conectar na Internet
   (NÃO escolha 127.0.0.1 ou localhost)

4. **Acesse o radar**
   Abra http://localhost:5001 no navegador

## Opções de linha de comando

  ${exeName} -version     Mostra a versão
  ${exeName} -ip X.X.X.X  Pula a seleção de adaptador
  ${exeName} -dev         Modo desenvolvimento (lê os arquivos do disco)

## Requisitos

- Windows 10/11 (64-bit)
- Npcap 1.84 ou mais novo instalado

## Verificação

Esse binário foi compilado a partir do código aberto via GitHub Actions CI/CD.
Verifique a integridade usando o arquivo de checksums:

  certutil -hashfile ${exeName} SHA256

Compare com o checksums-sha256.txt da release.

## Suporte

GitHub: https://github.com/HenriqueQSanches/Radar

## Detalhes técnicos

- Backend Go nativo (v2.0)
- Binário único com tudo embutido
- Servidor na porta 5001 (HTTP + WebSocket em /ws)
- Captura tráfego UDP na porta 5056

Compilado para: win64
`;
}

function createLinuxReadme(exeName: string): string {
    return `# OpenRadar v${VERSION} - Radar do Albion Online (Linux)

## Sobre

OpenRadar é um aplicativo Go nativo (~95 MB) com tudo embutido.
Não precisa de nenhuma dependência externa além do libpcap.

## Instalação

1. **Instale as dependências** (OBRIGATÓRIO)

   Ubuntu/Debian:
     sudo apt-get install libpcap0.8 libcap2-bin

   Fedora/RHEL:
     sudo dnf install libpcap libcap

   Arch Linux:
     sudo pacman -S libpcap libcap

2. **Torne executável**
   chmod +x ${exeName}

3. **Conceda permissão de captura** (escolha UMA opção)

   Opção A - Rodar como root (simples):
     sudo ./${exeName}

   Opção B - Conceder capabilities (recomendado, roda como usuário normal):
     # Concede permissão de captura de rede
     sudo setcap cap_net_raw,cap_net_admin=eip ./${exeName}

     # Confere se as capabilities foram aplicadas (opcional)
     getcap ./${exeName}

     # Roda como usuário normal
     ./${exeName}

   Obs: as capabilities são removidas se o arquivo for modificado ou movido.
   Rode o setcap de novo depois de cada atualização.

4. **Selecione seu adaptador de rede**
   Escolha o adaptador que você usa pra conectar na Internet
   (NÃO escolha 127.0.0.1 ou localhost)

5. **Acesse o radar**
   Abra http://localhost:5001 no navegador

## Opções de linha de comando

  ./${exeName} -version     Mostra a versão
  ./${exeName} -ip X.X.X.X  Pula a seleção de adaptador
  ./${exeName} -dev         Modo desenvolvimento (lê os arquivos do disco)

## Requisitos

- Linux (Ubuntu 18.04+, Debian 10+, Fedora 32+, Arch, etc.)
- libpcap instalado
- libcap instalado (pro comando setcap)
- Permissão de captura de rede (root ou setcap)

## Resolução de problemas

Se aparecer "permission denied" ou "no suitable device found":
  sudo setcap cap_net_raw,cap_net_admin=eip ./${exeName}

Se o setcap não for encontrado, instale o libcap:
  Ubuntu/Debian: sudo apt-get install libcap2-bin
  Fedora/RHEL:   sudo dnf install libcap
  Arch Linux:    sudo pacman -S libcap

Se o setcap não funcionar, rode como root:
  sudo ./${exeName}

## Verificação

Esse binário foi compilado a partir do código aberto via GitHub Actions CI/CD.
Verifique a integridade usando o arquivo de checksums:

  sha256sum ${exeName}

Compare com o checksums-sha256.txt da release.

## Suporte

GitHub: https://github.com/HenriqueQSanches/Radar

## Detalhes técnicos

- Backend Go nativo (v2.0)
- Binário único com tudo embutido
- Servidor na porta 5001 (HTTP + WebSocket em /ws)
- Captura tráfego UDP na porta 5056

Compilado para: linux-x64
`;
}

// Generate README for each platform
for (const [key, config] of Object.entries(platforms)) {
    const readmePath = path.join(OUTPUT_DIR, config.readmeFileName);
    const content =
        key === "windows"
            ? createWindowsReadme(config.exeName)
            : createLinuxReadme(config.exeName);

    fs.writeFileSync(readmePath, content, "utf8");
    console.log(` ${config.readmeFileName} created`);
}

console.log("\n README generation completed!\n");