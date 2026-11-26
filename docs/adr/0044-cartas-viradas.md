# ADR 0044: As cartas viradas de Kamigawa (flip)

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0024 (moldura de 2003), ADR 0025 (tradução não oficial) e ADR 0035 (Consequência, a outra metade na carta girada)

## Contexto

O bloco de Kamigawa (Champions, Betrayers e Saviors of Kamigawa, 2004 e 2005) trouxe as cartas viradas: a carta tem duas metades, uma acima da arte, de pé, e a outra abaixo dela, de cabeça para baixo, para ser lida quando a carta é virada no campo. O Scryfall as marca com o layout `flip`. São 20 cartas em 33 impressões de borda preta ou branca: as de Kamigawa, as de The List, as da Hachette (de borda branca), a promo de Betrayers e as reimpressões do Commander 2011 (na moldura de 2003) e do Commander 2018 e do Commander Anthology Volume II (na atual). O pipeline só aceitava o `normal` e os outros layouts já feitos, e todas saíam na original, em inglês.

Nenhuma delas saiu em PT com texto no Scryfall nem está no Arena: 19 têm só a tradução não oficial, com o nome em inglês (ADR 0025), e a Erayo (SOK 35), banida no Commander, nem essa. Cinco delas ("Toda vez que você conjurar uma mágica Arcana ou de Espírito…", Budoka Pupil, BOK 122) saíam com o "jogar uma mágica" das impressas de Kamigawa, de antes do Magic 2010: o texto dessas impressas deixou de servir de linha oficial para a tradução não oficial (`official_lines`), e as 159 linhas que só o tinham foram traduzidas de novo.

Cada metade tem a barra do nome, a caixa de texto e a barra de tipo, com a caixa de P/R no fim da barra quando a metade é criatura. Girada 180°, a de baixo fica de pé como a de cima, mas não no mesmo lugar: na moldura de 2003, a barra de tipo da de cima vai de y ≈ 258 a 312 (escala de 745 × 1040) e a da de baixo, girada, de 286 a 341, e a caixa dela fica 6 px mais à direita; na atual, a de baixo fica 81 px mais abaixo. Na moldura atual o símbolo da coleção fica na barra de tipo da de cima, antes da caixa de P/R; na de 2003, no canto de baixo da carta, fora das barras.

## Decisão

**Pipeline.** `flip_supported`: layout `flip`, moldura de 2003 ou atual, borda preta ou branca, sem efeito. As fichas de Papel de Wilds of Eldraine também têm o layout `flip` e ficam de fora pelo tipo ("Token"), e a de Unhinged pela borda prateada. A segunda face da carta é a metade de baixo; o site a manda ao motor (`flip` em `renderInput`).

**Motor** (`renderFlip` em `render.ts`, com as medidas em `flip.ts`), como a Consequência (ADR 0035): a metade de cima é apagada e escrita na carta de pé, e a de baixo na carta girada 180°, cada uma com as medidas da orientação dela (`FLIP_2003`, `FLIP_2015`). O nome fica como está (a tradução não oficial o deixa em inglês; com um nome em PT diferente, a carta sai na original). Muda só o tipo e a caixa de cada metade:

- **A barra de tipo** é achada pelos dois fios (`flipBar`, com `typeBarEdges` e a altura da barra de cada moldura: na moldura branca, o fio do fim da caixa da de baixo, 10 px acima da barra, passava pelo de cima, Bushi Tenderfoot, CHK 2). Sem ela, a carta sai na original.
- **A caixa de P/R** é achada pelo fio escuro de dentro dela (`flipPtLine`), e tem de bater com o tipo: só a criatura tem a caixa (a metade virada das Ascendentes de Saviors é encantamento, e a barra vai até o fim). A sombra dela escurece a barra devagar, uns 10 px antes do fio: o apagamento do tipo para logo depois do inglês (`flipTypeEnd`), e não no fim da barra, senão a sombra saía cortada num degrau. Na de cima da moldura atual, o apagamento para antes do símbolo da coleção (`findSetSymbolLeft`).
- **O tipo** sai na Matrix Bold na moldura de 2003 e na Beleren na atual, na altura das letras em inglês medida na imagem (`textBandCenter`).
- **A caixa** é medida pelo papel (`paperBoxes`, como nas divididas) e apagada como a das cartas comuns, com a caixa de P/R, que sobe uns pixels acima da barra, protegida. O texto fica alinhado à esquerda, ou centralizado quando o inglês é (`measureCentered`: a Rune-Tail, SOK 27).

## Regressão

As 33 impressões, montadas com o código desta árvore e conferidas na folha de contato e no zoom: o tipo e o texto das duas metades em PT, a caixa de P/R e a sombra dela inteiras, o símbolo da coleção da moldura atual (Budoka Gardener, C18 134; Nezumi Graverobber, CM2 71) e as de borda branca (Nezumi Graverobber, PHUK 38; Bushi Tenderfoot, CHK 2). A regressão de sempre (ADR 0027) ganha o grupo "viradas (flip)". As outras cartas não passam pelo código novo: `typeBarEdges` ganhou a altura da barra como argumento, com a de sempre por padrão.

## Consequências

- 19 das 20 cartas viradas saem em PT (com a tradução não oficial), nas duas metades, nas 32 impressões delas.
- A tradução não oficial não usa mais o texto das impressas antes do Magic 2010 ("entrar em jogo", "jogar uma mágica") nem as linhas com "custo de mana convertido" ou "reserva de mana": 197 cartas ficaram com a terminologia de hoje.
- As fichas de Papel de Wilds of Eldraine e a de Unhinged continuam na original.
