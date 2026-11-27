# ADR 0050: A face planeswalker das cartas de transformar

- Status: aceito
- Data: 27/11/2026
- Complementa: ADR 0007 (duas faces e planeswalker), ADR 0008 (a caixa do planeswalker com a rede neural) e ADR 0030 (as faixas do planeswalker)

## Contexto

Dezessete cartas de transformar têm uma face planeswalker, em 47 impressões de papel suportáveis (de borda preta, sem as de vitrine e sem as "inverted" da Comic-Con de 2015):

- **Planeswalker que vira planeswalker:** Arlinn Kord (SOI 243, a promo de pré-estreia, a de The List, From the Vault: Transform e Innistrad Remastered), Garruk Relentless (V17 e INR; a de Innistrad, na moldura de 2003, fica de fora como os outros planeswalkers de 2003, ADR 0049), Arlinn, the Pack's Hope (MID 211, a promo e a de The List) e Oko, Lorwyn Liege (ECL 61).
- **Criatura que vira planeswalker:** as cinco lendas de Magic Origins (ORI, as promos, The List, V17 e a Liliana de Commander Collection: Black), com o efeito `originpwdfc`; o Nicol Bolas, the Ravager (M19 218, a promo e a de juiz); e as cinco lendas de Modern Horizons 3.
- **Batalha que vira planeswalker:** Invasion of New Phyrexia (MOM 239 e a promo).

Até aqui a face planeswalker saía na original, em inglês, e, nas de Magic Origins e no Bolas, também a frente (o efeito `originpwdfc` estava na lista das molduras de fora).

A face planeswalker tem a caixa do planeswalker e as marcas das de duas faces:

- **O ícone.** O sol, a lua, o ícone de Magic Origins (no lugar do sol) ou o das de transformar atuais fica à esquerda do nome, como na carta comum; o verso sem custo de mana desde 2023 (MH3, MOM, ECL, INR) tem o ícone à direita do nome. A barra do nome do planeswalker fica 19 px acima da M15 (centro em y 63 contra 82): o ícone da direita fica de y ≈ 45 a 81.
- **O indicador de cor** no começo do tipo, nos versos.
- **A caixa da lealdade inicial.** O verso de um planeswalker que vira outro (Arlinn, Embraced by the Moon; Garruk, the Veil-Cursed; Oko, Shadowmoor Scion) não tem a caixa: a lealdade vem da frente, e a caixa de texto desce até o fio no canto, que sobe em curva de y ≈ 952 em x 600 a ≈ 932 em x 684. O Scryfall dá lealdade a esses versos (o "3" do Oko, Shadowmoor Scion), que a carta não imprime. O verso das outras (Arlinn, the Moon's Fury, de MID; os de Magic Origins, do Bolas, de MH3 e o Teferi Akosa of Zhalfir) tem a caixa.

## Decisão

**Pipeline.** `face_supported` aceita a face planeswalker das de transformar da moldura atual, de borda preta, só com os efeitos `sunmoondfc`, `originpwdfc` e `legendary`, sem `full_art` nem `textless`, sem a moldura desenhada à mão e sem as cartas de teste. O `originpwdfc` sai da lista das molduras de fora: o ícone de Magic Origins fica no lugar do sol, e a frente é uma criatura comum. O custo de lealdade que o Arena tira do texto em PT volta na frente de cada habilidade da face planeswalker (`pw_faces`, com o `pw_costs` de sempre); com as habilidades que não batem com o Oracle da face, só essa face sai como está (`PW_FACE_MISMATCH`, como as Sagas de duas faces). Ficam 47 impressões, 94 faces, 58 delas planeswalker, todas com texto oficial.

**Motor.** A face é planeswalker pelo tipo dela (`isPlaneswalker` com o lado, em `render.ts`). Em `renderPlaneswalker`, a face de uma carta de duas faces passa por `faceBars`, como na carta comum: o ícone à esquerda do nome, o ícone à direita no verso sem custo (`hasRightIcon` procura 19 px acima), o indicador de cor no tipo e o verso sem o símbolo da coleção desde Kamigawa: Neon Dynasty. O nome e o tipo ficam nas medidas de `m15Layout` da esquerda para a direita (para o planeswalker de uma face, as mesmas de antes), na altura do planeswalker.

**A caixa da lealdade.** Ela é achada na imagem, nunca pelos dados (`hasLoyaltyBox`): logo abaixo do topo do escudo (y 925 a 940, x 620 a 730) o miolo dele é preto, com 71% a 92% dos pixels escuros (abaixo de 60) nas 50 faces com a caixa; sem ela, é o papel da caixa e o fio, de 34% a 43%. O limiar é 60%. Só a face de uma carta de duas faces é medida; o planeswalker de uma face tem sempre a caixa. Sem ela:

- o canto não é protegido nem reservado no texto: protegido, o fim da última linha em inglês ficava ao lado do português (o "ard." de "graveyard." no Garruk, the Veil-Cursed, INR 197; o "ayer." de "player." na Arlinn, Embraced by the Moon, SOI 243), e o texto em PT vai até o canto;
- a curva do fio do pé sai da máscara das letras (`clipBoxFoot`): ela sobe para dentro da última faixa e é escura como as letras, e a rede neural a repintava num borrão escuro subindo pela curva (Arlinn, Embraced by the Moon, INR 230). O fio é achado coluna a coluna (de y 900 a 965) e linha a linha (de x 600 a 700), na queda de 35 tons em 3 px depois da qual nada volta a ficar claro, e sai da máscara do fio para fora, com 2 px de folga, e a folga que a máscara ganhou em volta dele (`textMask` dilata e fecha) também, a até 8 px, salvo a borda das letras (o que fica a até 3 px de um pedaço da máscara mais longe). O fio continua à vista da rede neural, como os lados da caixa.

Duas tentativas ficaram pelo caminho: esconder o fio da rede neural, como a caixa da lealdade, deixava a beira do buraco logo acima num risco escuro e uma mancha rosada onde a proteção começava; e cortar só do fio para baixo deixava a folga no buraco, e o borrão também.

## Regressão

Contra o PR #17 (ADR 0049), nas 1.098 faces da amostra (1.090 impressões, com o grupo novo das de transformar com face planeswalker): nenhuma mudou, nem os planeswalkers de uma face. Os dados do ar ainda dão a face planeswalker das de transformar como não suportada, e ela sai na original nos dois lados; com os dados novos, as 58 faces planeswalker e as 24 frentes criatura que passam a sair em PT (as de Magic Origins e as do Bolas) foram conferidas uma a uma, com o nome, o tipo e a caixa de texto, e os 8 versos sem a caixa da lealdade, sem inglês no canto e com o fio do pé inteiro.

## Consequências

- As faces planeswalker das cartas de transformar saem em PT, com o nome depois do ícone e o tipo depois do indicador de cor; e a frente das de Magic Origins e do Nicol Bolas, the Ravager, também.
- O verso de um planeswalker que vira outro sai sem a caixa da lealdade, como na carta, com o texto até o canto.
- Ficam de fora o Garruk Relentless de Innistrad (moldura de 2003), as de vitrine, as sem borda e as "inverted" da Comic-Con de 2015, e as modais com face planeswalker (Valki e Tibalt, Mila e Lukka, Rowan e Will, de Kaldheim e Strixhaven), que têm a faixa das modais na caixa do planeswalker.
- As impressões só digitais (Shadows over Innistrad Remastered, Shadows of the Past, Pioneer Masters, as promos do MTGO) não estão nos dados.
