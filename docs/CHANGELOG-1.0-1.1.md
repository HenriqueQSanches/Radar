# OpenRadar 1.0 → 1.1 — o que mudou

Documentação de tudo que entrou nessa leva de trabalho: da correção do bug de tier de mob até a release 1.1. Cobre 8 commits em `main`.

## Índice
- [Nova convenção de release](#nova-convenção-de-release)
- [Correção do bug de tier de mob](#correção-do-bug-de-tier-de-mob)
- [Ícone das brumas](#ícone-das-brumas)
- [Flip: captura de mercado](#flip-captura-de-mercado)
- [Flip: bugs de dados (cidade e preço)](#flip-bugs-de-dados-cidade-e-preço)
- [Flip: categorias novas](#flip-categorias-novas)
- [Flip: dados públicos de fallback](#flip-dados-públicos-de-fallback)
- [Flip: janela compacta (PiP)](#flip-janela-compacta-pip)
- [Recursos vivos travados sem encante](#recursos-vivos-travados-sem-encante)
- [Alerta de ameaça não disparava em zona vermelha](#alerta-de-ameaça-não-disparava-em-zona-vermelha)
- [Flip travando ao clicar repetidamente](#flip-travando-ao-clicar-repetidamente)
- [O que ainda não foi feito](#o-que-ainda-não-foi-feito)

---

## Nova convenção de release

As releases pararam de usar `vX.Y.Z` (ex: `v2.3.1`) e passaram a usar só `X.Y` (ex: `1.0`, `1.1`). Isso significou:
- Apagar as 8 releases antigas e as 11 tags antigas do GitHub (`2.2.3` até `2.3.3`).
- Ajustar o gatilho de tag no `release.yml` e o `tag_pattern` do `git-cliff` (gerador de changelog) pra aceitarem o formato de 2 números.
- O título da release deixou de ter o prefixo "v".

**Arquivos:** `.github/workflows/release.yml`, `cliff.toml`

---

## Correção do bug de tier de mob

**Sintoma relatado:** criaturas mudando de tier sozinhas (ex: um pelego T7 virar T6 depois de morto), e o problema já tinha acontecido antes.

**Causa raiz:** o arquivo `mobs.min.json` (dados de mob baixados do jogo) estava desatualizado desde julho — um patch da Albion mexeu na tabela de mobs do jogo, e isso desalinhou a posição de cada mob no nosso arquivo.

**O que foi feito:**
- Rebaixado os dados (`items.min.json`, `mobs.min.json`, `spells.min.json`, `harvestables.min.json`, `zones.json`) direto da fonte oficial (`ao-data/ao-bin-dumps`).
- Confirmado que o offset de leitura (`MobsDatabase.OFFSET = 16`) continua correto — só os dados estavam velhos, o código não tinha erro.
- Corrigidos 68 testes que tinham valores antigos de `mobId`/`hp` hardcoded.

**Arquivos:** `web/scripts/data/MobsDatabase.js`, `web/ao-bin-dumps/*.min.json`, `web/scripts/handlers/_MobsHandler.test.js`, `web/scripts/drawings/_MobsDrawing.test.js`

---

## Ícone das brumas

Os portais de bruma comum (mist_0 a mist_4) eram bolhas coloridas lisas, fáceis de confundir com outros marcadores redondos do radar. Trocados pelo ícone de um feitiço não usado em nenhum outro lugar do app (uma silhueta dentro de um anel rúnico), mantendo as mesmas 5 cores por raridade.

**Arquivos:** `web/images/Resources/mist_0.webp` até `mist_4.webp`

---

## Flip: captura de mercado

A aba Flip (rastreador de preço de mercado local e privado) nunca capturava nada. Causa: o código comparava o `OperationCode` do pacote de rede diretamente, mas no protocolo do jogo (Protocol18) esse campo é sempre `1` — o código real da operação vem em `Parameters[253]`. Comparação corrigida.

**Arquivos:** `internal/marketflip/capture.go`

---

## Flip: bugs de dados (cidade e preço)

Depois do fix de captura, dois bugs de dados apareceram no primeiro teste real:

1. **Cidade sempre "—"**: as ordens de mercado do jogo nunca trazem a cidade certa em cada ordem individual (só em documentação, nunca na captura real). Corrigido rastreando a cidade atual do jogador via os eventos de troca de mapa (`JoinFinished`/`ChangeCluster`) e aplicando em toda ordem capturada depois.
2. **Preço 10000x maior**: o jogo manda o preço multiplicado por 10000 (convenção do protocolo), e isso nunca era desfeito. Uma fibra T2 aparecia a 360000 em vez de 36.

**Arquivos:** `internal/marketflip/capture.go`, `internal/marketflip/capture_test.go`

---

## Flip: categorias novas

Antes só existiam as categorias "Recursos" e "Refinados". Agora também tem:
- **Equipamento** (armas, armaduras, bolsas, montarias, etc.) — usando o campo `cat` que já vem no `items.min.json`, só nunca tinha sido lido.
- **Black Market** — itens de artefato/facção de fundição (sufixos `_UNDEAD`, `_KEEPER`, `_MORGANA`, `_HELL`, `_AVALON`).

**Arquivos:** `internal/marketflip/items.go` (novo), `internal/templates/pages/flip.gohtml`, `web/scripts/utils/i18n.js`

---

## Flip: dados públicos de fallback

Quando ainda não há captura própria suficiente de um item (só visto em uma cidade), um toggle opcional (desligado por padrão) busca o último preço público conhecido (Albion Online Data Project) pra completar o cálculo de oportunidade — marcado visualmente como "dado público" na tabela, nunca confundido com dado capturado por você.

**Arquivos:** `internal/marketflip/publicprices.go` (novo), `internal/marketflip/opportunities.go`, `internal/server/flip_api.go`

---

## Flip: janela compacta (PiP)

A página do Flip cresceu demais (tabelas de oportunidades + ordens capturadas), obrigando a minimizar o jogo pra conferir se estava capturando. Agora tem um botão "Compact window" que abre uma janela flutuante separada (Picture-in-Picture), só com um resumo: quantas ordens, quantas oportunidades, e a última captura — sem precisar abrir a página inteira.

**Arquivos:** `web/scripts/utils/FlipPictureInPictureManager.js` (novo), `internal/templates/pages/flip.gohtml`

---

## Recursos vivos travados sem encante

**Sintoma relatado:** alguns recursos vivos (pelegos) simplesmente nunca apareciam no radar, mesmo estando no filtro certo.

**Causa raiz:** recursos vivos nascem como "mob" no jogo, e o encantamento real deles às vezes só chega *depois* do spawn, por um evento separado (`MobChangeState`). Esse evento já corrigia o encantamento pro sistema de combate, mas nunca repassava a correção pro sistema que desenha o ícone do recurso e decide se ele passa pelo filtro de Configurações. Resultado: um recurso genuinamente T4.2 ficava preso mostrando "sem encante" (T4.0) pra sempre — e se o filtro só aceitava encantes específicos, ele nunca aparecia.

Confirmado com logs reais: 43 de 48 recursos vivos detectados numa sessão real ficaram travados assim a vida toda deles.

**Arquivos:** `web/scripts/handlers/HarvestablesHandler.js`, `web/scripts/core/EventRouter.js`

---

## Alerta de ameaça não disparava em zona vermelha

O bug mais sério dessa leva — achado ao vivo, durante teste. O usuário estava numa zona vermelha (PvP total) e não recebeu nenhum aviso sonoro/visual de um jogador hostil que ele conseguia ver no próprio jogo.

**Causa raiz:** o código só considerava "ameaça" um jogador com uma flag específica (`faction === 255`), que representa "sinalizado pra PvP" — um conceito que só existe em zona amarela (onde o PvP é opcional). Em zona vermelha e preta o PvP é total e incondicional, então qualquer jogador é uma ameaça, independente dessa flag. Zona preta já tinha sido corrigida assim antes (bug conhecido como "Pulsating Border"); zona vermelha simplesmente não recebeu a mesma correção na época.

Confirmado com logs reais: mais de 900 detecções de jogador numa sessão de zona vermelha, nenhuma com `faction === 255` — ou seja, o alerta nunca disparou durante toda a sessão.

**Arquivos:** `web/scripts/handlers/PlayersHandler.js`

---

## Flip travando ao clicar repetidamente

**Sintoma relatado:** clicar na aba Flip repetidas vezes travava/derrubava o navegador.

**Causa raiz:** toda página do app roda sua inicialização duas vezes seguidas por padrão (uma vez pela navegação normal, outra por um mecanismo que garante que os dados globais já carregaram) — inofensivo pra a maioria das páginas, mas o Flip cria um timer de atualização (a cada 2 segundos) e reconecta os botões a cada inicialização. Sem limpar a inicialização anterior, cada visita ia dobrando (e depois multiplicando) a quantidade de timers e requisições ativas, até travar.

**Correção:** a inicialização do Flip agora sempre limpa a anterior antes de começar uma nova, então visitar a página várias vezes não acumula mais nada.

**Arquivos:** `internal/templates/pages/flip.gohtml`

---

## O que ainda não foi feito

Identificado durante os testes, mas fora do escopo dessa leva:
- Ícone do "Mist Boss" dá erro 404 (usa o nome bruto do mob como nome de arquivo de imagem, que não existe) — cai num círculo azul de fallback, não quebra nada, mas fica feio.
- Aviso `typeNumber:29 não reconhecido` no banco de dados de recursos estáticos — ainda não investigado.
- Alerta sonoro de "recurso encontrado" (primeiro avistamento de um tipo filtrado) — código já existe em `HarvestablesHandler.js`, mas está desligado por padrão e sem interface pra ativar ainda.
- Rastreador de respawn de recurso esgotado (guardar posição + avisar quando o tempo de respawn real do jogo bater) — só planejado, não implementado.
