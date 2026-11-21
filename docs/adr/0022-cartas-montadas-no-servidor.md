# ADR 0022: Cartas montadas de antemão no servidor

- Status: aceito; o R2 foi ativado na conta e o depósito ligado em 21/11/2026.
- Data: 21/11/2026
- Complementa: ADR 0001 (motor da carta no navegador) e ADR 0014 (cartas guardadas no navegador)

## Contexto

O motor roda no navegador (ADR 0001): cada carta é montada no aparelho da pessoa, e a primeira visita a um deck espera tudo. As cartas comuns levam de meio a um segundo cada, e as que passam pela rede neural (artes sem borda e planeswalkers), de 15 s a 1 min no processador. As cartas guardadas no navegador (ADR 0014) só ajudam na segunda visita, no mesmo aparelho.

Em 20/11/2026 o João decidiu que o Proxinho é para uso dele e de colegas próximos, e pediu tudo montado no servidor, para a experiência ser instantânea. O risco legal foi apresentado uma vez (a Política de Conteúdo de Fãs da Wizards exclui proxies, mesmo grátis; o Scryfall não aceita republicar os dados dele como proxy; ver `docs/pesquisa.md`) e a decisão é dele.

O padrão de mercado para "instantâneo" é a imagem pronta num CDN: o MPC Autofill serve imagens já montadas por um cache na borda, o Scryfall e os sites de deck servem a imagem da carta, e quem monta na hora (Card Conjurer, MtG Proxy Printer) faz uma carta por vez, no aparelho. Montar sob demanda num navegador da Cloudflare (Browser Run) tem 10 horas por mês no plano pago e US$ 0,09 por hora depois: não paga um deck de 100 cartas com rede neural na primeira visita.

## Decisão

1. **O mesmo motor, de antemão, num Chromium.** O montador em lote (`scripts/montagem/montar.mjs`, com Playwright) abre a página do montador (`scripts/montagem/index.html` e `src/montagem/pagina.ts`, num build à parte, `vite.montagem.config.ts`, fora do site) e chama as mesmas funções que o site usa: `renderInput` (a entrada da montagem), `renderPreview` (a prévia da folha) e `renderPrint` (a face do PDF na qualidade padrão). A carta do servidor é a que o site montaria no Chrome da pessoa.
2. **A mesma chave das cartas guardadas.** A chave é a do ADR 0014: o SHA-256 do resumo do código que desenha (`__PROXINHO_BUILD__`), das fontes, do tipo da imagem e da entrada inteira da carta (impressão, textos em PT, flavor). O build do montador leva o mesmo resumo que o build do site do mesmo commit (`drawingHash`, exportado de `vite.config.ts`). Uma correção no motor ou nos dados muda a chave, e uma carta velha nunca é servida no lugar da nova: ela só deixa de ser achada. A página confere a chave de novo antes de devolver a imagem.
3. **Guardadas no R2, servidas pelo Worker.** O depósito `proxinho-cartas` é privado (sem endereço público, sem listagem) e o Worker serve `GET /api/cartas/<código>/<chave>.jpg` (`worker/cartas.ts`) com `cache-control: immutable`, `x-robots-tag: noindex` e `x-traduzida` (0 quando a carta saiu na original em inglês), passando pelo cache da borda. Gravar (`PUT`), perguntar quais chaves faltam (`POST …/faltando`) e apagar as de um código velho (`DELETE /api/cartas/<código>`) pedem a senha do montador (`CARTAS_TOKEN`, segredo do Worker).
4. **O site procura antes de montar.** A prévia e a face do PDF procuram primeiro a carta guardada no navegador, depois a do servidor (`savedCard` e `serverCard` em `src/app/cardStore.ts`, uma busca por chave e por visita, até 5 s), e só então montam no aparelho, como antes. Com as fontes da pessoa (`fontsId` diferente de `o|o`) o site nem procura: o servidor monta só com as oficiais. A carta do servidor dispensa o rascunho e o download da rede neural.
5. **O que é montado, e em que ordem.** As duas imagens que o site guarda de cada face onde o português é escrito (texto oficial e moldura suportada): a prévia e a face do PDF na qualidade padrão (a alta continua no aparelho). Primeiro a arte que o site escolhe sozinho para cada carta, das mais jogadas às menos (EDHREC), depois as outras artes suportadas. O montador só monta o que falta no servidor: depois de um deploy que muda o desenho monta tudo de novo; depois dos dados diários, só as cartas que mudaram. Depois de montar, apaga as cartas dos códigos velhos.

## Alternativas

- **Workers KV** no lugar do R2: o plano pago cobra US$ 0,50 por GB por mês (os ~20 GB custariam ~US$ 10 por mês, contra ~US$ 0,15 no R2, que tem 10 GB grátis).
- **Arquivos estáticos do Worker**: o limite de arquivos por versão não cabe as ~115 mil imagens, e cada deploy reenviaria o que mudou.
- **Montar sob demanda na borda (Browser Run) ou num contêiner**: a primeira visita continuaria esperando a montagem, e as horas de navegador da rede neural passam do incluído no plano.
- **Montar de novo no servidor com outro motor** (node-canvas, Skia): seriam dois motores para manter iguais, com fontes e antialiasing diferentes; o Chromium roda o próprio motor do site.

## Consequências

- Na primeira visita, a folha e o PDF das cartas já montadas chegam como imagem pronta, sem montar nada no aparelho. A prévia tem ~60 KB e a face do PDF ~300 KB, contra ~100 KB e ~1 MB baixados do Scryfall para montar no aparelho.
- O servidor passa a guardar e servir imagens de cartas (até o ADR 0021 o README e o `PRODUCT.md` diziam o contrário). Quem tem o endereço de uma carta (a chave) consegue baixá-la; não há listagem pública nem galeria.
- Uma mudança no motor deixa tudo para montar de novo: ~58 mil faces com a prévia e a face do PDF, ~20 GB. As cartas comuns levam ~1,5 s por face e as da rede neural ~20 s no processador; o montador roda as duas filas em paralelo. Enquanto ele não termina, o site monta no aparelho o que falta, como antes.
- Em outros navegadores (Firefox, Safari) a carta do servidor tem o antialiasing do Chromium. A montagem no aparelho continua igual para o que não está no servidor.
- O montador precisa das fontes oficiais (vêm do site) e do mesmo commit do site; ele confere as duas coisas antes de começar.
