# ADR 0028: pedido guardado, link do pedido e "Você quis dizer…?"

- Status: aceito
- Data: 25/11/2026
- Completa: ADR 0014 (cartas guardadas no navegador) e a spec 0001 (o caminho colar → revisar → baixar)

## Contexto

A auditoria de 25/11 achou três buracos no caminho de um pedido:

1. **O pedido sumia ao recarregar.** Só o texto colado ficava no navegador. As artes escolhidas na gaveta, as quantidades mudadas, as fichas sugeridas e as cartas da busca se perdiam ao fechar a aba, e o deck de 100 cartas revisado carta a carta tinha de ser revisado de novo.
2. **Não havia como mandar um pedido para alguém.** O amigo que quer imprimir o mesmo deck, com as mesmas artes, recebia a lista e refazia as escolhas.
3. **Nome com erro de digitação não tinha saída.** "Sol Rng" ia para "nomes não encontrados" com a dica de procurar na busca; a pessoa tinha de achar o nome certo, voltar à lista, corrigir e montar de novo.

Os sites de referência resolvem isso assim: o Moxfield e o Archidekt guardam o deck numa conta e compartilham por link; o Scryfall e o Moxfield sugerem o nome certo ("Did you mean…?") com busca aproximada. O Proxinho não tem conta nem login (decisão do dono do projeto, 17/11: login é exagero para um site de uso pessoal e de amigos) e não guarda nada da pessoa no servidor.

## Decisão

**O pedido é uma lista de texto, no formato das listas coladas.** `src/app/order.ts` escreve o pedido inteiro (`orderToText`) com uma linha por carta, "2 Sol Ring (C21) 263": a coleção e o número são os da arte escolhida, `*PT*` marca a imagem oficial em português, as seções saem com os cabeçalhos que o leitor já entende ("Comandante", "Deck", "Sideboard", "Fichas") e os nomes não encontrados voltam como foram escritos. O mesmo leitor das listas coladas (`parseDecklist`, que passou a ler `*PT*`) lê o pedido de volta, e a API devolve as cartas com os dados do dia.

- **Pedido guardado.** O texto fica no `localStorage` (`proxinho:pedido`) a cada mudança e volta ao abrir a página, com o aviso "Seu último pedido voltou como você deixou.". O pedido só começa a ser guardado depois de aberto o anterior: sem isso, o pedido ainda vazio (ou uma falha de rede ao abrir) apagaria o guardado. "Começar outro pedido" apaga o pedido e a lista colada, com "Desfazer".
- **Link do pedido.** "Copiar link do pedido" comprime o texto (deflate, `CompressionStream`) em base64 de URL depois de `#pedido=`: um deck de 100 cartas com as artes vira uns 2 KB de link. O que vem depois do `#` nunca sai do navegador, então o servidor não vê nem guarda o pedido. Quem abre o link recebe o pedido e a lista na aba "Colar lista"; o endereço volta ao normal logo depois, para que recarregar não abra o link de novo por cima das mudanças. No celular o botão abre o compartilhar do sistema (`navigator.share`); sem área de transferência, o link fica à mostra para copiar. Link cortado ou alterado dá um aviso e não apaga o pedido guardado.
- **Impressão pedida.** `/api/resolve` recebe a coleção e o número de cada linha e os devolve junto com o nome (`lineKey` casa a linha com a resposta). Quando a carta achada pelo nome não tem aquela impressão, o Worker procura a impressão com aquele nome (`findByPrint`): fichas diferentes têm o mesmo nome ("Spirit" 1/1 branca e 2/2 azul), e só o nome trazia uma delas; e cartas com mais de 80 impressões (Sol Ring) perdiam as mais antigas, que agora vêm junto.
- **"Você quis dizer…?".** `POST /api/sugestoes` recebe os nomes não encontrados (até 40) e devolve até três cartas parecidas para cada um. `src/lib/suggest.ts` compara o nome normalizado com todos os nomes do banco (inglês, português e faces, os mesmos da busca), guardados na memória do Worker por até uma hora: o mesmo nome (a linha pediu ficha e o nome é de carta), o começo do nome até o fim de uma palavra ("Liesa"), erros de digitação no nome inteiro (Damerau-Levenshtein, até 1, 2 ou 3 erros conforme o tamanho), o começo no meio de uma palavra, todas as palavras dentro do nome ("Rescue Beastie") e o começo com um erro ("Leisa Shroud"), nessa ordem, a carta mais jogada no EDHREC primeiro. Cada sugestão é um botão: a carta entra no pedido com a quantidade da linha e o nome é corrigido na lista colada (`renameInList`), sem mexer no resto da linha.
- **Filtro pela legenda.** Cada linha da legenda do resumo ("Reescrita em português", "Em inglês: …") virou um botão que mostra na prova só as cartas daquele resultado, para achar num deck de 100 as três que saíram em inglês. As folhas filtradas dizem "Filtro", e o PDF continua com todas.

`order.ts` fica fora de `model.ts` de propósito: `model.ts` entra no resumo do código que desenha (`scripts/codigo.ts`), e mudar o pedido não pode invalidar as cartas já montadas no servidor (ADR 0022).

## Consequências

- O pedido sobrevive a recarregar, fechar a aba e reiniciar o navegador, sem conta e sem nada no servidor.
- O link leva o pedido inteiro, com artes, quantidades, fichas e a imagem em PT; quem abre recebe as cartas com os dados do dia (uma tradução corrigida depois chega a quem abre o link).
- O pedido guardado é texto legível: a pessoa pode copiar do `localStorage` ou do link e colar em outro lugar.
- A primeira sugestão de nomes num Worker novo lê os 34 mil nomes do D1 (uns 3 MB); as seguintes, por uma hora, usam a memória. Cada nome leva uns 20 ms de CPU.
- O link não guarda a escolha de papel, de corte e de qualidade: são do navegador de quem imprime.

## Alternativas descartadas

- **Guardar o pedido no servidor com um código curto** (como um encurtador): exige guardar dados da pessoa e apagar os velhos; o link com o pedido dentro não depende de nada no servidor e nunca expira.
- **Guardar as entradas inteiras (JSON com as cartas e as impressões) no navegador**: dezenas de KB por deck, com o texto em PT congelado no dia; uma correção da tradução não chegaria ao pedido guardado.
- **Busca aproximada no D1 (FTS5 com trigramas)**: pede uma tabela nova, maior que a de cartas, e uma migração; o D1 não tem distância de edição. A lista de nomes cabe na memória do Worker e a comparação é rápida.
- **Sugerir no navegador, baixando todos os nomes**: uns 700 KB comprimidos para quem errou um nome; no Worker, só os três nomes de cada sugestão viajam.
