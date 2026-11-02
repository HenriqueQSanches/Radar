# Radar - Albion Online

Radar em tempo real pro Albion Online: mostra recursos, mobs e players ao seu redor direto no navegador, lendo o tráfego de rede (sem mexer no cliente do jogo, sem injeção).

> **Não sou o autor original.** Isso aqui é um fork do [OpenRadar](https://github.com/Nouuu/Albion-Online-OpenRadar) (do Nouuu, licença MIT). Eu cloniei o projeto, corrigi uns bugs que estavam me atrapalhando e adicionei algumas coisas que faltavam pra mim. O crédito da base toda é do projeto original — a licença dele está mantida em [`LICENSE`](LICENSE), que também lista meu copyright sobre as mudanças feitas aqui neste fork. Se você forkar este repositório, mantenha os dois avisos de copyright do `LICENSE` (é tudo MIT, então dá pra usar/modificar livremente, só não apaga o crédito).

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

### Log para diagnosticar recurso que "não aparece"
Quando um recurso não aparece no radar, o motivo pode ser as caixinhas de filtro em Resources (tier/encantamento) desmarcadas, e não um bug de verdade — mas isso não dava pra saber só olhando o log. Agora fica registrado tanto quando um recurso passa a ser exibido/escondido pelo filtro quanto quando você marca ou desmarca uma caixinha na tela de Resources, então dá pra comparar os dois e achar a causa sem precisar descrever o que estava marcado.

### Tronco de Cedro T5 aparecendo como Pedra
Recurso estático usa uma faixa fixa de números pra decidir se é Madeira/Pedra/Fibra/Couro/Minério, montada observando o tráfego do jogo ao longo do tempo. Peguei ao vivo um Tronco de Cedro T5.1 chegando com o número 6, que caía bem na faixa que eu tinha marcado como Pedra — cruzei com todo o histórico de log e só o número 7 já tinha aparecido como Pedra de verdade, então movi essa fronteira pra Madeira incluir o 6. As outras faixas (Fibra/Couro/Minério) não foram mexidas.

### Download em um clique só (Windows)
Baixar o `.exe` direto da página de release confundia quem não é da área (tinha checksum, README, binário Linux, tudo junto). Agora tem um `IniciarRadar.bat`: baixa o Radar sozinho na primeira vez, abre o programa e já deixa o navegador aberto em `localhost:5001` — só dar duplo clique.

### Inimigos/Dungeons/Mists/Pesca não apareciam de primeira
Várias caixinhas de visibilidade (tipos de inimigo, Dungeons, Mists, Fishing) nunca tinham um valor padrão — ficavam desmarcadas até abrir cada página e marcar na mão. Agora vêm ligadas por padrão, mesmo esquema já usado nas categorias de log em Configurações.

### Poça de pesca sumida (o jogo mudou o formato do pacote)
O evento de spawn de peixe parou de mandar posição num patch recente do Albion — só manda o ID e a carga restante. Descobri que a posição real chega antes, numa rajada de um evento genérico assim que a poça entra no alcance de visão. Agora isso é guardado e reaproveitado na hora de marcar o peixe no mapa.

### Log de diagnóstico ampliado
Além do log de recursos que já existia, agora também registra o veredito de exibição de inimigo/boss/dungeon/mist/pesca (aceito ou rejeitado, e por qual configuração) e um retrato automático de todas as configurações de visibilidade a cada mudança — para investigar "não está aparecendo" direto pelo log, sem precisar reproduzir ao vivo.

### Dungeons/Brumas sumiram depois de uma atualização do jogo
O jogo mudou o evento de rede da saída de dungeon pra outro código sem aviso, e nada mais aparecia (nem dungeon comum, nem Bruma). Corrigido. O log de eventos de rede crus pode ser ligado em Configurações > Logging quando for preciso investigar a próxima mudança de protocolo.

### Portais de Bruma com o ícone errado, e marcador de saída invisível
Portais de Bruma apareciam com o mesmo ícone de uma dungeon comum — agora usam o próprio conjunto de ícones dedicado, que já vinha com os assets do jogo mas nunca tinha sido ligado. E o marcador de saída da Bruma (o Fogo-Fátuo) estava classificado por engano como inimigo comum, ficando escondido atrás da caixinha de "Inimigo Encantado"; agora aparece sempre.

### Mapa preto nas Brumas/Avalon sem explicação
Zonas de Bruma e Avalon são geradas proceduralmente por instância e realmente não têm uma imagem de mapa fixa — isso não é bug. O radar agora mostra uma legenda explicando isso em vez de um quadrado preto confuso.

### Peixe "andando" pra posição errada, e contagem "0/5" confusa
O jogo recicla os ids internos em poucos segundos entre objetos completamente diferentes, o que fazia o marcador de peixe pular pra onde aquele id passava a apontar — a posição agora trava na primeira vez que a poça é vista. Além disso, uma poça recém-avistada mostrava "0/5" (tecnicamente certo, mas lia como vazia); agora mostra a capacidade real.

### Recorte circular no PiP
O conteúdo da janelinha flutuante do PiP agora é recortado em círculo com um anel na cor de destaque do tema atual, em vez de copiar o quadrado cru do radar com os cantos mortos.

### Tradução quebrada em Baús, Inimigos, Jogadores e Recursos
Quando o alternador de idioma foi adicionado, só cobriu Radar/Mercado/Configurações/Sobre — essas outras 5 páginas continuavam com texto fixo em inglês mesmo trocando pra português. Adicionei o mesmo mecanismo (atributo `data-i18n` + chave no dicionário) nelas também.

### Instalador não avisava quando faltava o Npcap
O `IniciarRadar.bat` baixava e abria o Radar, mas se o Npcap (driver do qual toda a captura de pacote depende) não estivesse instalado, o app só fechava sozinho com um erro técnico sem explicação nenhuma. Agora o instalador detecta isso antes e abre a página oficial de download do Npcap pro usuário instalar. (Não dá pra instalar o Npcap automaticamente pelo próprio instalador: a licença gratuita dele não permite redistribuição por software de terceiro além de 5 sistemas.)

### Instalador nunca percebia versão nova do Radar
Depois da primeira vez, rodar o `IniciarRadar.bat` de novo sempre abria a mesma versão baixada antes, mesmo que já tivesse saído um release novo no GitHub — ele só baixava se o `.exe` não existisse. Agora ele compara a versão local com a última tag do repositório e, se forem diferentes, pergunta se você quer atualizar.

### Queda de FPS no jogo com o radar aberto
Vários relatos de FPS caindo dentro do Albion com o radar ligado, e voltando ao normal ao fechar, inclusive com o log de depuração desligado. Fui medir onde o radar gastava recurso e o grosso não era o log: era o desenho. O radar redesenhava as quatro camadas do canvas 30 vezes por segundo mesmo com você parado no banco sem nada mudando, e cada texto com sombra (contagem de recurso, distância, vida do mob, selo de tier) obrigava o navegador a fazer um desfoque na GPU a cada frame, dezenas de vezes por quadro. A GPU é justamente o que o jogo já usa no limite, então qualquer trabalho extra ali vira queda de FPS. O que mudou, sem alterar nada do que aparece na tela:

- O radar só redesenha quando algo mudou (chegou pacote do jogo, você andou, mexeu numa configuração, carregou uma imagem) ou enquanto uma animação está rodando (borda de ameaça, flash, anéis de cluster). Parado, ele cai de 30 pra 1 redesenho por segundo, que fica como rede de segurança. Como o PiP só recebe quadro quando o canvas muda, o Windows também para de recompor a janelinha em cima do jogo o tempo todo.
- Textos com sombra, os anéis de distância, a borda vermelha de ameaça e as caixinhas de zona e contagem são desenhados uma vez num canvas escondido e depois só copiados, em vez de refeitos a cada frame.
- O filtro de tier/encanto dos recursos era lido do localStorage e convertido de JSON pra cada recurso desenhado em cada frame; agora fica convertido uma vez até a configuração mudar.
- O processo do radar roda com prioridade abaixo do normal no Windows e limitado a dois núcleos, pra quando o processador estiver no limite quem espera seja o radar e não o jogo (o Npcap guarda os pacotes no kernel enquanto isso, não se perde nada).
- O logger do navegador abria uma segunda conexão com o servidor que recebia todos os eventos do jogo sem usar nenhum, dobrando o tráfego de cada página aberta. Agora ela se identifica e só manda log.

Uma observação: qualquer janela por cima do jogo em tela cheia (o PiP do radar, o Discord, qualquer overlay) tira o jogo do modo de apresentação direta do Windows e custa alguns FPS por conta própria. Isso não dá pra resolver no código; se o FPS importa mais que o radar flutuando, vale deixar o radar num segundo monitor ou atrás do jogo com o alerta sonoro ligado.

### Grifo, Dragão Fada e Tecelã (aranha) das Brumas encantadas não apareciam
Um patch do Albion mudou os campos de texto do evento de mob novo. O radar desviava todo mob que trouxesse texto nos campos 31/32 para uma lista separada de portais, e esses bichos passaram a chegar com texto ali, então nunca eram identificados como mob. Agora todo mob novo passa pela identificação normal pelo ID: o portal de Bruma continua aparecendo como antes (pelo ID dele, não pelo texto), e Grifo, Dragão Fada, Tecelã e Aranha de Cristal aparecem com ícone próprio, cada um com a sua caixinha na página de Inimigos (ligadas por padrão).

### Botão "Limpar tudo" e "Marcar tudo" em cada página
Recursos, Inimigos, Baús & Masmorras e Jogadores ganharam dois botões no topo que desmarcam ou marcam todas as caixinhas da página de uma vez, em vez de clicar uma por uma.

### Opções que não funcionavam até abrir a página
Várias opções (mostrar jogadores, som e flash do alerta, pesca, baús, contagem de recursos, entre outras) só passavam a valer depois que a página delas era aberta e a caixinha marcada na mão. Num radar recém-instalado isso significava sem alerta de jogador, sem pesca e sem baú no mapa. Agora todas as opções de visibilidade e alerta já nascem ligadas, e a lista de jogadores deixou de esconder os três grupos (hostil, facção, passivo) até a página de Jogadores ser visitada.

### Recurso mais caro de hoje
Um botão na página do radar consulta o [Albion Online Data Project](https://www.albion-online-data.com/) e mostra o recurso bruto com a maior ordem de venda nas 6 cidades principais (servidor Americas): tier, cidade, preço e há quanto tempo esse preço foi visto, mais os 4 seguintes para comparar. Preço com mais de 24h é ignorado, porque a API só conhece o preço do último jogador com o Albion Data Client que abriu aquele mercado.

### Visual mais simples e radar mais leve
Saíram as animações de página, as sombras, o desfoque dos balões e as transições de troca de página. O menu lateral virou uma lista de texto, sem logo e sem ícones. A página "Sobre" ficou só com créditos, versão e links. O log de depuração, que vinha ligado por padrão e gravava tudo em disco a cada sessão, agora vem desligado (nível WARN, nada em disco); para investigar um bug, ligue em Configurações > Logging.

### Flip, Fazenda e Mercado removidos
As três abas saíram do radar, junto com a captura local de ordens de mercado (`market_flip.json`). O que valia a pena delas virou o botão "Recurso mais caro de hoje" acima.

### Atualização Dragonfire: raridade das brumas e encanto dos mobs
O patch Dragonfire do Albion inseriu um campo no evento de portal (nome da bruma passou do campo 15 para o 16, raridade do 8 para o 9) e no evento de mob (encanto do campo 33 para o 34). Sem isso, toda bruma aparecia como comum (E0), os filtros E1 a E4 não faziam nada e o encanto dos mobs saía zerado. Os campos antigos continuam aceitos, caso o jogo volte atrás.

### Scripts presos no cache do navegador depois de atualizar
O navegador guardava o JavaScript por 1 hora, então logo depois de uma atualização a página nova rodava com o código da versão anterior (textos como `common.selectAll` crus e opções antigas). Agora cada versão do radar identifica seus scripts, e o navegador confere a cada carga se mudou.

### Tema "Sombra" e botão de diagnóstico
Cores neutras: preto, roxo discreto para o principal e vermelho escuro para ações de limpar. Em Configurações > Logging entrou o botão "Ligar diagnóstico completo", que liga DEBUG, log em disco e todas as categorias de uma vez para relatar um bug. A Lista de Ignorados saiu do menu.

### Brumas com a raridade certa no radar
Toda bruma aparecia igual, como uma bolinha azul, porque o desenho pedia um ícone que não existe e a raridade era procurada em campos do pacote que vêm sempre zerados. A raridade está no próprio ID do mob do portal. Agora cada bruma usa o ícone da sua raridade, com o número ao lado, e as caixinhas Solo, Dupla e E0 a E4 da página de Baús passam a controlar esses portais.

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
