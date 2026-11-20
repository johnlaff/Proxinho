# Registros de decisão (ADR)

Cada arquivo registra uma decisão de arquitetura: o contexto, o que foi decidido e as consequências. Formato de Michael Nygard. Uma decisão nova que muda uma antiga cria um ADR novo e marca o antigo como "substituído".

| Nº | Decisão | Situação |
|---|---|---|
| [0001](0001-reescrever-a-carta-no-navegador.md) | Reescrever o texto sobre a imagem da carta, no navegador | Aceita |
| [0002](0002-fontes-do-texto-em-portugues.md) | Texto PT: Arena primeiro, impressão oficial depois, nunca máquina | Aceita |
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
