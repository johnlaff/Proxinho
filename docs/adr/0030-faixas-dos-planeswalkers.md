# ADR 0030: as faixas dos planeswalkers do tamanho do texto em português

- Status: aceito
- Data: 25/11/2026
- Completa: ADR 0007 (moldura de planeswalker) e ADR 0020 (o escurecimento das faixas, tirado e posto de novo, nas naves)

## Contexto

A caixa do planeswalker é dividida em faixas, uma por habilidade, que alternam de tom (ADR 0007). O motor mede as divisas na imagem e escreve cada habilidade em PT na faixa dela, todas no mesmo corpo. As divisas são as do inglês: o texto em PT é mais comprido, e cada habilidade cresce de um jeito. A que mais cresceu decidia o corpo de todas, com espaço sobrando nas outras: no Will Kenrith (BBD 1) o −2 em PT tem uma linha a mais e a letra de toda a caixa encolhia para 18,5 px; no Space Beleren (UNF 178, na The List) a faixa da estática do alto, alta no inglês, ficava quase vazia em PT e as três habilidades saíam com a letra de 23,5 px, apertadas nas faixas delas.

As cartas impressas em PT têm as faixas do tamanho do texto em PT: a divisa fica onde o texto pede, e o escudo de lealdade, no meio da faixa dele.

## Decisão

**As divisas mudam de lugar para o texto em PT caber no maior corpo; os escudos ficam onde estão.**

- `planeswalkerBounds` (`src/engine/planeswalker.ts`) acha, para um corpo, as divisas em que cada faixa tem a altura que o texto dela pede, mais 4 px de folga em cima e embaixo (`PW_PLAN.pad`), cada divisa o mais perto possível de onde está na imagem. Uma divisa fica a pelo menos 30 px do centro de um escudo (`PW_PLAN.iconClear`: o escudo tem até 52 px de altura e a divisa, 5 px de rampa), ou onde estava, se já estava mais perto.
- `planRows` (`src/engine/render.ts`) procura o corpo do maior para baixo, diagrama de novo com as divisas novas para conferir, e só fica com elas se o corpo for pelo menos 1 px maior que com as do inglês (ou se o texto não cabia nem no menor corpo). Sem ganho, a carta sai como antes.
- `moveBands` muda as divisas na imagem já sem o texto, antes de ela ir para o canvas: cada faixa escurece (ou clareia) a de cima por um tanto por canal, medido na divisa original (`shadeRatio`, o mesmo das naves, ADR 0020), e nas linhas entre a divisa original e a nova o tom da faixa de antes vira o da faixa de agora. O meio da rampa da divisa original é medido na imagem (`bandEdge`: onde o tom da linha passa do meio entre as duas faixas); com a rampa fora do lugar, a divisa antiga deixava um risco. Só as colunas da caixa mudam (x 90 a 688), e a caixa da lealdade inicial fica como está.
- O texto de cada habilidade de lealdade continua centrado no escudo dela (`alignOnIcon`).

## Consequências

- Os planeswalkers com uma habilidade muito mais comprida em PT saem com a letra maior e do mesmo tamanho em toda a caixa, como na carta impressa em PT. Na amostra da regressão (85 planeswalkers), 21 mudam: 16 ganham de 1 a 2 px de letra, 4 ganham de 2,5 a 4 px (Ral Zarek, Guest Lecturer, promo de SOS, de 22 a 25,5; Elspeth, Sun's Champion MKC 62, de 27 a 31) e o Space Beleren vai de 23,5 a 32. Os outros 63 saem idênticos.
- A divisa não chega perto do escudo: quando é ele que segura a faixa, a carta sai como antes (Kaito Shizuki, NEO 226: o −7 em PT tem quatro linhas e a divisa de cima já fica a 47 px do escudo dele).
- Muda o resumo do código que desenha: as cartas do servidor são montadas de novo (ADR 0022).
- Os planeswalkers sem borda e de duas faces seguem fora (o roadmap); quando entrarem, passam pelo mesmo `planRows`.

## Alternativas descartadas

- **Corpo diferente em cada faixa**: a carta impressa usa o mesmo corpo na caixa inteira; faixas com letras de tamanhos diferentes chamam a atenção.
- **Pintar as faixas de novo com a cor medida**: a caixa é translúcida, com a arte atrás; só o escurecimento muda de uma faixa para a outra, e multiplicar por ele mantém a arte.
- **Mover também os escudos**: o escudo é desenho da moldura por cima da arte; recortado e colado em outro lugar, deixava o buraco para a rede neural preencher, com a arte atrás dele inventada.
