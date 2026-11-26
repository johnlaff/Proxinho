# ADR 0033: Salas de Duskmourn (cartas divididas deitadas)

- Status: aceito
- Data: 25/11/2026
- Complementa: ADR 0011 (medidas na imagem), ADR 0012 (rede neural nas letras brancas sobre a arte) e ADR 0021 (dicas do Arena)

## Contexto

As cartas divididas eram o maior grupo de cartas jogadas sem nenhuma arte reescrita depois das molduras antigas (116 cartas de Commander sem nenhuma arte reescrita, na contagem de 25/11/2026 sobre o Scryfall). Entre elas, as Salas (Cômodos) de Duskmourn: House of Horror (setembro de 2024) e do Commander dele são as mais jogadas, e todas têm texto oficial em PT no Arena. São 28 cartas e 61 impressões em inglês no papel; 51 de borda preta (DSK, DSC, as promos de pré-estreia e de pacote de PDSK e duas de The List) e 10 sem borda (Booster Fun).

A Sala é impressa deitada, como as divididas de Invasion e Ravnica, mas com outro desenho. Girada 90° no sentido horário (1040 × 745 na escala-base), cada metade tem a barra do nome no alto (papel claro, letra escura, o custo de mana no fim) e uma caixa de papel embaixo. No meio, de uma ponta à outra, vêm a linha de tipo das duas ("Enchantment — Room"), numa barra translúcida com a arte por trás, letra branca e o símbolo da coleção no fim, e uma faixa translúcida com o lembrete das Salas em itálico branco, em duas linhas centradas: "(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)".

O Arena traz a carta inteira ("Armário // Porão Esquecido", com os dois textos) e as duas metades como faces (`faces[0]`, `faces[1]` e `faces[2]`). O lembrete das Salas não está no texto de nenhuma delas e nunca saiu impresso em PT; o Arena o mostra como dica da palavra-chave (`AbilityHanger/Keyword/Room_Body`), com o mesmo texto em inglês do Oracle.

O Proxyshop (a referência das ferramentas de proxy, ADR 0011) não tem modelo para as Salas; o MTG.design e o Card Conjurer também não. O desenho segue as medidas tiradas das próprias impressões.

## Decisão

**Pipeline.** `room_supported`: `frame` 2015, layout `split`, borda preta, sem efeito, sem `full_art`, com as duas metades do tipo "Room". O lembrete das Salas em PT vem da dica do Arena quando o inglês dela é o lembrete do Oracle palavra por palavra (`room_reminder`), e vai em cada face (`reminder_pt`, também nas de tradução não oficial, `add_room_reminders`). A linha do lembrete sai do texto do Oracle de cada metade antes de casar as linhas com o texto em PT (`without_room_reminder`): com ela, as linhas nunca batiam e o lembrete de palavra-chave da caixa não entrava (o atordoamento do Meat Locker).

Da mesma conferência saíram dois erros nas cartas divididas em geral: a carta inteira que o Arena traz antes das metades casava, pela posição, com o texto em inglês da primeira metade, e a primeira metade com o da segunda (`en_face_of` casa a carta inteira com a carta e cada metade com a dela); e o nome em PT juntava as três faces, "Armário // Porão Esquecido // Armário // Porão Esquecido" (`arena_name_pt`; nas reimpressões de RVR o Scryfall põe o nome inteiro em cada metade, e `printed_faces` fica com a parte de cada uma). Eram 49 cartas com o nome repetido na interface.

**Interface.** `renderInput` manda ao motor as duas metades (`splitHalves`: sem a carta inteira do Arena) como `face` e `split`.

**Motor** (`src/engine/room.ts` e `renderRoom` em `render.ts`). O motor gira a imagem para a carta deitada e trabalha nela; no fim, escreve o português na carta deitada e a põe de pé de novo (o canvas de saída com a rotação inversa).

- **Conferido na imagem** (`roomFrame`): as duas barras dos nomes claras, a barra do tipo e a faixa do lembrete escuras (a mais clara das 51 fica em 91 tons) e as duas caixas de papel, com o relevo mais escuro no lado direito de cada uma (na moldura branca, o fio em volta da caixa tem a cor do papel e é o relevo que separa). Sem as pistas, a carta sai na original.
- **As barras dos nomes** saem linha a linha, como o nome da M15, até o custo de cada metade (`roomCostLeft`: ~35,3 px por símbolo a partir do fim, em x 508 e 984), com a ponta arredondada da esquerda protegida (`barCapGuard`).
- **A linha de tipo e a faixa do lembrete** são translúcidas: só as letras brancas saem (`whiteTextMask`) e a rede neural refaz a arte por baixo, em dois quadros, um de cada metade (num quadro só, a faixa de 900 px seria reduzida aos 512 do modelo), com o símbolo da coleção escondido dela. Sem a rede neural, a carta sai na original (`reason: "neural"`).
- **As caixas** saem pelo apagamento de sempre e o texto de cada metade é encaixado até o corpo 30, centrado na altura.
- **O português**: o nome de cada metade na Beleren, no corpo 35, até 10 px antes do custo; "Encantamento — Cômodo" em letra branca, no corpo 25; o lembrete em itálico branco, centrado, do corpo 24 para baixo até caber em duas linhas.

## Regressão

As 51 impressões de borda preta, montadas com o código desta árvore e conferidas em folhas de contato e no zoom lado a lado com a original. Da conferência saiu a medida do custo da metade da direita (com o fim em 992, o primeiro símbolo era cortado). A regressão de sempre (ADR 0027) ganha o grupo "sala", que só entra com os dados novos no banco.

## Consequências

- As 28 Salas saem em PT nas 51 artes de borda preta; as 10 sem borda continuam na original.
- As outras cartas divididas (as de Invasion e Ravnica, Consequência, Fundir) continuam na original: `renderRoom` só cuida das Salas, e uma carta dividida que não é Sala nunca passa pelo caminho da M15.
- O caminho da carta deitada (girar, apagar, escrever e pôr de pé) serve às outras divididas, com as medidas de cada desenho.
