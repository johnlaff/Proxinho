# ADR 0036: Fundir na moldura atual

- Status: aceito
- Data: 25/11/2026
- Complementa: ADR 0034 (cartas divididas da moldura atual) e ADR 0018 (lembretes de palavra-chave)

## Contexto

As cartas com Fundir (Fuse) nasceram em Dragon's Maze (2013), na moldura de 2003. Na moldura atual elas voltaram nas reimpressões: Turn // Burn (Guild Kits), Wear // Tear (Commander Legends, os decks de Commander de Dominaria United e de March of the Machine, Fallout), Gallifrey Falls // No More (Doctor Who) e Double Jump // Flying Kick (Tartarugas Ninja). São 9 impressões de borda preta com texto em PT; a de teste do Unknown Event fica de fora, como as outras cartas de teste (ADR 0034).

Girada 90° no sentido horário, a carta é a dividida da moldura atual (ADR 0034), com duas diferenças: as caixas acabam mais cedo, em y ≈ 665, num fio escuro, e no pé da carta corre de uma metade à outra a faixa do Fundir, com "Fuse (You may cast one or both halves of this card from your hand.)" centralizado. O papel da faixa vai de y ≈ 672 a 704 (3 px abaixo nas de March of the Machine) e de x ≈ 95 a 990, com o degradê das cores das duas metades (azul para vermelho no Turn // Burn), e passa por cima da borda preta entre as metades.

Nos dados havia dois problemas:

- O Fundir fica dentro do texto: no Arena (Pioneer Masters) a carta inteira termina com uma linha "Fundir" sem o lembrete e as metades vêm sem ela; na tradução não oficial cada metade termina com "Fundir (…)". O lembrete oficial em PT está nas impressas em PT (Wear // Tear de DMC e de CMR): "Você pode conjurar uma ou ambas as metades deste card da sua mão."
- O Arena dá às metades do Turn // Burn os nomes "turno" e "A Queima", e à primeira do Armed // Dangerous "Armados", enquanto a carta inteira é "Transformar // Queimar" e "Armado // Perigoso", como na carta impressa em PT (Gatherer).

## Decisão

**Pipeline.** `fuse_supported`: `frame` 2015, layout `split`, borda preta, sem efeito, sem `full_art`, sem moldura desenhada, duas metades e a palavra-chave Fuse, fora as coleções de `SPLIT_SETS_OFF`. `add_fuse_reminders` tira a linha do Fundir do texto de cada metade (`without_fuse`) e põe em todas as faces, em `reminder_pt`, "Fundir (…)" com o lembrete oficial das impressas (`reminder_texts`); sem o lembrete oficial, nada muda. `half_names` passa a dar a cada metade a parte dela do nome da carta inteira sempre que o número de partes bate (antes, só quando a metade vinha com o nome inteiro, na Hustle).

**Motor** (`split.ts` e `renderSplit`). O caminho é o da dividida da moldura atual:

- **A faixa** é achada na imagem (`fuseBar`): o trecho claro de 26 a 40 px que começa depois de um escuro (o fio), pela mediana de cada linha nos trechos da faixa sem letras (antes do "Fuse" e depois do fim do lembrete), e que passa clara também entre as metades, onde as outras divididas têm a borda preta. Com a faixa e sem o lembrete nos dados, ou o contrário, a carta sai na original.
- **As caixas** são medidas até o fio acima da faixa (`splitBoxes` com a faixa).
- **A faixa** sai linha a linha, como as barras, entre as pontas arredondadas (a da esquerda protegida por `barCapGuard`), e o "Fundir (…)" é escrito centralizado nela, até o corpo 27 (o lembrete em itálico, como no inglês).
- **O alinhamento das caixas**: as duas metades são compostas do mesmo jeito, e a caixa em que não dá para dizer se o inglês é centrado (uma linha que enche a caixa, "Destroy target enchantment.") segue a outra. Nas 78 divididas sem Fundir isso não muda nenhuma carta.

## Regressão

As 9 impressões, montadas com o código desta árvore e conferidas na folha de contato e no zoom (nomes, tipos, caixas e a faixa). As 78 divididas da moldura atual, montadas de novo, saem idênticas às de antes. A regressão de sempre (ADR 0027) ganha o grupo "fundir", com as 9.

## Consequências

- As cartas com Fundir da moldura atual saem em PT, com o lembrete oficial na faixa do pé.
- O nome das metades do Turn // Burn e do Armed // Dangerous fica certo ("Transformar // Queimar").
- As de Dragon's Maze e as outras divididas da moldura de 2003 (depois, ADR 0037) e de 1997 continuam na original, até terem as medidas delas.
