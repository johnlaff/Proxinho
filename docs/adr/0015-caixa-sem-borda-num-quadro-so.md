# ADR 0015: caixa sem borda num quadro só da rede neural

- Status: aceito
- Data: 19/11/2026
- Substitui: a parte "Rede neural na resolução da imagem" do ADR 0012 (`nativeTiles`)
- Complementa: ADR 0013 e ADR 0014 (velocidade do acabamento e do deck)

## Contexto

O ADR 0012 mandou a caixa de texto da moldura sem borda (~630 × 300 px no PNG) ao LaMa em dois quadros de 512 px na resolução da própria imagem, um depois do outro: com um quadro só, reduzido aos 512 px do modelo, a gravura de retícula do Shivan Dragon da Secret Lair (SLD 7180) perdia o desenho. Depois, essa arte e as outras de retícula grossa passaram a sair na original (`screenNoise`), porque nem os dois quadros a refaziam.

Cada carta sem borda rodava três quadros (as duas barras num, a caixa em dois). Na CPU, sem placa de vídeo (o Firefox do celular e parte dos Android), cada quadro leva uns 6 s num computador com 4 threads e bem mais num celular. Na pesquisa de velocidade (`docs/pesquisa.md`, "Velocidade do acabamento e do deck inteiro"), a caixa num quadro só levou a carta de 19 a 20 s para 13 a 14 s na CPU, visualmente igual em 5 de 6 artes; no Roaming Throne (LCI 344) apareceu um risco escuro de uns 3 px. O João escolheu fazer se passasse na regressão inteira.

## Decisão

`lamaInpaint` roda sempre um quadro: o recorte em volta da área, reduzido (ou ampliado, na imagem das prévias) aos 512 px do modelo. `nativeTiles` e `frameCount` saem; cada caixa conta um quadro no andamento ("parte X de Y"). A opção `native` de `lamaBox` virou `art` (há arte atrás da caixa): ela só liga a volta da cor inventada (`tameInvented`) e do grão da arte (`regrain`), que continuam valendo na caixa e na aba do nome de crossover.

## Regressão

As 260 artes sem borda das amostras das rodadas R1 a R13 (`b1` a `b13`), montadas no PNG de impressão com a caixa em dois quadros e num só, no mesmo navegador:

- 260 pares sem erro; 47 idênticos pixel a pixel.
- Componentes finos e compridos (mais de 14 px de um lado, até 6 do outro, diferença de 35 tons ou mais) que só aparecem num dos dois: 13, em 11 artes: 7 mais escuros no quadro só e 6 nos dois quadros. Ampliados 5 vezes, são pingos de 1 a 5 px que a rede neural inventa nos dois modos (o do Roaming Throne entre eles). Nenhum aparece na carta impressa.
- As artes com a maior diferença média (Necrotic Ooze SLD 133, Underworld Breach SLD 2045, Bebop & Rocksteady TMT 204, Sol Ring SLD 1905, Ian Malcolm REX 38) saem iguais lado a lado.

## Consequências

- Cada carta sem borda roda dois quadros em vez de três: uns 30% menos de acabamento na CPU (mediana de 12,5 s por carta na regressão, num computador de 4 núcleos ocupado com outras montagens). Na placa de vídeo a diferença é de frações de segundo.
- A arte fina atrás da caixa é refeita a partir de um recorte reduzido (~0,7 vez). Arte com retícula grossa continua saindo na original (`screenNoise`); uma arte nova com gravura fina pode perder detalhe, e a regressão das artes sem borda é o lugar de conferir.
- As cartas guardadas no navegador (ADR 0014) são montadas de novo na primeira visita, porque o motor mudou.
