# ADR 0034: Cartas divididas da moldura atual

- Status: aceito
- Data: 25/11/2026
- Complementa: ADR 0011 (medidas na imagem), ADR 0026 (texto transcrito da imagem) e ADR 0033 (Salas de Duskmourn)

## Contexto

Depois das Salas (ADR 0033), as cartas divididas de duas metades lado a lado são o grupo seguinte sem nenhuma arte reescrita: Guilds of Ravnica e Ravnica Allegiance (2018 e 2019), Murders at Karlov Manor (2024) e as reimpressões na moldura atual das de Invasion, Apocalypse, Ravnica e Time Spiral (Dominaria Remastered, Ravnica Remastered, Time Spiral Remastered, Ultimate Masters, Modern Horizons 2, Clue Edition, os decks de Commander). Entre elas estão Find // Finality, Expansion // Explosion, Response // Resurgence, Fire // Ice e Discovery // Dispersal. São 78 impressões de borda preta com texto em PT (oficial ou não oficial).

Girada 90° no sentido horário, como a Sala, cada metade é uma carta pequena da moldura M15: a barra do nome no alto (com o custo no fim), a arte, a barra de tipo (com o símbolo da coleção no fim) e a caixa de texto, com a marca-d'água da guilda nas de Ravnica. As duas metades têm o mesmo desenho, a da direita 480 px adiante. As medidas, tiradas das impressões (escala-base deitada, 1040 × 745): barra do nome de 52 a 105, barra de tipo de 405 a 437, caixa de 450 a 713; o lado de dentro da caixa muda uns 9 px entre coleções (de 93 a 102 na metade da esquerda). O custo acaba em x ≈ 505 e 981, com ~36,4 px por símbolo (o híbrido tem um círculo de 41 px). O símbolo da coleção mais largo começa em x ≈ 455 e 934; o tipo em inglês ("Instant", "Sorcery") acaba antes de 200 e de 680.

Ficam para depois, com outro desenho: a Consequência (Amonkhet: a segunda metade impressa de lado; ver ADR 0035), o Fundir (a faixa do Fundir no pé), as divididas de 1997 e 2003, as de Commander 2016 (as metades mais altas, com o copyright no pé) e as cartas de teste dos Mystery Boosters e do Unknown Event.

## Decisão

**Pipeline.** `split_supported`: `frame` 2015, layout `split`, borda preta, sem efeito, sem `full_art`, duas metades, nenhuma delas Sala e sem as palavras-chave Aftermath e Fuse; fora as coleções de `SPLIT_SETS_OFF` (C16, CMB1, CMB2, MB2, UNK).

**Motor** (`src/engine/split.ts` e `renderSplit` em `render.ts`). O caminho da carta deitada das Salas: o motor gira a imagem, apaga e escreve na carta deitada e a põe de pé.

- **Conferido na imagem** (`splitFrame`): as duas barras dos nomes, as duas barras de tipo e as duas caixas claras, e a borda preta entre as metades. Sem as pistas, a carta sai na original.
- **As barras dos nomes** saem linha a linha, como o nome da M15, até o custo de cada metade (`splitCostLeft`), com a ponta arredondada da esquerda protegida (`barCapGuard`).
- **As barras de tipo** saem linha a linha até antes do símbolo da coleção (x 445 e 925, a 10 px do símbolo mais largo), que fica como está: o tipo em PT ("Mágica Instantânea", "Feitiço") acaba bem antes.
- **As caixas** são medidas na imagem (`splitBoxes`: até onde vai o trecho claro que passa pelo meio da caixa, dentro de limites fixos) e saem pelo apagamento de sempre, com a marca-d'água junto, inteira, como na M15. O texto de cada metade é encaixado até o corpo 34, centrado na altura, e centralizado na linha quando o inglês é (`measureCentered`: Boom // Bust, TSR).
- **O português**: o nome de cada metade na Beleren, no corpo 35, até 10 px antes do custo; o tipo no corpo 26.

**Nomes das metades transcritos da imagem.** Em 18 cartas divididas impressas em PT o Scryfall tem, na impressão de onde vem o texto, o texto em PT e o nome de cada metade em inglês ("Rough" e "Tumble" com o texto "Confusão causa 2 pontos de dano"), ou o nome inteiro da carta em inglês em cada metade ("Crime // Punishment", OTP 39), e a carta saía com o nome em inglês. `data/traducao/transcritas.json` ganha entradas só com os nomes das metades (`face_names`), transcritos da imagem oficial (Confusão // Bagunça, Retumbar // Arrebentar, Morto // Enterrado, Dito // Feito, Caminho // Ruína, Saciar // Exagerar, Ordem // Caos, Assalto // Bateria e as dez de Dissension), e `transcribe_face_names` troca só a metade que está em inglês.

**Erros nos dados das divididas.** Conferindo as 78 impressões apareceram erros dos dados que deixavam o nome ou o texto de uma metade na outra:

- O Arena escreve as divididas com Consequência (Amonkhet Remastered, Hour of Devastation) e a Crime // Punishment de OTP com " /// " ("Dusk /// Dawn"). A carta não casava pelo nome e casava pela primeira metade: a segunda ficava com o nome e os dois textos da carta inteira (26 cartas; em 7 o nome na interface saía "Anoitecer // Anoitecer /// Alvorecer"). `arena_name` troca o separador pelo do Scryfall, e as metades passam a vir como nas outras divididas do Arena (a carta inteira e depois cada metade, ver ADR 0033).
- Uma dividida do Arena só casa pelo nome inteiro (`arena_entry`): a carta de teste Start // Fire casava com a Start // Finish e saía com o texto da Finish; agora fica sem PT.
- O Arena dá à metade da esquerda da Hustle // Bustle (MKM 249) o nome da carta inteira, que saía inteiro na barra dela: `half_names` deixa em cada metade a parte dela.
- No Assault // Battery de TSB o Scryfall põe a segunda metade inteira no texto da primeira, depois de uma linha "//": `printed_faces` corta o texto de cada metade nessa linha.
- Nas cinco divididas de Invasion em PT o Scryfall tem o nome de cada metade na outra ("Decrescer" no Wax, que dá +2/+2; "Bateria" no Assault, que a reimpressão de Time Spiral, com a imagem em PT, chama de "Assalto"): as reimpressões de DMR saíam com o nome de uma metade sobre o texto da outra, e `swap_half_names` destroca os nomes delas.

## Regressão

As 78 impressões, montadas com o código desta árvore e conferidas em folhas de contato e no zoom (nomes, tipos e caixas). A regressão de sempre (ADR 0027) ganha o grupo "dividida", que só entra com os dados novos no banco.

## Consequências

- As cartas divididas da moldura atual saem em PT nas 78 artes de borda preta com texto em PT; a marca-d'água da guilda sai junto com o texto, como na M15.
- O nome de 18 cartas divididas impressas em PT aparece em PT na interface (antes, em inglês).
- As 25 divididas com Consequência do Arena e a Crime // Punishment ficam com o texto certo em cada metade, e o nome certo na interface ("Anoitecer // Alvorecer", antes "Anoitecer // Anoitecer /// Alvorecer" em 7 delas).
- Pain // Suffering, Wax // Wane, Stand // Deliver e Spite // Malice ficam com o nome de cada metade no lugar ("Dor // Sofrimento").
- A Consequência (depois, ADR 0035), o Fundir e as divididas de 1997 e 2003 continuam na original, até terem as medidas delas.
