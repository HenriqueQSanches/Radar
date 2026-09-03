# Análise do projeto e pontos de melhoria

Documento informal, sem pretensão de ser "oficial". É uma revisão do projeto inteiro (o que já existia + o que a gente adicionou na sessão do Flip/i18n) com ideias de melhoria e feature nova. Feito em 2026-09-02.

## Estado atual, resumido

O projeto está bem mais maduro do que "fork de fim de semana". Já tem:

- Captura de rede + decodificação do protocolo Photon do jogo, funcionando pra mob/recurso/player/dungeon/bruma/pesca
- CI de verdade: lint (golangci-lint + eslint), testes (Go + Vitest), pipeline de release automatizado que builda, assina versão, gera checksum e publica draft release no GitHub
- Documentação técnica decente em `docs/technical/` (protocolo, detecção de mists, harvest, etc) e um roadmap (`docs/project/TODO.md`) com histórico de bugs fechados
- Duas features novas dessa sessão: **Flip de mercado local** (`internal/marketflip/`, captura passiva de ordem de compra/venda, zero upload) e **tradução EN/PT corrigida** em todas as páginas

## O que a gente adicionou (resumo rápido)

- `internal/marketflip/`: captura de `AuctionGetOffers`/`AuctionGetRequests`, resolve cidade via `zones.json`, guarda local em `market_flip.json`, expira ordem com mais de 4h
- `internal/server/flip_api.go` + página `/flip`: lista ordens capturadas e calcula oportunidade de flip entre cidades
- `IniciarRadar.bat`: detecta Npcap ausente e abre a página oficial de download (não instala sozinho, por causa da licença gratuita do Npcap)
- `LICENSE`/`README.md`: copyright das mudanças do fork registrado

**Ainda não validado**: o esquema de captura do Flip foi montado em cima do código aberto do `albiondata-client`, não contra uma sessão real de jogo. Isso é a validação mais importante pendente, antes de qualquer coisa nesse documento.

## Pontos de melhoria técnicos (concretos, achados revisando o código)

### Prioridade alta / rápidos

1. **`IniciarRadar.bat` nunca verifica atualização.** Ele só baixa o `.exe` se o arquivo não existir (`tools/release/IniciarRadar.bat:24`). Depois da primeira vez, rodar o `.bat` de novo sempre abre a versão antiga, mesmo que tenha saído um release novo. Dá pra comparar a versão local (o app já expõe `-version`) com a última tag do GitHub via API e rebaixar/perguntar se quer atualizar.
2. **Sem indicador de "última vez que vi isso" por categoria.** Hoje, se o Albion mudar um opcode (já aconteceu antes: dungeons/mists mudaram de 323 pra 325, formato de pacote de pesca mudou), o sintoma é silêncio: nada aparece, sem aviso. Um painel simples em Configurações mostrando "Recursos: visto há 2min / Mobs: visto há 1min / Mercado: nunca visto nesta sessão" viraria sinal imediato de que algo quebrou no protocolo, em vez de precisar notar "ei, cadê os recursos" sozinho.
3. **`market_flip.json` sem backup/merge entre dois PCs.** Você comentou que só você e sua esposa usam o Radar — isso quer dizer que hoje as capturas de vocês dois ficam em arquivos separados, cada um só vendo o que capturou na própria sessão. Um botão "Importar captura de outro arquivo" (cola o `market_flip.json` da sua esposa, funde com o seu, mantendo a captura mais recente por chave) dobraria a cobertura de cidade sem os dois precisarem visitar a mesma cidade.
4. **Opportunities não considera peso/capacidade de carga.** O cálculo de spread hoje é só preço, sem levar em conta quanto dá pra carregar (peso do personagem, bag upgrade, etc). Pra item pesado (madeira, minério) isso pode fazer a "melhor oportunidade" na teoria ser inviável na prática porque não cabe tudo numa viagem.

### Prioridade média

5. **`Opportunities` não mostra Black Market separado.** Hoje ele trata Black Market como só mais uma "cidade" (se o `LocationId` bater com uma entrada do `zones.json`). Vale confirmar se o Black Market realmente aparece no `zones.json` com nome próprio, e se o cálculo de oportunidade faz sentido pra ele (Black Market geralmente é só destino de venda, não tem "comprar lá pra revender", é um mercado de mão única).
6. **Idade da captura não aparece na UI.** O backend já guarda `capturedAt` e já expira em 4h, mas a tela `/flip` não mostra "capturado há Xh" em lugar nenhum — só reflete "expirou ou não". Um selo tipo "há 2h" na tabela ajuda o usuário a julgar se ainda confia naquele preço.
7. **Sem teste de integração ponta a ponta do Flip com pcap real.** Os testes atuais (`internal/marketflip/*_test.go`) usam JSON sintético, o que é ótimo pra lógica, mas não prova que o opcode certo é capturado do jogo de verdade. Quando você conseguir gravar um `.pcap` de uma visita a mercado, vale rodar `tools/photon-dump -inventory` nele e guardar como fixture de teste — assim a suíte de teste passa a provar que o protocolo real bate com o que o código espera.
8. **`TODO.md` do projeto está desatualizado em relação ao fork.** O roadmap em `docs/project/TODO.md` referencia issues (#82, #93 etc) que parecem ser do repositório original do Nouuu, não desse fork. Vale decidir se esse arquivo continua sendo mantido, ou se passa a documentar só o que é relevante pro seu fork (Flip, i18n, etc), pra não confundir quem olhar depois achando que são bugs abertos aqui.

### Baixa prioridade / nice to have

9. Dois `TODO` esquecidos no código: `web/scripts/drawings/PlayersDrawing.js:21` e `web/scripts/handlers/PlayersHandler.js:297`, ambos sobre posição de player (área que já é limitação conhecida e documentada, então não é urgente).
10. `cmd/radar/main.go:341` tem um `TODO(#91)` sobre agregar estatística de pacote entre múltiplas interfaces de captura — hoje isso só aparece nos logs individuais por interface, não teria um total agregado no dashboard do terminal.

## Ideias de feature nova

- **Histórico de preço, não só o último visto.** Hoje o Flip guarda só a captura mais recente por (item, cidade, tipo). Guardar as últimas N capturas por item daria pra ver tendência ("esse item tá subindo ou caindo de preço nas últimas visitas"), sem precisar de banco de dados novo — cabe até em JSON se limitar o histórico.
- **Alerta de "chegou numa cidade nova, hora de checar mercado".** Já que o Radar detecta troca de zona pra desenhar o mapa, dá pra usar esse mesmo sinal pra mostrar um toast tipo "Você chegou em Bridgewatch — já visitou o mercado daqui?" como lembrete, sem precisar o jogador lembrar manualmente de abrir a tela de mercado toda vez.
- **Exportar lista de compra pro Black Market.** Uma vez que o usuário decidiu o que vai comprar/vender, gerar uma lista simples (texto ou checklist na tela) do trajeto: "Compre X em Lymhurst, leve pra vender em Caerleon", ajudando a não esquecer item no meio da rota.
- **Alerta de guilda/aliança**: fora do escopo do Flip, mas já que o Radar já sabe detectar facção do jogador (ver `docs/technical/PLAYERS.md`), dava pra ter um filtro "avisar só quando for de guilda X" — útil em cidade populosa onde giro de jogador é alto.
- **Modo "sessão de flip" com timer.** Uma tela que mostra: quantas cidades você já visitou nessa sessão de captura, quanto tempo faz desde a última captura, e um botão "Nova sessão" que limpa e recomeça — bom pra quem faz giro dedicado (não misturar captura de hoje com a de ontem sem querer).

## Sobre atualizações do Albion Online

O jogo muda o protocolo de rede sem aviso de vez em quando (o próprio histórico do projeto mostra isso: dungeons/mists mudaram de código de evento, o pacote de spawn de peixe mudou de formato, o banco de dados de mob já ficou desatualizado depois de uma patch que adicionou ~591 mobs novos). Isso não é bug, é o preço de ler protocolo não documentado oficialmente. O que dá pra fazer pra sofrer menos com isso:

- Manter o hábito de rodar `npm run update-assets` depois de cada patch grande do jogo (já existe esse script, só precisa lembrar de rodar)
- O painel de "última vez que vi" sugerido no ponto 2 acima ajudaria a perceber rápido quando uma patch quebrou alguma detecção, sem precisar notar "meio que por acaso" que sumiu alguma coisa
- Pro Flip especificamente: se um dia parar de capturar do nada, o primeiro suspeito é o código de operação do mercado ter mudado — nesse caso repete o processo que fizemos aqui (gravar pcap, rodar `photon-dump -inventory`, comparar com o que o código espera)

## Se quiser priorizar

Pra quem só joga com a esposa (sem pressa de escalar pra mais gente), eu focaria nessa ordem: **validar a captura real do Flip primeiro** (sem isso, o resto é teórico), depois **importar/mesclar captura entre vocês dois** (ganho de cobertura imediato com esforço baixo), depois **mostrar idade da captura na UI** (pequeno, mas evita confiar em preço velho sem perceber), e só depois pensar nas features maiores tipo histórico de preço ou lista de rota.
