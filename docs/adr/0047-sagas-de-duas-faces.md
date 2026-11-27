# ADR 0047: As Sagas de duas faces

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0016 (Saga), ADR 0042 (Invocações de Final Fantasy) e ADR 0007 (duas faces)

## Contexto

O pipeline aceitava as Sagas de uma face (ADR 0016) e as Invocações de Final Fantasy de uma face (ADR 0042), e as cartas de transformar só na moldura da carta comum: uma face que é Saga ficava de fora, e a carta inteira saía na original, em inglês. São 126 impressões de papel com uma face Saga, 70 delas de borda preta, na moldura das Sagas:

- Kamigawa: Neon Dynasty (2022): a frente é a Saga, o verso a criatura encantamento (a Fable of the Mirror-Breaker, a The Restoration of Eiganjo). Na frente, o P/R do verso fica no pé da coluna, à esquerda, logo abaixo da ponta da tira dos marcadores, e o último capítulo acaba acima dele. O ícone das de duas faces é o leque (`fandfc`).
- Avatar: The Last Airbender (2025): a mesma moldura, com a frente Saga (The Legend of Yangchen).
- March of the Machine (2023): o verso Saga dos cinco pretores (Elesh Norn // The Argent Etchings); a Huatli, Poet of Unity de LCI: o verso Saga.
- Final Fantasy (2025): o verso Saga é uma Invocação (Jill, Shiva's Dominant // Shiva, Warden of Ice), com a moldura do ADR 0042.

As versões de vitrine, de arte estendida e sem borda dessas coleções têm outra moldura e ficam de fora, como nas de uma face.

## Decisão

**Pipeline.** `face_supported` aceita a face que é Saga como as Sagas de uma face: moldura atual, borda preta, layout `transform`, os efeitos das Sagas (coroa de lendária e brilho de encantamento) mais o leque das de duas faces, sem arte inteira, sem `textless` e sem moldura desenhada. A face Saga de uma carta cujos capítulos não batem com o Oracle (`SAGA_MISMATCH`) sai, e com ela a carta, se for a frente. `saga_chapters` passa a levar as opções "•" de um capítulo junto com ele (Life of Toshiro Umezawa: o Arena repete o capítulo inteiro, com as opções, uma vez por número do grupo). As promos de pré-estreia de NEO (`DFC_SAGA_SETS_OFF`) ficam de fora, as duas faces: a digitalização foil lavou a imagem, o degrau dos fios entre os capítulos tem 1 tom e o motor não os acha, e no verso da The Restoration of Eiganjo (PNEO 34s) as letras brancas da barra clara ficavam por baixo do português.

**Motor.** `renderCard` manda a face Saga de uma carta de transformar para `renderSaga`, e a Invocação para `renderSummon`, com o lado. O que muda de uma face para a outra sai de `faceBars`, o mesmo das outras faces: o custo da face, o ícone das de duas faces (à esquerda na frente, à direita no verso sem custo), o indicador de cor e o verso sem símbolo da coleção (desde NEO, `SYMBOLLESS_BACKS_SINCE`). `faceCapGuard` só protege a ponta da barra onde o apagamento chega a ela.

- **O P/R do verso na frente** (`sagaBackPt`): os algarismos no pé da coluna, procurados entre x 64 e 98, onde o texto dos capítulos não chega e a tira dos marcadores já acabou em ponta, com 14 a 30 px de altura. Sem eles, a carta sai na original. O texto vai até 4 px acima deles; o apagamento vai até o pé da coluna, com os algarismos protegidos e opacos: a última linha em inglês desce ao lado deles (o pé do "y" de "your" ficava embaixo do português na PTLA 27s). O P/R é igual em PT e fica.
- **Os números dos marcadores** (`sagaNumerals`): procurados só até o fim da coluna, acima do P/R do verso. Ao lado dele, a ponta da tira em seta tem o contorno preto entre a moldura clara (o foil das promos, o dourado das multicoloridas, o brilho da tira de Avatar) e o papel, como um número no meio do marcador dourado: o último capítulo ficava com dois números, os fios não mudavam de lugar e o texto saía pequeno, centrado nas faixas do inglês, em 8 das 34 frentes medidas (The War of the Kami, NEO 227; a The Legend of Roku, a Kyoshi e a Kuruk de TLA e as promos de pré-estreia delas e da Yangchen, PTLA 27s).
- **Os fios entre os capítulos** (`sagaDividers`): a linha de base de uma linha comprida, cheia de serifas, clareava 85% da largura e tinha a mediana abaixo da de cima, como a sombra de um fio (The Legend of Yangchen, TLA 27: um fio a mais e a carta saía na original). Nas duas linhas antes do degrau, a sombra do fio quase não tem pixel 70 tons abaixo do papel (até 5% nas 24 Sagas medidas; 22% na linha mais escura da retícula da promo de pré-estreia da The Great Synthesis, PMOM 65s, e 2% na outra), e a linha de base tem 60% ou mais nas duas. Com a média das duas acima de 30%, não é fio.
- **O lado da arte** (`sagaArtLeft`): a coluna mais escura entre x 360 e 384 caía na arte quase preta logo depois do fio (a variante da The Dragon-Kami Reborn, NEO 181†, 12 px adiante), e o apagamento da coluna levava o fio e o começo da arte. O fio começa na primeira coluna escura e tem até 6 px: a mais escura é procurada só ali. Nas 30 Sagas medidas, de uma face e de duas, nada mais muda.
- **A barra de tipo do verso das Invocações**: o tom das colunas da barra (`pageShade`) sai antes de achar o símbolo e volta depois só quando há símbolo; nos versos sem ele, a barra escura com as letras clareava o lugar das letras e o inglês ficava embaixo do português. E no verso sem símbolo, quando o que a busca acha perto do fim da barra é um pedaço do contorno (a camada de dentro, separada das letras por uma lacuna larga, volta a ser "símbolo"), a barra vai até ele, também sem símbolo (`none`): com o limite de onde o símbolo pode começar (x 660), a última letra de um tipo que acaba rente ao contorno ficava ao lado do português (o "n" de "Dragon" na Bahamut, Warden of Light, PFIN 16s; o "l" de "Elemental" na Summon: Esper Maduin, FIN 185). Vale para todo verso sem símbolo, das Sagas e das outras.

## Regressão

As 69 impressões de borda preta com texto em PT (NEO, PNEO, TLA, PTLA, MOM, PMOM, LCI, FIN e PFIN; a carta de teste de UNK não tem texto em PT), as duas faces de cada, montadas com o código desta árvore e conferidas na folha de contato e no zoom: o P/R do verso na frente, o leque das de NEO, o ícone e o indicador no verso dos pretores, os fios no lugar novo. As de pré-estreia de NEO, as duas faces, e o verso das duas impressões da Jill, Shiva's Dominant (o Arena traz parágrafos diferentes para os capítulos agrupados) saem na original. A regressão de sempre (ADR 0027), que confere as Sagas e as Invocações de uma face (as regras novas dos fios, dos números e do lado da arte) e os versos das de duas faces (o contorno no fim da barra), rodou com os Casos (ADR 0046) contra a main: 1033 faces, nenhuma mudou. Nela as molduras novas ainda não aparecem, porque os dados são os do site no ar; elas são as conferidas acima.

## Consequências

- A frente Saga de NEO e de TLA e o verso Saga de MOM, LCI e FIN saem em PT, com o resto da carta de transformar.
- As Sagas de duas faces de vitrine, de arte estendida e sem borda continuam de fora, como as de uma face.
