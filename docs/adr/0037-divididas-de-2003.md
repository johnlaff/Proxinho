# ADR 0037: Divididas da moldura de 2003 e o Fundir de Dragon's Maze

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0024 (moldura de 2003), ADR 0034 (cartas divididas da moldura atual) e ADR 0036 (Fundir na moldura atual)

## Contexto

Depois das divididas da moldura atual (ADRs 0034 a 0036), as de 2003 eram o grupo seguinte de cartas divididas sem nenhuma arte reescrita: as dez de Dissension (Crime // Punishment, Research // Development, Supply // Demand...), as três de Planar Chaos (Boom // Bust, Dead // Gone, Rough // Tumble), as quinze com Fundir de Dragon's Maze (Turn // Burn, Wear // Tear, Beck // Call, Far // Away...) e as reimpressões na moldura de 2003: Duel Decks, Planechase, Archenemy, Commander, Commander 2013 e The List. São 48 impressões de papel de borda preta; 46 entram, todas com texto em PT, de 35 cartas (14 com o texto impresso em PT, 12 com o do Arena e 9 com a tradução não oficial). As duas da Friday Night Magic de 2006 (Fire // Ice e Life // Death, F06) ficam de fora pela marca-d'água da FNM, como as cartas de pé (ADR 0024).

Girada 90° no sentido horário, cada metade é uma carta pequena da moldura de 2003, a da direita 501 px adiante (480 na moldura atual). As medidas, tiradas das 48 impressões (escala-base deitada, 1040 × 745): papel da barra do nome de 50 a 101 (o contorno da ponta arredondada em x ≈ 47), barra de tipo de 420 a 453 (o contorno em x ≈ 50), caixa de 465 a 663 (o papel de x ≈ 53 a 483) num fio escuro, sem o bisel claro da M15. O custo acaba em x ≈ 483 e 984, com 36 px por símbolo (42 no híbrido). O símbolo da coleção começa a partir de 446 e 946 (o da Friday Night Magic de 2006, o mais largo, em 435 e 927). Nas de Dragon's Maze as caixas acabam em ≈ 613, e a faixa do Fundir vai de 617 a 658, de x ≈ 52 a 985, com o lembrete alinhado à esquerda logo depois do "Fuse" (centralizado na moldura atual) e o papel da faixa, nas douradas, de 145 a 160 de brilho.

## Decisão

**Pipeline.** `split_frame_ok` junta as condições da moldura das divididas: `frame` 2015 ou 2003, layout `split`, borda preta, sem efeito, sem `full_art`, sem moldura desenhada, duas metades, fora de `SPLIT_SETS_OFF`; na de 2003, a marca-d'água de cada metade, se houver, tem de estar em `WATERMARKS_2003_OK` (as marcas lisas, ADR 0024). `split_supported` e `fuse_supported` passam a usar essa função; o lembrete do Fundir (`add_fuse_reminders`) já vale por carta e vai também para as de Dragon's Maze.

**Motor** (`split.ts` e `renderSplit`). As medidas das duas molduras viram um tipo só, `SplitGeometry`, com `SPLIT` (a atual) e `SPLIT_2003`; `renderSplit` escolhe pela moldura da impressão (`frame` 2003), e todas as funções de `split.ts` recebem as medidas (`splitFrame`, `fuseBar`, `splitCostLeft`, `splitBoxes`). O caminho é o da carta deitada (ADR 0034), com estas diferenças:

- **As letras**: o nome e o tipo saem na Matrix Bold (`titleFont(true)`), escrita pela linha de base com o centro das minúsculas medido nas cartas, como na carta de pé de 2003 (ADR 0024): o nome no corpo 35 (maiúsculas de 27 px) e o tipo no 26.
- **O apagamento das barras** começa no contorno da ponta arredondada, como na M15, e `barCapGuard` acha a ponta. Começando no papel, a 4 px da primeira letra, o contorno dela passava pelo contorno da ponta, ficava protegido e sobrava ao lado do português (o "S" de "Sorcery" no Rough // Tumble, PLC 114; o "F" de "Fuse" no Profit // Loss, DGM 130).
- **O pé da barra de tipo**: a perna do "y" de "Sorcery" desce até o chanfro do pé da barra e ficava como um traço depois do "Feitiço". As linhas do chanfro (451 a 456) saem à parte, cada uma pelo tom dela, com a tinta sempre escura (o chanfro é mais escuro que o papel e a polaridade medida num retângulo de 5 linhas saía clara). Com o retângulo da barra até lá, o preenchimento puxava o tom do chanfro para as linhas de cima e o deixava com manchas claras (Planar Chaos).
- **As caixas** são medidas até o fim do papel, sem os 3 px para dentro da moldura atual: o fim de "counters" encosta no fio em x 481 (Flesh // Blood, DGM 128) e o ";" ficava. O que é papel é o que fica a até 30 tons do papel do miolo da caixa (`BoxEdge.drop`), para a medida não passar do papel para o bisel do fio.
- **A faixa do Fundir** é achada pelo fim dela, depois do lembrete (o percentil 80, porque o grão das douradas puxa o papel para baixo), e pelo meio, entre as metades (o percentil 90: as letras de "halves" passam ali, e na linha de base delas o percentil 80 caía nas serifas). O lembrete é escrito alinhado à esquerda, até o corpo 30.
- **O símbolo da coleção** não é procurado, como na moldura atual: o tipo é apagado até x 425 e 917, a 10 px do símbolo mais largo.
- **A marca-d'água** das guildas (Dissension, Dragon's Maze) sai junto com o texto, inteira, como nas divididas da moldura atual; refazê-la por baixo do português pela rede neural, como na carta de pé de 2003, fica para depois.

## Regressão

As 46 impressões, montadas com o código desta árvore e conferidas em folhas de contato e no zoom: os nomes, os tipos (o começo e o pé de cada barra), as caixas e as 21 faixas do Fundir. As 78 divididas, as 9 com Fundir e as 69 com Consequência da moldura atual, montadas de novo, saem idênticas às de antes, pixel a pixel. A regressão de sempre (ADR 0027) ganha os grupos "dividida de 2003" e "fundir de 2003".

## Consequências

- As divididas da moldura de 2003 saem em PT nas 46 artes de borda preta, e as com Fundir de Dragon's Maze com o lembrete oficial na faixa do pé.
- As medidas de cada moldura de divididas de barras ficam num objeto só (`SplitGeometry`). A antiga, sem barras, ficou com medidas e caminho próprios (depois, ADR 0038).
- As divididas da moldura antiga (Invasion, Apocalypse e as reimpressões; depois, ADR 0038) e as da Friday Night Magic de 2006 continuam na original.
