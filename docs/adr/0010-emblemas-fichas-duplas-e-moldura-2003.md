# ADR 0010: Emblemas, fichas de duas faces e a moldura de ficha de 2003

- Status: aceito
- Data: 17/11/2026
- Completa o [ADR 0009](0009-fichas.md)

## Contexto

O ADR 0009 deixou de fora três coisas: os emblemas dos planeswalkers, as fichas de duas faces (as folhas "Vampiro // Tesouro" que vêm nos decks prontos e promocionais) e as fichas na moldura de 2003 a 2014. O João pediu as três.

## Decisão

### Emblemas

O Arena não tem os emblemas de papel (os emblemas dele são outros, só do digital), e o Scryfall não tem impressões de emblema em português. Mas o texto do emblema já está, oficial, no planeswalker que o cria: "Você recebe um emblema com "…"". O pipeline:

- liga a carta ao emblema pelo `all_parts` do Scryfall (o emblema aparece como `combo_piece`, reconhecido pelo tipo "Emblem");
- tira o trecho entre aspas do texto oficial em PT do planeswalker (Arena ou impressão). Se houver mais de um emblema na mesma face, não escolhe: fica sem PT;
- quando são duas habilidades ("…" e "…"), põe uma por linha; o ponto final, que no PT fica fora das aspas, volta para o fim da frase (menos quando a frase já fecha com aspas simples, como no emblema da Arlinn);
- na faixa do nome vai o nome em PT do planeswalker, como nos emblemas impressos mais novos (os da Core Set 2021, por exemplo), que trazem o nome dele. Os mais antigos (Vraska de GRN, Wrenn and Six de MH1) têm só a palavra "Emblem" ali, mas o Scryfall chama todos de "Vraska Emblem". O motor mede a largura do título impresso e compara com a das duas leituras escritas na mesma letra (`emblemTitle`, `titleIsEmblemWord`): quando ela é a da palavra, escreve "Emblema"; o tipo é "Emblema" ou "Emblema — Chandra" (o subtipo vem do tipo em PT do planeswalker);
- o texto segue o alinhamento do inglês: alguns emblemas têm as linhas centradas (Domri e Basri), e o motor mede a borda esquerda e o meio de cada linha em inglês antes de apagar (`textCentered`). Com as bordas esquerdas espalhadas e os meios juntos, o português sai centrado. Uma linha só em inglês conta como centrada quando começa bem depois da margem e o meio dela cai no meio da caixa (Wrenn and Seven, INR); e o português de uma linha só sai centrado, como nas fichas;
- na lista e na busca o emblema aparece como "Emblema — Chandra, Chama da Rebeldia".

Nada é traduzido: "Emblema" e "Ficha" são as palavras que as próprias cartas em PT usam. O emblema usa a moldura de ficha de 2015; o de 2003 tem outro desenho e fica de fora.

### Fichas de duas faces

Cada face é uma ficha que já existe sozinha (o Vampiro 1/1 com vínculo com a vida, o Tesouro). Em vez de um tipo novo de carta, cada face vira mais uma **arte** da ficha equivalente, casada pela mesma chave do ADR 0009 e pelas cores (`token_face_key`): sem as cores, o Vampiro branco de uma ficha de duas faces virava arte do Vampiro branco e preto, e o Zumbi preto, arte do Zumbi encantamento. A face de trás tem o id `<id do Scryfall>#1`, e `printImage` (`src/engine/types.ts`) baixa a imagem do verso. Uma carta que cria a ficha de duas faces passa a sugerir as duas fichas.

### Moldura de 2003

A barra de tipo e a caixa são iguais às de 2015, e a busca pelos dois fios funciona sem mudança. Muda o nome: uma placa escura de pontas arredondadas, com a largura do nome em inglês, letras douradas em serifa. O motor (`findPlaque2003`) acha a placa andando do centro para os lados enquanto a cor de fundo dela aparece entre as letras e, ao lado de arte escura, pelo fim do filete dourado (ADR 0011), repinta o miolo linha a linha com essa cor e escreve o nome em PT em versalete, na cor média das letras douradas, com a MPlantin em negrito. A caixa de P/R é um pouco mais à esquerda.

Emblemas e fichas sem P/R (Tesouro, Sangue) não têm a caixa de P/R, então o canto de baixo da caixa de texto é apagado como o resto (`tokenPtBox`); protegê-lo deixava o fim do texto em inglês aparecendo ali.

Também entram na moldura de 2015 as fichas lendárias, de encantamento, neve, invertidas e com arte estendida (o lugar do texto é o mesmo).

### "Ficha" nas lendárias

Algumas fichas do Arena vêm sem "Token" no tipo em inglês e, por isso, sem "Ficha" no PT. O próprio Arena escreve "Token Legendary Creature" como "Criatura Lendária Ficha", então o pipeline acrescenta "Ficha" no fim do tipo quando falta.

## Consequências

- 89 emblemas, 73 com texto em PT; 28 fichas de duas faces, 43 faces casadas com fichas conhecidas; cerca de 285 fichas a mais na moldura de 2003.
- Sem a placa (filete apagado, desenho diferente) ou sem a barra, a ficha sai como está, em inglês, com a etiqueta de sempre.
- O id com `#1` é só do Proxinho: quem lê o banco precisa tirar o sufixo para chegar ao Scryfall.
