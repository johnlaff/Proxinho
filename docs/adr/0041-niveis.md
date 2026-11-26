# ADR 0041: Moldura dos Níveis (Subir de Nível)

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0011 (medidas na imagem), ADR 0020 (os níveis das naves) e ADR 0024 (moldura de 2003)

## Contexto

As 25 criaturas com Subir de Nível (Level up) nasceram em Rise of the Eldrazi (2010) e voltaram nos Duel Decks (Knights vs. Dragons, Zendikar vs. Eldrazi), nos Commanders de 2013, 2017 (Anthology) e 2021, em Modern Horizons (o Hexdrinker), no Commander de Lost Caverns of Ixalan e na The List. O Scryfall as marca com o layout `leveler`, e o pipeline só aceitava o `normal`: todas saíam na original, em inglês. As 24 de Rise of the Eldrazi foram impressas em PT (o texto vem do Scryfall) e o Hexdrinker vem do Arena.

A caixa de texto é partida em três faixas fixas, cada uma mais escura que a de cima. A do alto leva o "Subir de nível {W} (…)" e a caixa de P/R da criatura sem níveis; as duas de baixo levam, à esquerda, um selo em forma de seta com a palavra "LEVEL" e o intervalo ("2-6", "7+"), as habilidades do nível no meio e, à direita, a caixa de P/R do nível. São 61 impressões: 43 na moldura de 2003 (ROE e as promos dela, DDG, C13 e The List) e 18 na atual (DDP, CMA, MH1, C21, LCC, The List, Secret Lair e Mystery Booster 2). As medidas mudam entre as duas: as faixas começam em y 745 e 839 na de 2003 e em 747 e 848 na atual (escala de 745 × 1040), e a caixa de P/R começa em x ≈ 553 numa e 576 na outra, com o contorno preto na de 2003 e cinza (de 115 a 130, uns 60 tons abaixo do papel) na atual.

Na carta impressa em PT o selo diz "NÍVEL" e o intervalo fica como está, e o texto das três faixas sai com a mesma letra (Kargan Dragonlord, ROE 152; num fórum do Magic Set Editor, a mesma carta é o exemplo de que o molde deveria fazer isso e não faz). O Proxyshop tem um molde próprio (`LevelerTemplate`), com uma camada de texto e uma de P/R por faixa, e monta a carta inteira do zero; ninguém reaproveita a moldura da imagem.

Nos dados havia um erro que a moldura deixava à vista: o Arena marca cada nível com uma linha interna, "LEVEL [3-7] [4/4] [Protection from instants]" em inglês e "NÍVEL [3-7] [4/4] […]" em PT, que passava por palavra-chave e se juntava às habilidades em volta ("Proteção contra mágicas instantâneas, nÍVEL [8+] [6/6] […]", Hexdrinker).

## Decisão

**Pipeline.** `leveler_level` lê o nível e o P/R no marcador em inglês e escreve as duas linhas como o Oracle e a carta impressa ("NÍVEL 3-7", "4/4"); `join_station`, o mesmo das naves com Posicionar, põe essas linhas na frente das habilidades do nível, fora da junção das palavras-chave. `leveler_supported`: moldura 2003 ou 2015, layout `leveler`, borda preta, sem efeito além da coroa de lendária, sem `full_art`, sem marca-d'água e fora das cartas de teste. Ficam de fora as duas promos de ROE com marca-d'água (o apagamento de cada faixa levava a marca junto, em cacos), as duas sem borda da Secret Lair e as duas de Mystery Booster 2 (a de borda branca e a carta de teste).

**Motor** (`leveler.ts`, no caminho da carta comum em `renderCard`, com as medidas de cada moldura em `LEVELER`):

- **As faixas** são medidas na imagem (`levelerFrame`): a mudança de tom do papel (percentil 80 de x 200 a 480, sem as letras), comparando as medianas de 5 linhas acima e abaixo; a mudança dá um patamar de linhas, e o começo da faixa é o meio dele. Tem de ficar a até 5 px da medida fixa e ser de ao menos 6 tons. **As caixas de P/R** são a primeira coluna, no meio de cada faixa, 60 tons abaixo do papel logo antes dela. **A palavra do selo** é medida linha a linha (as linhas com tinta bem mais escura que o selo), porque muda 2 ou 3 px de lugar entre coleções. **O pé do papel** é o começo do filete claro do pé da caixa (12 tons ou mais acima do papel), até 4 px antes ou depois da medida. Sem as faixas ou as caixas de P/R, não é a moldura dos níveis e a carta sai na original.
- **O texto em PT** é partido em três (`levelerText`): a faixa do alto e os dois níveis, cada um com o intervalo e o P/R; fora dessa forma, a carta sai na original.
- **O apagamento** é o da caixa de sempre, uma faixa por vez, do selo (ou da beira) até 3 px antes da caixa de P/R e de uma mudança de tom à outra, com 1 px de folga de cada lado (`levelerErase`); a última vai até o pé medido do papel. Na palavra do selo sai o retângulo inteiro (`force`), com o intervalo logo abaixo opaco: ele é o mesmo em PT e fica como impresso. As caixas de P/R também ficam.
- **A escrita**: o texto de cada faixa vai do selo até 10 px antes da caixa de P/R, centralizado na altura dela, com a mesma letra nas três, a maior em que todas cabem, de 16 a 30 (`fitRows`, `levelerBoxes`); na moldura atual a última faixa acaba antes do selo da coleção, que sobe para dentro dela (Coralhelm Commander, LCC 148). O "NÍVEL" vai no lugar do "LEVEL", na letra do nome da moldura (a Matrix Bold na de 2003, a Beleren na atual), com a altura das maiúsculas medida e estreitado até a largura da palavra em inglês (`levelerWordSpots`); na de 2003, com o contorno claro das letras do selo.

## Regressão

As 55 impressões suportadas, montadas com o código desta árvore e conferidas na folha de contato e no zoom: as faixas e as mudanças de tom no lugar, o selo com "NÍVEL" e sem resto do "LEVEL", sem pé de letra em inglês nas beiras das faixas e o filete claro do pé da caixa inteiro. Com atenção ao Kargan Dragonlord (ROE 152: o "F" colado na mudança de tom), ao Coralhelm Commander (ROE 57: o "g" na última linha do papel; LCC 148: o selo da coleção), ao Beastbreaker of Bala Ged (ROE 178) e ao Echo Mage (C13 43), com o filete do pé 1 px antes e depois da medida, ao Student of Warfare (ROE 47), ao Hexdrinker (MH1 168) e ao Kabira Vindicator (DDP 4), de contorno cinza na caixa de P/R. A regressão de sempre (ADR 0027) ganha o grupo "níveis". Nenhuma outra moldura passa pelo código novo; o Hexdrinker muda só de texto nas outras artes dele.

## Consequências

- As 25 criaturas com Subir de Nível saem em PT na moldura de 2003 e na atual, de borda preta.
- O Hexdrinker do Arena ganha os níveis como o Oracle, em todas as molduras.
- Com a mesma letra nas três faixas, o nível de texto mais comprido decide o tamanho: o Lord of Shatterskull Pass (ROE 156) sai no corpo 16, com o último nível em quatro linhas, como na impressa em PT.
- As promos com marca-d'água, as sem borda e as de Mystery Booster 2 continuam na original.
