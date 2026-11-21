# ADR 0025: tradução não oficial das cartas sem texto em PT

- Status: aceito
- Data: 21/11/2026
- Muda: ADR 0002 (o item 3, "nenhum: a carta sai em inglês") e a regra "Texto de carta nunca é traduzido por máquina" do `AGENTS.md`

## Contexto

Depois de corrigir a falsa imagem em PT do Scryfall (ADR 0024), 7.384 das 33.889 cartas ficavam sem nenhum texto oficial em português: nem no Arena, nem numa impressão em PT. Entre elas estão cartas muito jogadas, de produtos que nunca saíram em PT (boa parte dos de Commander, a Secret Lair, os crossovers de Fallout, Doctor Who, Assassin's Creed e Transformers) e as que saíram em PT só com o nome (o Scryfall tem a carta em inglês com o selo "Localized Image Not Available"). Nas 10 mil mais jogadas no EDHREC, 987 saíam em inglês.

O João pediu para traduzir essas cartas (21/11, "Transcrever e traduzir"), marcadas como tradução não oficial.

Pesquisa (no documento de evolução do projeto): o padrão de mercado é a tradução de máquina sem controle (o MtG Proxy Printer usa IA, Google ou Microsoft e põe um selo "MT"). O estado da arte é a tradução guiada por glossário e por exemplos aprovados, a memória de tradução: na tarefa de terminologia do WMT 2025, dar a terminologia certa melhorou a qualidade e o acerto dos termos; traduzir e depois revisar impondo os termos (DuTerm) e buscar exemplos aprovados na hora de traduzir são o que a localização de jogos usa hoje. E as 26.416 faces oficiais dão 29.629 linhas distintas pareadas com o Oracle: muitas linhas das cartas sem tradução já saíram iguais em alguma carta oficial.

## Decisão

**Uma linha de cada vez, da mais oficial para a menos.** `add_unofficial` (no fim de `build()`) monta o texto das cartas sem texto oficial, linha a linha do Oracle, sem o lembrete e com o nome da carta como "~" (`line_key`):

1. a linha que já saiu igual numa carta oficial leva o texto dela (`official_lines`, o do Arena na frente, que segue o padrão de hoje; só faces com o mesmo número de linhas nos dois idiomas);
2. a que só muda nos números e símbolos leva o molde da oficial (`mold`, `fill_mold`). O molde leva o plural: "1 ponto de vida" não serve a "3 pontos de vida";
3. o resto vem de `data/traducao/linhas.json`, traduzido nesta sessão no padrão do Arena, com o glossário das cartas oficiais ("card", "conjurar", "ficha", "marcador", "triturar", "entrar" sem "o campo de batalha") e conferido contra os pares oficiais parecidos. Um teste do pipeline confere cada linha traduzida: os mesmos símbolos, números, "X" e "~" nos dois idiomas.

Basta uma linha sem tradução, ou um tipo que não se traduz, para a carta seguir em inglês, como antes. A linha de tipo vem das oficiais (`official_types`: a parte antes do travessão inteira, os subtipos um a um, o Arena com peso dobrado) e de `data/traducao/tipos.json` para os subtipos que nunca saíram em PT ("Time Lord", "Dalek"); o subtipo de planeswalker é nome próprio e fica.

**O mesmo acabamento das cartas do Arena.** O custo de lealdade dos planeswalkers (`pw_costs`), o lembrete do alto das Sagas e Classes (`top_reminder`), o lembrete oficial de cada palavra-chave (`add_reminders`, ADRs 0018 e 0021) e as palavras de habilidade em itálico (`ability_word_lines`). Sem flavor: o flavor não oficial seria só enfeite inventado.

**O nome fica em inglês**, salvo quando existe o nome impresso em PT (as 2.636 que o Scryfall tem só com o nome). Nunca se inventa nome.

**Marcada em todo lugar, menos na carta.** A carta tem `source: "nao-oficial"` e o resultado `nao-oficial`, com a etiqueta "PT não oficial" (ciano lavado com contorno tracejado, `DESIGN.md`), a legenda "não oficial" sob a carta na folha, "Reescrita com tradução não oficial" no resumo, "Tradução não oficial" na escolha da arte e a explicação na gaveta. A carta impressa não leva marca: a proxy tem de parecer a física, e o PDF já diz em toda página que é conteúdo de fã não oficial. Quando há a imagem oficial em PT (as de Dragon's Maze só têm a imagem, sem o texto no Scryfall), ela é a escolha padrão, antes da tradução não oficial (`defaultChoice`).

**Custo zero.** A tradução roda uma vez, nesta sessão, e fica versionada no repositório; o pipeline diário só a aplica. Linha nova (carta nova sem texto oficial) entra num lote novo, revisado do mesmo jeito.

## Consequências

- Primeira entrega: 2.459 linhas traduzidas, das cartas mais jogadas para as menos. 2.942 cartas ganharam texto em PT, com 5.075 linhas: 2.243 (44%) iguais a uma oficial, 286 (6%) pelo molde de uma oficial e 2.546 (50%) traduzidas. Nas 10 mil mais jogadas, o PT foi de 90,0% para 100% (falta uma, de tipo sem tradução); no total, de 78,2% para 86,9% (nas legais no Commander, de 83,8% para 92,1%). Os próximos lotes seguem pela ordem do EDHREC.
- A tradução não oficial nunca vence a oficial: quando o Arena ou uma impressão em PT trouxer a carta, ela passa sozinha para o texto oficial (o pipeline só traduz as que ficaram sem `source`).
- O montador do servidor (ADR 0022) já monta essas cartas: a fila pede `source` e `name_pt`, e as duas existem.
- Uma tradução errada só aparece quando alguém lê a carta. As linhas ficam num arquivo só (`data/traducao/linhas.json`, inglês → português) para corrigir sem mexer no código; o "reportar tradução" do roadmap passa a servir também para elas.
- Falta transcrever as 87 cartas com a imagem em PT de verdade e sem o texto no Scryfall (86 de Dragon's Maze e uma Phyrexian Altar de promo): por enquanto saem na imagem oficial, ou com a tradução não oficial numa arte em inglês.

## Alternativas descartadas

- **Seguir em inglês** (ADR 0002): 987 das 10 mil cartas mais jogadas no deck dos amigos do João saíam em inglês.
- **Tradução de máquina sem memória** (Google, DeepL, um modelo sem os exemplos oficiais): erra a terminologia ("terra" em vez de "terreno", "lançar" em vez de "conjurar") e muda de uma carta para outra a frase que o Arena escreve sempre igual.
- **Uma API de modelo de linguagem no pipeline diário**: custo e segredo novo a cada carta nova, sem revisão. A tradução fica no repositório, uma vez.
