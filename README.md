# Radar - Albion Online

Radar em tempo real pro Albion Online: mostra recursos, mobs e players ao seu redor direto no navegador, lendo o tráfego de rede (sem mexer no cliente do jogo, sem injeção).

> **Não sou o autor original.** Isso aqui é um fork do [OpenRadar](https://github.com/Nouuu/Albion-Online-OpenRadar) (do Nouuu, licença MIT). Eu cloniei o projeto, corrigi uns bugs que estavam me atrapalhando e adicionei algumas coisas que faltavam pra mim. O crédito da base toda é do projeto original — a licença dele está mantida em [`LICENSE`](LICENSE).

## O que eu corrigi / adicionei

### Tier dos mobs saindo errado
O radar estava marcando mob t3 como t6/t7, e os tiers que eu selecionava pra marcar não apareciam. A causa era o banco de dados de mobs desatualizado: desde a última atualização, o jogo ganhou ~591 mobs novos, e isso empurrava o ID de **todos** os bichos de forma irregular (não dava pra compensar com um ajuste único). Atualizei o `web/ao-bin-dumps/mobs.min.json` pro patch atual do jogo, então cada mob volta pra posição certa e o tier sai correto.

### Mobs encantados com tier trocado
Mob encantado tem o HP inflado pelo encanto, e isso enganava a identificação por HP (um t2 encantado batia por coincidência com o HP de um t6 vizinho). Agora, quando o mob está encantado, a identificação usa só o ID do mob e ignora o HP, que nesse caso não é confiável.

### Som de alerta mais alto
O alerta de "inimigo por perto" tocava no volume máximo do arquivo, que é baixo demais pra ouvir com o jogo em foco. Passei a tocar via WebAudio com ganho ajustável (padrão 6x, dá pra mudar em `settingSoundBoost`), pra dar pra reagir sem ficar de olho na tela. Também destravei o áudio no primeiro clique da página, senão ele não tocava com a aba em segundo plano (modo PiP).

### Alerta por movimentação
Antes o som só disparava quando o inimigo aparecia. Agora ele também dispara quando um inimigo já detectado se movimenta por perto — mas só **um apito por inimigo** (some quando ele sai e volta), pra não virar uma sirene.

### Calibração de tier corrompida por bicho comum (T1/T3 marcado como T7, tronco virando pelego)
A correção do encantamento resolvia só metade do problema: quando o HP de um pelego comum (coelho, T1/T3) coincidia com o de outro bicho de tier bem diferente (às vezes um chefe), o sistema de calibração votava nisso e ia acumulando erro ao longo da sessão — depois disso, bichos completamente não relacionados (inclusive troncos/madeira) saíam com tier ou tipo errado. Agora a calibração só aceita votos de janelas de HP coerentes (onde todos os candidatos concordam entre si), e mesmo quando o resultado é ambíguo, prefere sempre o candidato com HP confirmado em vez de um palpite já sabido errado.

### Minério (e outros recursos vivos) com ícone errado
Corpos de "critter" (bichinho que vira recurso ao morrer) tinham o tipo do recurso decidido sem nenhuma verificação — se a calibração acima estivesse um pouco torta, o ícone saía errado (ex: minério aparecendo como outro material) mesmo com o tier certo, já que o tier vem direto do servidor. Agora usa esse tier confiável do servidor pra confirmar/corrigir a identificação.

### Alerta de jogador mais visível
A posição de outros jogadores é criptografada pelo próprio Albion (proteção anti-radar), então eles nunca aparecem "andando" no mapa — só dá pra saber que tem um por perto. Pra compensar, além do flash de tela e do som que já existiam, agora aparece também um aviso na tela com nome e guilda do jogador hostil, que fica alguns segundos (não é só um pisca rápido que dá pra perder).

### Log detalhado ligado por padrão
Investigar um bug de identificação (tier/tipo errado) só dava pra fazer pegando o F12 no exato momento que acontecia — impraticável no meio de uma sessão de jogo. Agora o log de Mobs/Recursos Coletáveis em nível DEBUG, salvo em `logs/debug/`, já vem ativado por padrão (Configurações > Logging), sem precisar mexer em nada. Dá pra desligar por lá se o volume de log incomodar.

### Log para diagnosticar recurso que "não aparece"
Quando um recurso não aparece no radar, o motivo pode ser as caixinhas de filtro em Resources (tier/encantamento) desmarcadas, e não um bug de verdade — mas isso não dava pra saber só olhando o log. Agora fica registrado tanto quando um recurso passa a ser exibido/escondido pelo filtro quanto quando você marca ou desmarca uma caixinha na tela de Resources, então dá pra comparar os dois e achar a causa sem precisar descrever o que estava marcado.

### Tronco de Cedro T5 aparecendo como Pedra
Recurso estático usa uma faixa fixa de números pra decidir se é Madeira/Pedra/Fibra/Couro/Minério, montada observando o tráfego do jogo ao longo do tempo. Peguei ao vivo um Tronco de Cedro T5.1 chegando com o número 6, que caía bem na faixa que eu tinha marcado como Pedra — cruzei com todo o histórico de log e só o número 7 já tinha aparecido como Pedra de verdade, então movi essa fronteira pra Madeira incluir o 6. As outras faixas (Fibra/Couro/Minério) não foram mexidas.

### Download em um clique só (Windows)
Baixar o `.exe` direto da página de release confundia quem não é da área (tinha checksum, README, binário Linux, tudo junto). Agora tem um `IniciarRadar.bat`: baixa o Radar sozinho na primeira vez, abre o programa e já deixa o navegador aberto em `localhost:5001` — só dar duplo clique.

### Calcular Rota (preço de recursos)
Botão novo na página do radar: busca o preço de venda de Madeira/Pedra/Fibra/Couro/Minério (T3-T5, incluindo T4.1/T5.1) nas 6 principais cidades de mercado (Thetford, Fort Sterling, Lymhurst, Bridgewatch, Martlock, Caerleon), via [Albion Online Data Project](https://www.albion-online-data.com/) — não precisa instalar o Albion Data Client, essa API pública já é alimentada por quem usa esse app. Resultado ordenado do preço mais alto pro mais baixo, servidor Americas.

## Como rodar

Precisa de [Go](https://go.dev/) e [Node.js](https://nodejs.org/) instalados, e do [Npcap](https://npcap.com/) pra capturar o tráfego.

```bash
npm install
npm run build          # gera o CSS e copia os vendors
go run ./cmd/radar     # backend + radar em http://localhost:5001
```

Durante o desenvolvimento dá pra rodar lendo os arquivos direto do disco (sem recompilar a cada mudança de JS/CSS):

```bash
go run -tags dev ./cmd/radar -dev
```

Aí é só abrir `http://localhost:5001` no navegador. Pra sobrepor só o radar por cima do jogo, use o botão **PiP Mode** (o Albion precisa estar em modo janela sem borda).

Pra instruções completas de build, release e configuração, veja o [projeto original](https://github.com/Nouuu/Albion-Online-OpenRadar).

## Licença

MIT — mantida do projeto original. Veja [`LICENSE`](LICENSE).
