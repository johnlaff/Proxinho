# ADR 0045: As criaturas com Protótipo

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0018 (lembretes de palavra-chave das impressas em PT) e ADR 0040 (Mutação, a outra caixa partida em duas)

## Contexto

The Brothers' War (2022) trouxe o Protótipo: a criatura artefato pode ser conjurada com outro custo, outra cor e outro tamanho. A carta mostra os dois. A caixa de texto é a da carta comum, partida em duas: no alto, uma faixa da cor do custo do protótipo, com o lembrete ("Prototype (You may cast…)") à esquerda e, à direita, a aba com o custo do protótipo e, embaixo dela, a caixa de P/R dele; embaixo de um fio, o papel de sempre, com o resto do texto e a caixa de P/R da carta. São 19 cartas de papel (17 de BRO e a Frogmyr Enforcer de Modern Horizons 3) em 40 impressões, com as promos, as de The List e as de arte estendida. O Scryfall as marca com o layout `prototype`, que o pipeline não aceitava: todas saíam na original, em inglês.

Todas estão no Arena e têm impressa em PT. O Arena junta a palavra-chave às da primeira linha, sem o custo e sem o lembrete ("Protótipo, voar"; "Protótipo" sozinha quando não há outra), e a carta impressa em PT traz o lembrete sozinho na faixa e o "Voar" no papel.

## Decisão

**Pipeline.** `prototype_supported`: layout `prototype`, moldura atual, borda preta, sem efeito ou com a arte estendida. `prototype_text` refaz o texto do Arena como a carta impressa: a primeira linha é o lembrete do Protótipo, das impressas em PT (`prototype_reminders`, a linha "Protótipo (…)" do texto impresso; o da própria carta, ou o da impressa mais nova; nunca montado), e o resto da linha da palavra-chave começa a linha seguinte, com maiúscula. Isso vem antes dos lembretes de palavra-chave (ADR 0018): a "Afinidade por artefatos" da Frogmyr, sozinha na linha, ganha o dela, como na carta física. A face leva o custo do protótipo do Oracle (`prototype_cost`, "{1}{W}{W}").

**Motor** (`prototype.ts`, desenho em `renderCard`), como a Mutação (ADR 0040):

- **A faixa** é medida na imagem (`prototypeFrame`): o fio de cima é a última linha bem mais escura que a faixa logo abaixo da barra de tipo, e a faixa tem 98 px a partir dele; o fio de baixo e o papel depois dele têm de estar onde a moldura os põe. Sem eles, a carta sai na original.
- **As abas** ficam como estão (os números e os símbolos são os mesmos em PT). A aba do custo é procurada a até 12 px de onde o número de símbolos do custo a põe: a haste do "h" de "with", logo antes dela, também é escura nas linhas do alto (a faixa azul do Arcane Proxy de pré-estreia, PBRO 75s). A caixa de P/R é procurada de x 560 a 600.
- **O apagamento** da faixa vai da beira dela (`insideBoxSides`) até 3 px antes da primeira aba, como a caixa: papel com grão e letra preta. O papel de baixo é a caixa de sempre, a partir do fio.
- **O texto**: o lembrete na faixa, até 8 px antes das abas, e o resto, com o flavor, no papel, com a mesma letra nas duas partes (`fitRows`), como na impressa em PT.

## Regressão

As 40 impressões, montadas com o código desta árvore e conferidas na folha de contato e no zoom: a faixa de cada cor (as brancas das promos de pré-estreia, como a Steel Seraph, PBRO 38s, quase do tom do papel), as abas inteiras, o papel sem sobra do inglês, as de arte estendida (a caixa 6 px mais baixa na Woodcaller Automaton, BRO 377) e a Frogmyr Enforcer (MH3 120) com o lembrete da Afinidade e o flavor. A regressão de sempre (ADR 0027) ganha o grupo "protótipo". As outras cartas não passam pelo código novo: a faixa de `fitRows` ganhou o flavor como opção, vazio por padrão.

## Consequências

- As 19 criaturas com Protótipo de papel saem em PT, nas 40 impressões, com o lembrete na faixa como na carta impressa.
- As duas do Alchemy não são de papel e não entram.
