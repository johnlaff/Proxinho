# ADR 0014: PDF adiantado, cartas guardadas no navegador e onde a conta roda

- Status: aceito
- Data: 19/11/2026
- Complementa: ADR 0005 (PDF no navegador) e ADR 0013 (rede neural rápida e prévia em duas etapas)

## Contexto

Com a rede neural funcionando, o João perguntou quanto leva um deck inteiro, se uma carta sem borda leva 47 s no celular. Medimos (`docs/pesquisa.md`, "Velocidade do acabamento e do deck inteiro"):

- Num deck de 100 cartas só com nomes, nenhuma carta passa pela rede neural. As prévias ficam prontas em 45 s, e o **PDF leva mais ~1 min depois do clique**: cada carta é montada de novo, agora no PNG de impressão (745 × 1040), duas por vez. É a maior espera do deck.
- A rede neural só pesa nas artes sem borda e nos planeswalkers, e a caixa limpa pela prévia já é reaproveitada pelo PDF. Mas tudo se perde ao fechar a página: abrir a mesma lista outro dia roda a rede neural de novo (de 20 s a 1 min por carta sem placa de vídeo).
- Quem espera no processador não sabe por quê. No Firefox do celular, que ainda não deixa sites usarem a placa de vídeo, a espera é várias vezes maior que no Chrome do mesmo aparelho.

O mercado faz o mesmo nos três pontos: adiantar o trabalho que o clique vai pedir quando a página está ociosa (o `requestIdleCallback` e o "prefetch" de recursos), guardar no aparelho o que custou caro (o cache das ferramentas de IA no navegador, como o transformers.js) e dizer onde a conta roda.

## Decisão

1. **PDF adiantado** (`src/app/printFaces.ts`). Cada face pronta para o PDF fica guardada por chave de montagem e qualidade (`printFace`). Enquanto a pessoa revisa, `warmPrints` monta em segundo plano as faces do pedido, uma de cada vez, só depois que as prévias acabam (`whenPreviewsIdle`), num respiro do navegador e só depois de 1,5 s sem toque, rolagem ou tecla (montar uma carta no PNG prende a página por meio segundo). A carta da rede neural espera a própria prévia, que limpa a caixa que o PDF usa. As faces que saem do pedido ou da qualidade escolhida são esquecidas. No clique, `exportPdf` para o adiantado e monta só o que falta, quatro de cada vez num computador com folga (`exportParallel`) e duas no celular. Com a economia de dados ligada (`navigator.connection.saveData`), nada é baixado antes do clique.
2. **Cartas guardadas no navegador** (`src/app/cardStore.ts`). A prévia acabada e a face do PDF de cada carta vão para o IndexedDB (banco `proxinho-cartas`). Na visita seguinte, a mesma carta aparece sem montar nada, sem rascunho e sem baixar a rede neural; o PDF também usa a guardada. A chave é o SHA-256 de tudo o que muda o desenho: o resumo do código que desenha (`__PROXINHO_BUILD__`, calculado no build sobre `src/engine`, a entrada da montagem e as fontes livres, em `vite.config.ts`), os arquivos das fontes (`fontsId`), o tipo da imagem e a entrada inteira da carta (impressão, textos em PT, flavor). Uma correção no motor ou no texto muda a chave. A carta que saiu na original porque a rede neural não rodou não é guardada. O espaço vai até 120 MB (quatro a seis decks); as usadas há mais tempo saem primeiro. No `dev`, nada é guardado.
3. **Onde a conta roda** (`neuralWhere` em `labels.ts`). A gaveta diz "Rodando na placa de vídeo deste aparelho" ou "Rodando no processador", com o porquê que a worker achou (`GpuProblem`): o navegador não tem WebGPU, não liberou a placa de vídeo deste aparelho para sites (no Android o Chrome libera só em parte dos aparelhos; no Firefox, a gaveta lembra que no Chrome pode levar bem menos), só oferece uma placa simulada, mais lenta que o processador, ou a placa de vídeo falhou no acabamento. A primeira versão dizia só "a placa de vídeo não serviu", e um Chrome de Android no processador não dizia qual das três.

## Alternativas

- **Montar o PDF numa worker** (OffscreenCanvas), para usar todos os núcleos: o motor inteiro depende do canvas da página e de `document.fonts`; fica para depois. Quatro montagens ao mesmo tempo em vez de duas ganharam só 9% no PDF (61 → 56 s, 4 núcleos): a conta roda na thread da página.
- **Guardar só as caixas limpas pela rede neural**: cobre o caro, mas o PDF e as prévias das cartas comuns seriam montados de novo a cada visita; guardar a carta pronta cobre os dois.
- **Chave pela `renderKey`** da prévia: ela não tem o texto da carta, e a carta guardada continuaria com o texto velho depois de uma correção nos dados.

## Consequências

- Deck de 100 cartas no computador: depois de 70 s de revisão, o PDF sai em 1,8 s (antes, 56 a 61 s). No celular emulado, depois de 30 s de revisão, em 31 s em vez de ~60.
- Na segunda visita com a mesma lista (Konia sem borda, Sol Ring e Arcane Signet), as três cartas aparecem acabadas em 0,2 s, sem baixar a rede neural, e o PDF sai em 0,1 s.
- Enquanto adianta, a página fica ocupada em metade do tempo de revisão, em blocos de até 650 ms; por isso o adiantado só começa depois de 1,5 s sem a pessoa mexer na página. O primeiro toque depois de uma pausa pode esperar o bloco da carta que está sendo montada.
- As cartas guardadas ocupam espaço no aparelho (uns 20 MB por deck de 100 cartas, prévia e PDF) e o navegador pode apagá-las quando falta espaço. Nada passa pelo servidor.
- Cada publicação que muda o motor invalida as cartas guardadas: a primeira visita depois dela monta tudo de novo.
