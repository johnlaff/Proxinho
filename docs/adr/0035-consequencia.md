# ADR 0035: Consequência

- Status: aceito
- Data: 25/11/2026
- Complementa: ADR 0011 (medidas na imagem), ADR 0033 (Salas de Duskmourn) e ADR 0034 (cartas divididas da moldura atual)

## Contexto

As cartas divididas com Consequência (Aftermath) de Amonkhet e Hour of Devastation (2017), e as reimpressões delas nos decks de Commander, em The List, em Modern Horizons 2 e em Battle for Baldur's Gate, são o grupo de divididas seguinte sem nenhuma arte reescrita: Dusk // Dawn, Commit // Memory, Driven // Despair, Cut // Ribbons, Never // Return. São 69 impressões de borda preta com texto em PT; as 25 de Amonkhet Remastered e a promo do MTGO são só digitais e ficam fora do banco, como todas as digitais.

A carta não é deitada como as outras divididas. A metade de cima é uma carta da moldura M15 mais baixa, de pé: a barra do nome no lugar de sempre, a arte, a barra de tipo com o símbolo da coleção e a caixa de texto. A metade de baixo, a da Consequência, é impressa de lado: girada a carta 90° no sentido anti-horário, ela fica de pé, com a barra do nome no alto, a arte, a barra de tipo (sem o símbolo da coleção; no fim dela fica o selo holográfico das raras) e a caixa de texto.

As medidas, tiradas das impressões (a de cima na escala-base de pé, 745 × 1040; a de baixo na da carta girada, 1040 × 745):

| Medida | Metade de cima (de pé) | Metade de baixo (carta girada) |
|---|---|---|
| Barra do nome (papel) | y 52 a 105 (49 a 103 em algumas reimpressões) | y 57 a 110, x 576 a 955; o custo acaba em x ≈ 947, ~37,4 px por símbolo (o híbrido, 44) |
| Barra de tipo (papel) | y 358 a 410, com o símbolo da coleção no fim | y 345 a 397; acaba em x ≈ 940, antes do selo holográfico |
| Caixa (papel) | x 55 a 689, y 422 a 557 | x 585 a 952, y 408 a 690 |

O tipo em inglês ("Sorcery", "Instant") ocupa pouco das barras; o texto da metade de baixo é o mais longo da carta, com o lembrete da Consequência.

## Decisão

**Pipeline.** `aftermath_supported`: `frame` 2015, layout `split`, borda preta, sem efeito, sem `full_art`, sem moldura desenhada, duas metades e a palavra-chave Aftermath. `split_supported` continua deixando a Consequência de fora.

**Motor** (`src/engine/aftermath.ts` e `renderAftermath` em `render.ts`). `renderCard` tenta, nas divididas que não são Salas, a moldura da carta deitada (`renderSplit`) e depois a da Consequência.

- **Conferido na imagem** (`aftermathFrame`): as duas barras claras de cada metade, a de cima na carta de pé e a de baixo na carta girada (`barSpan`: o trecho claro mais comprido, pela mediana de cada linha num pedaço da barra sem letras, com 40 px ou mais), e as duas caixas claras. Sem as pistas, a carta sai na original. As barras medidas, e não as fixas, dão a altura do apagamento e do português: as reimpressões mudam a barra uns 3 px.
- **A metade de cima** é apagada e escrita na carta de pé, como a M15: o nome linha a linha até o custo (`costLeft`, o mesmo das cartas comuns), o tipo até o símbolo da coleção (`findSetSymbolLeft`, entre x 560 e 660), com a ponta arredondada das barras protegida (`barCapGuard`), e a caixa medida na imagem (`aftermathBox`) pelo apagamento de sempre.
- **A metade de baixo** é apagada e escrita na carta girada, feita da de pé já apagada: o nome até o custo dela (`aftermathCostLeft`, contado do fim da barra), o tipo até antes do selo (x 930) e a caixa medida na imagem. A carta volta de pé no canvas de saída, e o português da metade de baixo é escrito com o canvas girado.
- **As caixas** das duas metades são medidas como as das divididas deitadas (`paperBoxes`, de `split.ts`: até onde vai o trecho claro que passa pelo meio da caixa, dentro de limites fixos e nunca menor que o miolo). O texto de cada metade é encaixado até o corpo 34, centrado na altura, e centralizado na linha quando o inglês é (`measureCentered`: "Scry 3." no Reason // Believe).
- **O português**: o nome na Beleren, no corpo 35; o tipo no corpo 30.

## Regressão

As 69 impressões, montadas com o código desta árvore e conferidas em folhas de contato (as duas metades de pé, lado a lado) e no zoom (nomes, tipos, caixas, o custo e o selo da metade de baixo). A regressão de sempre (ADR 0027) ganha o grupo "consequência", com 15 impressões.

## Consequências

- As cartas com Consequência saem em PT nas 69 artes de borda preta, também nas promos de pré-estreia (com a data na arte) e nas reimpressões de Commander e de The List.
- O motor ganha um terceiro caminho de carta dividida: as duas metades em orientações diferentes na mesma carta.
- O Fundir e as divididas de 1997 e 2003 continuam na original, até terem as medidas delas.
