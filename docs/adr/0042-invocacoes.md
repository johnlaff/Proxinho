# ADR 0042: Moldura das Invocações (criaturas Saga de Final Fantasy)

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0011 (medidas na imagem), ADR 0016 (moldura de Saga) e ADR 0025 (tradução não oficial)

## Contexto

Final Fantasy (FIN, 2025) trouxe as primeiras criaturas Saga: as Invocações ("Summon: Shiva", "Summon: Bahamut"), que entram com um marcador de conhecimento, usam os capítulos e são sacrificadas depois do último, e o Final Fantasy Commander (FIC) trouxe mais sete. São 22 cartas: 15 com o texto oficial do Arena e 7 de FIC com a tradução não oficial. O pipeline deixava de fora toda Saga que é criatura (`saga_supported`), e todas saíam na original, em inglês.

A moldura é a da Saga com três diferenças (a MTG Wiki descreve a mesma coisa, na página "Saga creature"): o lembrete ("As this Saga enters…") vai numa faixa larga no alto, na largura da caixa, que acaba num fio em y ≈ 221 (escala de 745 × 1040), onde a arte começa; a coluna dos capítulos vai desse fio até a barra de tipo, que fica uns 84 px acima da barra da Saga comum (o fio de cima dela de 786 a 789); e abaixo da barra de tipo há uma caixa como a da carta comum, com a palavra-chave da criatura ("Flying", "Ward {2}") ou o flavor centralizados, e a caixa de P/R. As medidas são as mesmas nas 29 impressões de borda preta (FIN, FIC e as promos de pré-estreia, PFIN). As 22 sem borda (de FIN, números 356 a 373, e de FIC, 194 a 200) são outra moldura e ficam como estão. Não achei molde próprio para elas no Proxyshop nem no Card Conjurer.

Duas coisas da moldura atrapalhavam o caminho da Saga:

- **A curva da tira dos marcadores** desce até o pé da faixa do lembrete, à esquerda. Na carta impressa a última linha do lembrete começa depois dela ("add a lore counter"). O lembrete em PT tem três linhas, e com o texto acabando 26 px acima do fio, como na Saga comum, a letra descia a uns 20 px.
- **A barra de tipo escurece perto do símbolo da coleção**, de ~225 em x 580 a ~170 em x 640 (a da carta comum de FIN fica clara até o fim). `findSetSymbolLeft` compara cada coluna com o tom da barra à esquerda: a parte escura inteira passava por tinta, o fim do tipo em inglês e o símbolo viravam um bloco só, e o símbolo "começava" no meio do tipo (o "gle" de "Moogle" ficava ao lado do português, Summon: Choco/Mog, FIN 35) ou depois do começo dele (metade do símbolo era apagada, Summon: Primal Garuda, FIN 37). E o remendo do fim do tipo, só com o lado claro, saía como um bloco claro na parte escura.

## Decisão

**Pipeline.** `saga_supported` deixa de excluir as criaturas: as Invocações de borda preta entram, e o motor confere a moldura. O lembrete do alto é o das Sagas impressas em PT (`top_reminders`, ADR 0016), igual ao de "Sacrifice after III." e "after IV.". O dos Knights of Round, "Sacrifice after V." (FIN 36: e a promo, PFIN 36s), nunca foi impresso em PT: sem ele, a carta sai na original, como as Sagas comuns sem o lembrete.

**Motor** (`renderSummon` em `render.ts`, com as medidas em `SUMMON`, em `saga.ts`), escolhido em `renderCard` pela Saga cuja linha de tipo tem "Creature":

- **A moldura** é conferida na imagem: o fio de cima da barra de tipo (`typeBarEdges`) entre y 775 e 800 e o fio do lembrete (o primeiro de `sagaDividers`, que agora para antes da barra de tipo) entre 214 e 228; os outros fios da coluna têm de ser um a menos que os capítulos. Sem isso, a carta sai na original.
- **O texto** (`sagaText` com `tail`): o lembrete, os capítulos e, depois deles, o resto (a palavra-chave da criatura) para a caixa de baixo. A linha que começa por "•" depois de um capítulo é dele (as três escolhas do Summon: Magus Sisters, FIC 71).
- **Os capítulos** vão como na Saga (ADR 0016), na coluna medida (do fio do lembrete ao alto da barra de tipo): `sagaBands`, `sagaPlan` e `sagaBoxes` recebem a coluna, e os fios entre os capítulos mudam de lugar para o português caber. O fio do lembrete fica.
- **O lembrete** vai na faixa larga, até 5 px acima do fio, com o canto da curva reservado (`SUMMON.curve`, `Notch.left` em `text.ts`): a linha que passa dos 26 px de baixo começa 24 px para dentro, como na carta impressa. O lembrete e os capítulos saem com a mesma letra, de 30 a 18.
- **A barra de tipo**: o tom de cada coluna sai antes de achar o símbolo e de apagar, e volta depois (`pageShade` com o percentil 75 e `shadePage`, os da sombra das páginas da Aventura, ADR 0017). O apagamento do tipo vai até 3 px antes do pé da barra.
- **A caixa de baixo** é medida e apagada como a da carta comum (`insideBoxSides`), com a caixa de P/R e o selo da coleção protegidos. O texto fica centralizado e tem a letra dele, até 34, a da caixa da carta comum (a palavra-chave da carta impressa é maior que os capítulos): numa linha que acaba antes da caixa de P/R, no meio da caixa inteira (o "Voar" do Summon: Bahamut, FIN 1); com mais, acima da caixa de P/R (o flavor do Summon: Shiva, FIN 78).

## Regressão

As 29 impressões de borda preta, montadas com o código desta árvore e conferidas na folha de contato e no zoom: 27 em PT e os Knights of Round na original. O lembrete com a terceira linha depois da curva, os capítulos com os fios no lugar novo, o fim do tipo sem resto do inglês e o símbolo inteiro, e a caixa de baixo sem resto (a "Salvaguarda {2}" do Summon: Leviathan, FIN 77; o papel com textura do Summon: Bahamut, FIN 1; as promos de pré-estreia, com o selo dourado sobre a arte: Summon: G.F. Cerberus, PFIN 162s). A regressão de sempre (ADR 0027) ganha o grupo "invocações". As Sagas comuns não passam pelo código novo: as funções de Saga mudadas recebem a coluna e o resto como antes, por padrão, e a regressão confere.

## Consequências

- As Invocações de FIN e FIC de borda preta saem em PT (as de FIC com a tradução não oficial e o nome em inglês, como as outras dela).
- Os Knights of Round e as 22 sem borda continuam na original.
- Os nomes de capítulo que faltam nos catálogos de palavras do Scryfall (o "Duplicar" e o "Triplicar" do Summon: G.F. Cerberus, FIN 162; o "Ataque em Cadeia" do Summon: Brynhildr) saem em letra comum, como manda `ability_word_lines`; os que estão lá ("Golpe Celestial", "Modo Gestalt") saem em itálico.
