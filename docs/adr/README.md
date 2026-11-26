# Registros de decisão (ADR)

Cada arquivo registra uma decisão de arquitetura: o contexto, o que foi decidido e as consequências. Formato de Michael Nygard. Uma decisão nova que muda uma antiga cria um ADR novo e marca o antigo como "substituído".

| Nº | Decisão | Situação |
|---|---|---|
| [0001](0001-reescrever-a-carta-no-navegador.md) | Reescrever o texto sobre a imagem da carta, no navegador | Aceita |
| [0002](0002-fontes-do-texto-em-portugues.md) | Texto PT: Arena primeiro, impressão oficial depois, nunca máquina | Aceita, com o item 3 mudado pelo 0025 |
| [0003](0003-um-worker-cloudflare-com-d1.md) | Um único Cloudflare Worker com D1 | Aceita |
| [0004](0004-pipeline-de-dados-em-python.md) | Pipeline de dados diário em Python puro no GitHub Actions | Aceita |
| [0005](0005-pdf-no-navegador-com-pdf-lib.md) | PDF gerado no navegador com pdf-lib, em milímetros | Aceita |
| [0006](0006-ferramentas-de-qualidade.md) | Ferramentas: Vite, TypeScript, oxlint/oxfmt, Vitest, Playwright | Aceita |
| [0007](0007-molduras-de-duas-faces-e-planeswalker.md) | Molduras de duas faces e de planeswalker | Aceita |
| [0008](0008-preenchimento-por-rede-neural.md) | Preenchimento por rede neural nas caixas translúcidas | Aceita |
| [0009](0009-fichas.md) | Fichas (tokens): texto do Arena e moldura achada na imagem | Aceita |
| [0010](0010-emblemas-fichas-duplas-e-moldura-2003.md) | Emblemas, fichas de duas faces e moldura de ficha de 2003 | Aceita |
| [0011](0011-medidas-na-imagem-e-varredura-de-erros.md) | Medir a moldura na imagem (fios da caixa, barra, selo, símbolo) e dados do Arena sem versões alternativas | Aceita |
| [0012](0012-moldura-sem-borda.md) | Moldura sem borda: letras brancas e caixa e barras translúcidas pela rede neural, na resolução da imagem | Aceita |
| [0013](0013-rede-neural-rapida-e-previa-em-duas-etapas.md) | Rede neural na placa de vídeo de verdade (runtime WebGPU), download compactado e prévia em duas etapas (rascunho na hora, acabamento com parte e tempo) | Aceita |
| [0014](0014-pdf-adiantado-e-cartas-guardadas.md) | PDF montado em segundo plano enquanto a pessoa revisa, cartas prontas guardadas no navegador entre visitas e a gaveta dizendo onde a rede neural roda | Aceita |
| [0015](0015-caixa-sem-borda-num-quadro-so.md) | Caixa da moldura sem borda num quadro só da rede neural, reduzido (30% mais rápido; igual na regressão das 260 artes) | Aceita |
| [0016](0016-moldura-de-saga.md) | Moldura de Saga: capítulos remontados do Oracle, fios e marcadores medidos na imagem, fios que mudam de lugar para o português caber | Aceita |
| [0017](0017-moldura-de-aventura.md) | Moldura de Aventura: o livro conferido na imagem, a criatura na página da direita e a aventura na da esquerda, com a sombra da lombada tirada antes de apagar | Aceita |
| [0018](0018-lembretes-de-palavra-chave.md) | Lembretes de palavra-chave onde o Oracle os traz, com o texto oficial das cartas impressas em PT | Aceita |
| [0019](0019-moldura-de-classe.md) | Moldura de Classe: coluna, fio do lembrete e barras de nível medidos na imagem, barras recortadas e coladas onde o português pede | Aceita |
| [0020](0020-moldura-de-posicionar.md) | Moldura das naves e planetas com Posicionar: selos, faixas e P/R medidos na imagem, escurecimento das faixas tirado e posto de novo onde o português pede, rede neural em duas metades | Aceita |
| [0021](0021-explicacoes-das-dicas-do-arena.md) | Explicação das palavras-chave nunca impressas em PT pelas dicas oficiais do Arena instalado, só quando dizem o mesmo que a carta; o lembrete impresso antigo deixa de ir para as outras cartas | Aceita |
| [0022](0022-cartas-montadas-no-servidor.md) | Cartas montadas de antemão pelo mesmo motor num Chromium, guardadas no R2 com a chave das cartas do navegador e procuradas pelo site antes de montar | Aceita |
| [0023](0023-montagem-no-github-sem-senha.md) | Montagem no GitHub Actions (máquinas padrão, grátis), sem senha guardada: o Worker confere o token OIDC do workflow; rede neural primeiro e limite de 6 GB no depósito (5 GB até 25/11/2026) | Aceita |
| [0024](0024-moldura-de-2003.md) | Moldura de 2003 a 2014 pelo caminho da carta comum, com a caixa e a ponta das barras medidas nela e o nome e o tipo em Matrix Bold; sem efeito (salvo o céu estrelado de Theros), com as marcas-d'água lisas refeitas pela rede neural por baixo das letras (os logotipos das promos ficam de fora) e com a moldura atual na frente na arte padrão; a busca do símbolo para no fim da barra dela | Aceita |
| [0025](0025-traducao-nao-oficial.md) | Tradução não oficial das cartas sem texto em PT, linha a linha: a linha oficial igual, o molde dela ou a traduzida no padrão do Arena (`data/traducao/`); marcada na interface, nome em inglês salvo o impresso, nunca no lugar da oficial | Aceita |
| [0026](0026-impressoes-transcritas.md) | Texto das 87 impressões em PT que o Scryfall tem só na imagem, transcrito dela (`data/traducao/transcritas.json`) e copiado como a carta diz, com os erros dela; a de 1995 só com o nome | Aceita |
| [0027](0027-regressao-visual-no-repositorio.md) | Regressão visual no repositório: amostra fixa de ~630 impressões (as citadas nos erros e um sorteio por moldura), montada pela página do montador com o código da árvore e o da main, comparada pixel a pixel; imagens só na máquina | Aceita |
| [0028](0028-pedido-guardado-link-e-sugestoes.md) | O pedido como lista: guardado no navegador, no link `#pedido=` comprimido (nunca chega ao servidor) e lido de volta com a impressão de cada linha; "Você quis dizer…?" com Damerau-Levenshtein no Worker; filtro da prova pela legenda | Aceita |
| [0029](0029-faixa-das-modais.md) | A faixa de baixo das cartas modais em PT: a palavra e a habilidade de mana do outro lado, montadas do texto oficial dele com as regras de cada coleção conferidas nas imagens; o custo de mana fica | Aceita |
| [0030](0030-faixas-dos-planeswalkers.md) | As faixas dos planeswalkers do tamanho do texto em PT: as divisas mudam de lugar para a letra caber maior (com o escurecimento de cada faixa tirado e posto de novo), os escudos ficam | Aceita |
| [0031](0031-moldura-antiga.md) | Moldura antiga (1997): as letras brancas com sombra medidas na imagem, a moldura texturizada refeita pela rede neural, a caixa apagada como a da M15 e o nome na Goudy Medieval com os acentos montados | Aceita |
| [0032](0032-moldura-do-preparar.md) | Moldura do Preparar: a Aventura de lado trocado, com o fio entre as caixas conferido na imagem e as duas molduras divididas num caminho só | Aceita |
| [0033](0033-salas-de-duskmourn.md) | Salas de Duskmourn: a carta dividida deitada, girada para apagar e escrever, as faixas translúcidas do meio refeitas pela rede neural e o lembrete das Salas da dica do Arena | Aceita |
| [0034](0034-cartas-divididas.md) | Cartas divididas da moldura atual: as duas metades lado a lado na carta deitada, cada uma como uma M15 pequena, conferidas na imagem, e os nomes das metades que o Scryfall tem em inglês transcritos da imagem | Aceita |
| [0035](0035-consequencia.md) | Consequência: a metade de cima apagada e escrita na carta de pé, a de baixo, impressa de lado, na carta girada, com as barras e as caixas das duas conferidas na imagem | Aceita |
| [0036](0036-fundir.md) | Fundir na moldura atual: a faixa do pé achada na imagem e escrita com o lembrete oficial das impressas, as caixas até o fio acima dela | Aceita |
| [0037](0037-divididas-de-2003.md) | Divididas da moldura de 2003 e o Fundir de Dragon's Maze: o caminho da carta deitada com as medidas da moldura de 2003 (`SplitGeometry`), o nome e o tipo na Matrix Bold e o lembrete do Fundir alinhado à esquerda | Aceita |
| [0038](0038-divididas-antigas.md) | Divididas da moldura antiga: cada metade como a carta de pé dela, o nome e o tipo pela rede neural (o pé das letras sobre o fio da arte, linha a linha), a caixa medida pela cor do papel (bisel, fio ou pergaminho) e o alinhamento de cada metade | Aceita |
| [0039](0039-moldura-de-1993.md) | Moldura de 1993 (Alpha a Alliances): as letras claras ou gravadas achadas numa cópia alisada, a faixa delas pela energia da imagem, a faixa inteira à rede neural quando a medida não fecha (um quadro por linha), a caixa medida pela cor e as letras dela numa cópia alisada, e o português no estilo medido | Aceita |
| [0040](0040-mutacao.md) | Moldura da Mutação: o fio entre a faixa translúcida e o papel medido na imagem, a faixa refeita pela rede neural por baixo das letras e o texto partido entre as duas com a mesma letra; o "Mutação" e os lembretes que faltavam nos dados | Aceita |
| [0041](0041-niveis.md) | Moldura dos Níveis (Subir de Nível): as faixas, as caixas de P/R, a palavra dos selos e o pé do papel medidos na imagem, cada faixa apagada à parte, o texto com a mesma letra nas três e o "NÍVEL" no lugar do "LEVEL"; os níveis do Hexdrinker do Arena como o Oracle | Aceita |
| [0042](0042-invocacoes.md) | Moldura das Invocações (criaturas Saga de Final Fantasy): o lembrete na faixa larga do alto, desviando da curva da tira dos marcadores, os capítulos na coluna mais curta, a barra de tipo sem o escurecimento perto do símbolo enquanto se acha o símbolo e se apaga, e a caixa de baixo com a palavra-chave ou o flavor centralizados | Aceita |
