# ADR 0049: As cartas de transformar da moldura de 2003

- Status: aceito
- Data: 27/11/2026
- Complementa: ADR 0007 (duas faces), ADR 0011 (medidas na imagem) e ADR 0024 (moldura de 2003)

## Contexto

Innistrad (2011) e Dark Ascension (2012) trouxeram as primeiras cartas de transformar, ainda na moldura de 2003. São 39 impressões de papel: 20 de ISD, 13 de DKA, 4 promos de pré-estreia e de lançamento (PISD 64★ e 193★, PDKA 71★ e 98★) e 2 de The List (a Elbrus, the Binding Blade, PLST DKA-147, e o Garruk Relentless). Todas são de borda preta, com o efeito `sunmoondfc` no Scryfall; o Garruk, planeswalker, fica de fora como os outros planeswalkers de 2003. O resto das cartas de transformar (de Shadows over Innistrad em diante) já saía em PT na moldura atual; estas saíam na original, em inglês.

A moldura é a da carta comum de 2003, com três diferenças:

- **O ícone.** O sol (na frente) ou a lua (no verso) fica à esquerda do nome, de x ≈ 35 a 108, e a ponta da barra do nome segue a curva dele, com uma sombra até x ≈ 121; a primeira letra começa em ≈ 125. O verso das cartas sem custo tem a bolinha do indicador de cor na barra de tipo (x ≈ 70 a 97), e o tipo começa em ≈ 109.
- **O P/R do verso na frente.** Numa ponta de papel que avança para a moldura acima da caixa de P/R (de y ≈ 889 a 922, até x ≈ 680), os algarismos do P/R do verso vão em cinza, na Matrix Bold, de y 895 a 916, acabando em x 677 (o "13/13" começa em 611, o "3/2" em 633). A ponta existe também na frente sem P/R (Elbrus).
- **O verso noturno.** As barras do verso são escuras, com as letras brancas; o motor já mede a cor das letras (`textPolarity`).

Os algarismos são os mesmos em PT, e a Matrix Bold do site tem os algarismos antigos (o "3" descendo abaixo da linha, o "1" como um "I"): escritos de novo, saíam diferentes dos da carta.

Ao conferir o canto da caixa de P/R nas criaturas de 2003, apareceu um defeito que já existia em todas elas: a caixa de P/R de 2003 tem um chanfro com sombra do lado esquerdo, que desce na diagonal de x ≈ 559, cinco linhas acima do topo dela, a ≈ 550, até o fio de baixo da caixa de texto. A proteção da M15 começa em x 564 e o apagamento levava a sombra e a ponta do fio de cima da caixa, e o canto saía cortado num degrau claro (Champion of the Parish, ISD 6; na amostra de 68 criaturas, uma de cada coleção de Eighth Edition a Conspiracy, em todas).

## Decisão

**Pipeline.** `face_supported` aceita as faces da moldura de 2003 com layout `transform`, borda preta, sem outro efeito além do `sunmoondfc`, sem `full_art` nem `textless`, com as marcas-d'água aceitas na moldura de 2003 e sem os tipos de fora (planeswalker). Ficam 37 impressões, 74 faces, todas com texto oficial.

**Motor** (`src/engine/dfc2003.ts`; o desenho é o da carta comum, em `renderCard`).

- **O nome e o tipo** saem pelo caminho das de duas faces, com as medidas de 2003 (`DFC_2003` em `geometry.ts`): o nome apagado a partir de x 122 e escrito a partir de 124, o tipo com o indicador apagado a partir de 100 e escrito a partir de 108; sem o indicador, o começo do tipo de 2003 (`frame2003Start`).
- **O P/R do verso fica como está** (`backPtDigits2003`): os algarismos são achados pelas colunas com tinta (70 tons abaixo do papel da ponta), do fim para o começo, até o primeiro vão maior que o dos algarismos (9 px), e protegidos e opacos com 2 px de folga. Sem algarismos no lugar (o fim antes de x 660 ou menos de 18 px de largura), a carta sai na original. O texto em PT desvia deles da ponta ao pé, a 12 px (`backPtNotch2003`): com 6, a última linha encostava no "4/4" do Huntmaster of the Fells (DKA 140). O apagamento e a escrita do P/R do verso das cartas atuais (`eraseBackPtNotch`, `drawBackPt`) não rodam.
- **O símbolo da coleção.** Nas 73 outras faces a medida (`findSetSymbolLeft`) dá de x 629 a 642. Na promo de pré-estreia do Mondronen Shaman (PDKA 98★), de foil, o "Shaman" acaba a 3 px do símbolo e as letras têm franjas coloridas: a cor começava no meio da palavra, a medida dava 565 e o "man" ficava ao lado do português. Nas de transformar de 2003, uma medida antes de 620 vale 634 (`dfcSymbolLeft2003`; o apagamento vai até 6 px antes dele, e o pé do "n" acaba em 626).
- **O canto da caixa de P/R, em toda criatura de 2003** (`ptProtect2003`): a proteção segue o chanfro, a partir do topo medido da caixa (`ptBoxTop`), em degraus de x 555, 551 e 547, até o fio de baixo da caixa de texto, medido logo à esquerda (`boxBorderAt`: a primeira linha 60 tons abaixo do papel); do fio para baixo, a de antes, a partir de 564.
- **O pé da caixa de 2003, em toda carta** (`BOX_FOOT_2003`, `attachedBelow` na caixa de `m15Layout`): o fio de baixo da caixa fica em y 935 a 937, mas em algumas coleções (Shards of Alara, Dragon's Maze) ele fica em 942 do meio da caixa para a esquerda e sobe para 936 perto da caixa de P/R. A caixa, medida no terço da esquerda, ia até 939, e o alto do fio era pintado de papel, um risco claro ao lado do chanfro (Tidehollow Sculler, ALA 202). Abaixo de 936 só sai o que se liga às letras (`keepAttachedBelow`), também na caixa com marca-d'água, que vai à rede neural.

## Regressão

As 74 faces (37 impressões) montadas com o código desta árvore e os dados novos e conferidas na folha de contato, carta a carta, ao lado da original: o nome e o tipo no lugar do inglês, as letras brancas do verso, o indicador de cor, o P/R do verso idêntico ao da carta, o texto desviando dele, as promos de pré-estreia e a de The List. O canto da caixa de P/R conferido no zoom em 68 criaturas comuns de 2003, uma de cada coleção de Eighth Edition a Conspiracy, contra o código publicado: o degrau claro sumiu em 67; na Blood Baron of Vizkopa (DGM 57), com a marca-d'água dos Orzhov, o raio de baixo do sol encosta no fio e o liga às letras, e sobra uma linha clara de 1 px junto do chanfro, no lugar do degrau de 9 px de antes.

A regressão de sempre (ADR 0027) contra a main, com o grupo novo e as cartas citadas aqui na amostra: 1.094 faces de 1.074 impressões, 63 mudaram, nenhuma com outro resultado. As de transformar de 2003 saem na original dos dois lados, porque os dados do site no ar ainda não as marcam (foram conferidas acima, na folha de contato). Das 63, 55 são criaturas de 2003, todas conferidas no zoom: o degrau claro no canto da caixa de P/R sumiu, e em algumas (Tidehollow Sculler, ALA 202; Scarecrone, EVE 172; Darksteel Juggernaut, SOM 150) também o risco claro no alto do fio de baixo. Na Blood Baron of Vizkopa (DGM 57) sobra a linha clara de 1 px descrita acima. Na Abyssal Specter da Eighth Edition em foil (8ED 117★) o fio de baixo fica em y 930, acima de onde a busca dele começa (936), e as quatro linhas de cima dele saem da cor do papel ao longo da caixa, como no código publicado; o canto agora segue o chanfro, sem o degrau. As outras 8 (6 criaturas com Subir de Nível, Greatsword, M12 209, e Coordinated Barrage, MOR 7) mudam só no grão do preenchimento, até 50 pixels a até 35 tons, nada que se veja. Nas que mudam milhares de pixels (Protean Hydra, M10 200) a diferença é o grão do papel refeito sob as letras, espalhado e sem nada visível.

## Consequências

- As cartas de transformar de Innistrad e Dark Ascension, das promos e de The List saem em PT, as duas faces.
- Em toda criatura da moldura de 2003, o canto da caixa de P/R deixa de sair cortado num degrau claro.
- O Garruk Relentless (ISD 181 e PLST ISD-181) continua de fora, como os outros planeswalkers de 2003.
- O verso cujo texto vem de outra impressão sai sem o flavor quando o flavor em inglês é outro (a Insectile Aberration, ISD 51, tem o texto da impressão de MID): é a regra do flavor de sempre, a mesma das cartas atuais.
