# ADR 0009: Fichas (tokens) em português

- Status: aceito
- Data: 17/11/2026

## Contexto

Quase todo deck de Commander cria fichas (Tesouro, Espírito, Zumbi…), e quem imprime proxies quer imprimir as fichas junto. Até aqui a seção "Tokens" da lista era ignorada e a interface avisava que fichas não entravam.

Dois problemas: de onde vem o texto oficial em português de cada ficha, e como reescrever a moldura de ficha, que é diferente da carta comum (nome centralizado em versalete, linha de tipo de altura variável, sem custo de mana).

## Opções para o texto

1. **Impressões em PT das fichas no Scryfall.** Quase não existem: as fichas em português raramente foram catalogadas.
2. **Fichas do MTG Arena** (arquivos públicos da Untapped, a mesma fonte do ADR 0002). O `cards.json` traz as fichas com `isToken`, nome, tipo, subtipo e habilidades, e o `loc_br.json` tem o texto oficial em PT-BR.
3. **Gerar o texto a partir do glossário** ("Flying" → "Voar"). Seria tradução por máquina, proibida pela regra do projeto.

## Decisão

Opção 2. O pipeline casa cada ficha do Scryfall (`layout: token`, a impressão mais recente é a referência) com a ficha do Arena pela chave nome + poder + resistência + texto em inglês sem lembretes. Cartas de apoio ("Copy", "The Monarch", "Boss") ficam de fora: o tipo precisa começar por "Token ". Algumas fichas do Arena trazem só "Criatura" no tipo; nesse caso (tipo de uma palavra só) o pipeline acrescenta "Ficha", como no tipo impresso ("Token Creature"). Tipos compostos ficam como o Arena escreve.

- **Banco:** cada ficha vira uma linha em `cards` (`layout = 'token'`) com o texto do Arena quando há, e cada carta ganha a coluna `tokens` (migração 0004) com os `oracle_id` das fichas que cria, tirados do `all_parts` do Scryfall.
- **API:** `POST /api/cards {ids}` devolve cartas ou fichas pelo `oracle_id`, com as impressões. A busca e o `/api/resolve` põem as fichas por último, salvo nas linhas da seção "Tokens" da lista, que preferem a ficha.
- **Interface:** o resumo do pedido lista "Fichas que o deck cria" (as que ainda não estão no pedido), com P/R e cor para distinguir fichas de mesmo nome, e adiciona uma de cada. A seção "Tokens"/"Fichas" da lista também entra, e a busca acha fichas pelo nome.
- **Motor** (`token.ts`): a barra de tipo é achada na imagem pelos dois fios escuros que a emolduram (~58 px um do outro, atravessando 85% da largura). O pé da caixa é o primeiro fio abaixo dela. O nome é escrito centralizado em versalete; texto de uma linha só sai centralizado, como nas fichas impressas. Ficha sem texto (barra no pé) não tem caixa. Sem a barra, a ficha sai como está.
- **Molduras:** só a de 2015 com borda preta, sem arte estendida nem efeitos de moldura, como nas cartas.

## Consequências

- 795 fichas no banco, 541 com texto oficial em PT. Elas cobrem cerca de 82% das referências a fichas nas cartas legais em Commander; as outras saem em inglês, com a etiqueta de sempre.
- Conferido em 24 fichas sorteadas de 20 coleções (claras, escuras, coloridas, com e sem texto): nenhuma falha de detecção.
- Emblemas, fichas de duas faces e as molduras antigas de ficha continuam fora.
