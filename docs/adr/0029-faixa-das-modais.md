# ADR 0029: a faixa de baixo das cartas modais em português

- Status: aceito
- Data: 25/11/2026
- Completa: ADR 0007 (cartas de duas faces) e ADR 0011 (medidas na imagem)

## Contexto

Nas cartas modais de duas faces (de Zendikar Rising em diante), o pé de cada face tem uma faixa com o resumo do outro lado: uma palavra à esquerda e, à direita, o custo de mana do outro lado ou, quando ele é um terreno, a habilidade de mana ("◀ Land  ⓣ: Add ⓡ." no Shatterskull Smashing). O motor parava a caixa de texto acima da faixa e ela ficava em inglês: a única frase em inglês numa carta toda em português. São 99 cartas e 195 impressões suportadas.

As impressões em PT (ZNR, KHM, STX, MH3) traduzem a faixa: "Terreno ⓣ: Adicione ⓡ.", "Clérigo", "Mágica Instantânea", "Deus", "Tibalt", "Terreno ⓣ: Adicione ⓦ ou ⓑ." (com a habilidade num corpo menor). A palavra e a habilidade são em Beleren e MPlantin, e a cor da letra é a da faixa (branca nas escuras, preta nas claras).

Nenhum dado do Scryfall traz a faixa, e o que ela diz muda com a coleção. Conferido carta a carta nas imagens das 99:

- terreno do outro lado: "Land" e a última habilidade de mana dele;
- sem subtipo: o tipo, sem os supertipos ("Legendary Snow Artifact" → "Artifact");
- com subtipo: o último ("Kor Cleric" → "Cleric", "Legendary Planeswalker — Tibalt" → "Tibalt"), em ZNR, KHM e STX; em MH3, duas escrevem o primeiro ("Human Warlock" → "Human", "Elf Druid" → "Elf") e a terceira, o último ("Djinn Monk" → "Monk");
- desde Marvel's Spider-Man (setembro de 2025): o poder, a resistência e "Creature" ("4/4 Creature").

## Decisão

**A faixa sai do texto oficial da outra face, com as regras das imagens.**

- `mdfcHint` (`src/engine/mdfc.ts`) monta a faixa em PT a partir da outra face: o tipo pelos nomes das linhas de tipo oficiais ("Mágica Instantânea", "Feitiço", "Artefato"), o subtipo pela mesma posição na linha de tipo oficial em PT (as 99 têm o mesmo número de subtipos nas duas línguas), a habilidade de mana pela última linha "{T}: Adicione …" do texto oficial da outra face e, desde setembro de 2025, "Criatura 4/4" (como "uma criatura 4/4" no texto oficial). As duas de MH3 que escrevem o primeiro subtipo ficam em `FIRST_SUBTYPE`. Sem o dado (subtipos que não batem, terreno sem a linha), a faixa fica como está, em inglês.
- `renderInput` (`src/app/preview.ts`) passa a outra face às modais (`otherFace`).
- O motor apaga a palavra e, nos terrenos, a habilidade, como numa barra (preenchimento linha a linha, `MDFC_STRIP` em `geometry.ts`); o triângulo e o custo de mana são desenho e ficam. A proteção do selo da coleção (`stampShape`) entra na faixa pela borda preta e protegia o ponto final da habilidade em inglês (Barkchannel Pathway, KHM 251): nas linhas da faixa ela só vale à direita do fim dela (`beside`). O custo começa em `mdfcCostLeft` (24 px por símbolo, 27 nos híbridos, acabando em x ≈ 320). Nos terrenos o apagamento vai até x 327, porque o ponto final em inglês passa do fim da faixa (Hengegate Pathway), com os dois cantos da ponta da faixa opacos (`MDFC_STRIP.corners`, medidos em 382 faces); e roda de novo com a polaridade oposta, porque o miolo preto dos símbolos em inglês sobre a faixa escura ficava (MH3 253), e, nas faixas claras, uma terceira vez com metade do limiar, para o halo claro em volta deles. A palavra vai em Beleren no corpo 22,5 (as maiúsculas de ≈ 937 a 954, como as do inglês), com a primeira letra em x ≈ 52,5, apertada se não couber antes do custo ("Mágica Instantânea"); a habilidade vai em MPlantin com os símbolos, encostada no fim da faixa, e diminui e depois aperta até caber depois da palavra, como na impressão em PT. Na faixa clara a carta impressa tem o símbolo preto sobre um disco claro, só tingido da cor dele: o símbolo sai preto, com o disco a 45% da cor dele sobre a faixa (`faintDisc`; conferido contra as faixas claras em inglês e em PT de ZNR e KHM; com a cor inteira, o disco chamava a atenção, e com 18% quase sumia).

## Consequências

- As 195 impressões modais suportadas saem sem nenhuma palavra em inglês.
- Muda o resumo do código que desenha: as cartas do servidor são montadas de novo, como em toda mudança no desenho (ADR 0022).
- Coleção nova com cartas modais: conferir nas imagens que palavra a faixa escreve; regra nova ou exceção vai em `mdfc.ts`, com teste.

## Alternativas descartadas

- **Medir a palavra em inglês na imagem e escolher entre os candidatos pela largura**: "Cleric" e "Druid", "Human" e "Warlock" têm larguras parecidas, e a escolha errada traduziria a palavra errada sem nenhum aviso. As regras por coleção, com duas exceções, acertam as 99 de hoje.
- **Guardar a faixa no banco, pelo pipeline**: pede uma migração e a carga do D1 para um dado que sai do texto que o site já recebe.
- **Reescrever também o custo de mana**: é o mesmo nas duas línguas; redesenhar só arriscaria mudar o símbolo.
