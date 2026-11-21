# 0002. Texto em português: Arena primeiro, impressão oficial depois, nunca máquina

- Situação: aceita (17/11/2026)

## Contexto

A Wizards parou de imprimir em português em 2024 (depois de Modern Horizons 3), mas o MTG Arena continua traduzido. A Untapped publica os arquivos de dados do Arena (`cards.json`, `loc_br.json`) em mtgajson.untapped.gg. Cartas que nunca estiveram no Arena só têm texto oficial nas impressões em português, disponíveis no Scryfall (`lang:pt`).

## Decisão

Prioridade por carta: (1) texto do Arena em PT-BR, que tem a terminologia mais atual; (2) impressão oficial em português mais recente; (3) nenhum: a carta sai em inglês e a interface marca "ainda sem tradução oficial". Não usamos tradução automática nem "tradução de fã".

O nome em português só é aceito quando difere do inglês (algumas impressões PT de cartas de duas faces repetem o nome em inglês). O texto de ambientação (flavor) é da impressão de onde veio o texto e só aparece quando a arte escolhida é essa mesma.

## Consequências

- Cobertura medida em 17/11/2026: 92,4% das 31.597 cartas legais no Commander; 98,9% das 1.000 mais jogadas no EDHREC. Corrigida em 21/11/2026: 83,8% e 98,4%. A primeira medição contava as impressões em PT que o Scryfall tem sem imagem e sem texto (a carta em inglês com o selo "Localized Image Not Available"), que também não servem como imagem oficial em PT.
- Nada é extraído do cliente do Arena: usamos arquivos publicados por terceiros. (Exceção desde 20/11/2026: as dicas das palavras-chave, do arquivo da instalação do João, para a explicação das que nunca saíram impressas em PT; ver ADR 0021.) Antes de divulgar amplamente, pedir autorização à Untapped e avisar o Scryfall (ver `docs/pesquisa.md`).
- Quando o Arena receber cartas novas, o pipeline diário as pega sem mudança de código.
