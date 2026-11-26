# ADR 0038: Divididas da moldura antiga

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0031 (moldura antiga), ADR 0034 (cartas divididas da moldura atual) e ADR 0037 (divididas de 2003)

## Contexto

Depois das divididas de 2003 (ADR 0037), as da moldura antiga eram as últimas cartas divididas de borda preta sem nenhuma arte reescrita: as cinco de Invasion (Stand // Deliver, Spite // Malice, Pain // Suffering, Assault // Battery, Wax // Wane), as cinco de Apocalypse (Fire // Ice, Illusion // Reality, Life // Death, Night // Day, Order // Chaos) e as reimpressões na mesma moldura: duas de The List (Illusion // Reality e Night // Day, a imagem de Apocalypse) e a Assault // Battery de Time Spiral (TSB). São 13 impressões, de 10 cartas, todas com texto em PT (2 com o texto impresso em PT, 1 com o do Arena e 7 com a tradução não oficial). As douradas do Campeonato Mundial (WC01, WC02) ficam de fora pela borda.

Girada 90° no sentido horário, cada metade é uma carta pequena da moldura antiga, a da direita 499 px adiante. Não há barras: o nome e o tipo são letras brancas com sombra direto sobre a moldura texturizada, como na carta de pé (ADR 0031), e do mesmo tamanho dela. As medidas, tiradas das 13 impressões (escala-base deitada, 1040 × 745):

- o nome começa em x ≈ 73 (572 na metade da direita), na linha de base 75 (de 74 a 77), na Goudy Medieval de ≈ 42,5 px; o pé do "p", do "y" e do "g" desce até ≈ 93, sobre os dois fios escuros do alto da arte (em ≈ 85 e ≈ 94) e o bisel entre eles;
- o custo: círculos de ≈ 35 px, um a cada 38, o último acabando em x ≈ 486 (985);
- o tipo começa em x ≈ 72 (571), na linha de base 391 (de 388 a 394), numa serifada de ≈ 32,5 px, entre o fio de baixo da arte (≈ 358) e o contorno da caixa (≈ 402); o símbolo da coleção vai de x ≈ 434 a 466;
- a caixa muda com a cor: nas azuis e nas vermelhas, um bisel de 9 px dentro de um fio escuro (o papel de x ≈ 80 a 459 e de y ≈ 411 a 625); na branca, só o fio (de 74 a 465 e de 408 a 633); nas pretas e nas verdes, um pergaminho de beira irregular direto sobre a moldura (de ≈ 71 a 466 e de 404 a 635). O texto em inglês vai de x ≈ 89 a 449 e de y ≈ 429 a 611; o alinhado à esquerda começa de 88 a 91 (82 a 86 na de Time Spiral).

## Decisão

**Pipeline.** `split_frame_ok` passa a aceitar a moldura `1997` com as mesmas condições das cartas de pé dela: nenhuma marca-d'água em nenhuma metade e nada de `SETS_1997_OFF`; o resto (borda preta, sem efeito, duas metades) é o das outras divididas.

**Motor** (`split.ts` e `renderSplitOld`). As medidas não cabem no `SplitGeometry` das divididas de barras e o caminho é outro, o da carta de pé da moldura antiga, metade por metade: `SPLIT_1997` (`OldSplitGeometry`) tem as medidas, `oldSplitFrame` confere a borda preta entre as metades e o papel das duas caixas, e o motor confere ainda as letras do nome e do tipo de cada metade onde a moldura as põe (sem elas, a carta sai na original).

- **O nome e o tipo** saem pela rede neural, um quadro por metade (o nome, a arte e o tipo, perto da resolução da imagem), com o custo e o símbolo da coleção escondidos dela. As letras são as de `oldLetters`, com as folgas na escala da carta de pé (a largura da imagem deitada é a altura da carta: `unit` vem da altura). O símbolo não é procurado: o tipo vai até x 420, 12 px antes do símbolo.
- **O pé das letras do nome** sai antes, linha a linha, pelos pixels da mesma linha ao lado, espelhados (`fillAcross`): a rede neural deixava um borrão claro no fio fino do alto da arte onde o "y" o cruzava (Day, APC 131; o "p" do Spite, INV 293; o "y" do Battery, TSB 106). O preenchimento das barras (`inpaint` com "rows") também não servia: ele mistura as linhas vizinhas, e o fio de 1 ou 2 px sumia com elas.
- **A caixa** tem o papel medido na imagem (`oldSplitBoxes`): de cada lado, até a primeira coluna (ou linha) que foge da cor do papel do miolo (a mediana da distância de cor na faixa do meio passa de 1,6 vez a de uma coluna de papel, mais 6, e de 12). Assim a medida para no bisel das azuis e das vermelhas, no fio da branca e na moldura das pretas e das verdes; `insideBoxSides`, das cartas de pé, não achava o bisel (o degrau do papel para o bisel claro é fraco) nem a beira do pergaminho, fora da busca. O apagamento fica 4 px para dentro do papel medido (a beira do pergaminho é irregular) e é o de sempre; o português vai 9 px para dentro, no máximo até onde ia o inglês.
- **O alinhamento** é medido em cada metade, sem seguir a outra: no Wax // Wane o texto da esquerda é alinhado à esquerda e o da direita, centralizado. O texto alinhado à esquerda começa sempre até x 94 (`box.left`); o que começa depois é centralizado, mesmo com duas linhas da mesma largura ("Destroy target / enchantment.") ou numa linha só ("Destroy target land.", Suffering). `textCentered` e `measureCentered` ganham o parâmetro `margin` para isso; sem ele, nada muda nas outras molduras.
- **O português**: o nome na Goudy Medieval e o tipo na serifada do texto, brancos com a sombra de 2 px, a partir da primeira letra do inglês e na linha de base medida nele (se estiver a até 5 px da da moldura); o texto centrado na altura da caixa, sem o fio do flavor, como na carta de pé.

Sem a rede neural, a carta sai na original (`reason: "neural"`), como a de pé; no rascunho da prévia, o preenchimento simples.

## Regressão

As 13 impressões, montadas com o código desta árvore e conferidas em folhas de contato e no zoom: os nomes (o pé das letras sobre o fio da arte), os tipos, as caixas (o bisel, o fio e a beira do pergaminho inteiros) e o alinhamento de cada metade. As outras molduras não passam por este caminho; a regressão de sempre (ADR 0027) ganha o grupo "dividida de 1997".

## Consequências

- Todas as cartas divididas de borda preta saem em PT, salvo as de Commander 2016, as cartas de teste e as promos de 2003 com o logotipo da FNM.
- As divididas da moldura antiga ganham a primeira arte reescrita: 10 cartas, 13 impressões.
- `fillAcross` fica disponível para outros fios finos na horizontal sob letras que a rede neural apaga.
