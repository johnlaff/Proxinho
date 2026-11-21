# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: o João pediu "stack recomendada" e autorizou adaptar a arquitetura. Escolha: React 19 + Vite 8 + TypeScript 7 no navegador; um Cloudflare Worker (API + arquivos estáticos) com banco D1; pipeline de dados em Python (só biblioteca padrão) no GitHub Actions. Deploy no plano Workers Paid que o João já paga, no domínio proxinho.johnlaff.com.

## Users

Jogadores brasileiros de Magic: The Gathering, principalmente de Commander, que:
- têm cartas físicas em inglês e querem jogar com o deck "100% em português" pondo um proxy traduzido na frente da carta original, dentro do sleeve;
- estão começando (muitos aprenderam no Arena em português) e não leem inglês, ou jogam com família e amigos que não leem;
- querem uma arte específica que nunca saiu impressa em português.
Situação de uso: montando ou atualizando um deck no computador ou no celular, com a lista já pronta em outro site (Archidekt, Moxfield, Liga Magic), e depois imprimindo em casa ou numa copiadora.

## Product Purpose

Pegar qualquer carta, em qualquer arte, e entregar um PDF pronto para imprimir no tamanho exato de uma carta de Magic (63 × 88 mm), com nome, tipo e texto oficiais em português. Sucesso: a pessoa cola a lista, revisa e baixa o PDF em poucos minutos, e a carta impressa fica indistinguível da original quando vista dentro do sleeve.

## Positioning

É a única ferramenta que reescreve o texto em português sobre qualquer impressão em inglês, em vez de depender de existir uma imagem em português. O texto vem do próprio MTG Arena (que continua em PT-BR) e das impressões oficiais em português, e as cartas que nunca saíram em PT ganham uma tradução não oficial feita com as frases das oficiais, marcada como tal; a arte, a moldura, o artista e o copyright são os da carta original.

## Operating Context

- Listas chegam coladas (formatos MTGO, Arena, Moxfield, Archidekt, Liga Magic) ou por link (Archidekt; Moxfield bloqueia leitura por terceiros).
- Impressão em impressora caseira ou copiadora, papel sulfite 75–90 g ou couché 115 g, corte com tesoura ou guilhotina.
- A folha impressa vai na frente da carta original dentro do sleeve (de preferência com sleeve interno).
- Vocabulário da comunidade: "proxy", "sleeve", "deck", "comandante", "arte", "impressão", "coleção".

## Capabilities and Constraints

- Moldura moderna (2015+) é reescrita em português nas cartas normais (e a de 2003 a 2014 também, sem marca-d'água nem efeito de moldura), de duas faces, planeswalkers, fichas (tokens, também na moldura de 2003), emblemas, Sagas, Aventuras, Classes, naves e planetas com "Posicionar" e artes sem borda; outras molduras (showcase, antigas) mostram a imagem oficial em português quando existe, ou a original em inglês com aviso. Novas molduras entram por etapas.
- Tradução oficial cobre 84% das cartas legais no Commander (Arena + impressões em português). A tradução não oficial (ADR 0025) leva a 92%, e a 100% das 10 mil mais jogadas; o restante aparece em inglês, marcado, até existir tradução.
- O mesmo motor monta as cartas no navegador da pessoa e, de antemão, no servidor (ADR 0022): as cartas já montadas lá chegam prontas, num depósito privado, sem galeria nem listagem pública. Uso do dono do projeto e de amigos próximos (decisão de 20/11/2026).
- Gratuito, sem venda de impressão, aviso de conteúdo de fã da Wizards no site e no PDF.
- O texto usa as fontes das cartas reais (Beleren e MPlantin, e a Matrix Bold no nome e no tipo da moldura de 2003), servidas pelo próprio site e fora do repositório público; sem elas, fontes livres (OFL) parecidas.

## Brand Commitments

- Nome: Proxinho (escolhido pelo João). Projeto brasileiro: linguagem do Brasil, sem referências a Portugal.
- Não usar "Magic", "MTG" nem logos da Wizards como marca do produto.
- Copy em português do Brasil, leve e direto, com o jargão da comunidade.

## Evidence on Hand

- Medição de 21/11/2026: 83,8% das 31.597 cartas de Commander têm texto PT oficial; 98,4% das 1.000 mais jogadas. (A de 17/11, 92,4%, contava as impressões em PT que o Scryfall tem sem imagem e sem texto, só com o nome.)
- Só 4% das imagens em português do Scryfall têm alta resolução (1.620 de 38.832).
- Não há depoimentos, usuários ou números de uso ainda. Não inventar.

## Product Principles

1. A carta impressa precisa parecer a original: fidelidade de tamanho, moldura e tipografia vem antes de qualquer recurso.
2. Do colar ao PDF sem fricção: nenhum cadastro, nenhuma configuração obrigatória.
3. Honestidade sobre a tradução: sempre mostrar de onde veio o texto, quando a tradução é não oficial e quando não há tradução nenhuma. A oficial sempre ganha da não oficial.
4. Seguro por construção: gratuito, nada extraído do cliente do Arena além das dicas das palavras-chave do arquivo do dono do projeto (ADR 0021), e as cartas prontas só pelo próprio site, sem galeria, listagem nem indexação (ADR 0022).

## Accessibility & Inclusion

WCAG 2.2 AA. Público inclui iniciantes e pessoas com pouca familiaridade com tecnologia: linguagem simples, alvos de toque grandes no celular, nada que dependa só de cor.
