# 0001. Reescrever o texto sobre a imagem da carta, no navegador

- Situação: aceita (17/11/2026)

## Contexto

O pedido é "qualquer carta, em qualquer arte". Imagens oficiais em português existem só para parte das impressões e, no Scryfall, apenas 1.620 de 38.832 têm alta resolução (medido em 17/11/2026). O MTG Arena não tem a imagem pronta da carta em português; tem só o texto e uma arte recortada de 626 × 457 px. Ferramentas que redesenham a carta inteira (moldura, arte, símbolos) ficam longe do original e, em 2022, o Card Conjurer recebeu notificação da Wizards por distribuir molduras.

## Decisão

Partir do PNG oficial da impressão escolhida (745 × 1040 px, ~300 dpi, CORS liberado no CDN do Scryfall), apagar só o nome, a linha de tipo e a caixa de texto em inglês e escrever o português por cima, com fontes livres (OFL). Tudo acontece num canvas no navegador da pessoa.

- Apagamento: máscara por luminância e por distância de cor da textura, dilatação e fechamento morfológico, e preenchimento em pirâmide (push-pull), preservando a textura da moldura.
- Áreas protegidas: caixa de poder/resistência, símbolo da coleção (detectado na imagem), custo de mana.
- Texto: quebra de linha própria com símbolos de mana em SVG, corpo ajustado para caber (34 → 15), lembretes em itálico, flavor só quando cabe.

## Consequências

- A arte, a moldura, o artista e o copyright continuam os da carta original; o resultado fica parecido com a carta real.
- O servidor não hospeda nem transforma imagens: menos custo e menos risco legal.
- Cada moldura precisa de uma geometria. A primeira versão cobre a moldura 2015 de layout normal (a maioria das cartas de Commander). Outras molduras usam a imagem oficial em PT quando existe e, senão, a original com aviso.
- O PNG pesa ~1 MB: a prévia usa a versão "normal" (488 × 680, ~100 KB) e o PNG só é baixado na hora do PDF.

## Atualização (17/11/2026): fontes das cartas reais

As fontes originais (Beleren e MPlantin) são comerciais e não vêm com o site. A pessoa que tem os arquivos pode escolhê-los em "Acabamento → Fontes das cartas": eles ficam no IndexedDB do navegador, são registrados como `FontFace` locais e nunca são enviados. A Splentinex desenha letras menores que a MPlantin no mesmo corpo, então o texto com fontes livres usa um fator de 1,06 para chegar ao tamanho visual das cartas reais (conferido lado a lado com a Cultivar LCC 235).
