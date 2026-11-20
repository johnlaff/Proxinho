# ADR 0017: moldura de Aventura

- Status: aceito
- Data: 20/11/2026
- Complementa: ADR 0011 (medidas na imagem) e ADR 0016 (molduras especiais)

## Contexto

As Aventuras saíam com a imagem oficial em português, quando existia, ou em inglês. Das 145 Aventuras com texto oficial em PT, 35 não têm imagem em PT nenhuma (entre elas as cidades de Final Fantasy, como Lindblum e Midgar), e as outras só saíam em PT na arte daquela impressão.

A moldura de Aventura (desde Throne of Eldraine, 2019) tem nome, tipo, custo e P/R nos lugares da M15, mas a caixa de texto é um livro aberto. Na página da esquerda vêm a barra do nome da aventura (letra branca sobre a barra escura, com o custo dela no fim), a barra do tipo ("Instant — Adventure") e as regras da aventura; na da direita, as regras e o flavor da criatura. O papel escurece em direção à lombada, numa faixa de até 100 px na página da direita. O Presságio de Tarkir: Dragonstorm (2025) tem o mesmo layout no Scryfall e as mesmas medidas, com a página da esquerda numa caixa com filete em vez do livro.

O Arena traz as duas metades como duas faces da carta (`faces[0]` a criatura, `faces[1]` a aventura), e repete o flavor da criatura nas duas.

As ferramentas que refazem a carta a partir de um modelo (Proxyshop, `AdventureMod`) têm camadas próprias para o nome, o custo, o tipo e as regras da aventura: o nome encolhe até não encostar no custo e as regras ocupam a caixa da página da esquerda, à parte da caixa principal, que é a página da direita.

## Decisão

**Pipeline.** `adventure_supported` marca a moldura de livro: `frame` 2015, layout `adventure`, borda preta, efeitos só de lendária e de encantamento, sem `full_art`, sem as promos com a arte atrás da caixa e com as duas faces. Ficam de fora as de vitrine, as de arte estendida e as sem borda, que têm outro desenho.

**Motor** (`src/engine/adventure.ts`). Nome, tipo, símbolo da coleção e P/R seguem o caminho da M15. O livro é conferido na imagem (`adventureBook`): a lombada, uma coluna mais escura que o papel dos dois lados em 70% das linhas, e a barra do tipo da aventura, 35 tons ou mais abaixo do papel da página. Dali saem o topo do papel da página da esquerda (logo abaixo da barra, ou do filete no Presságio), a coluna da lombada e o pé das páginas. Sem o livro, a carta sai na original.

- As duas barras da aventura são apagadas como as do nome e do tipo (preenchimento linha a linha, com a ponta arredondada protegida), o nome até antes do custo (`adventureCostLeft`: o custo acaba em x ≈ 356, ~31,5 px por símbolo e ~35,5 nos híbridos, desenhados maiores), e recebem o nome e o tipo em PT em letra clara, na altura medida das letras em inglês.
- A página da direita faz o papel da caixa de texto: as regras e o flavor da criatura, com a caixa de P/R protegida. A da esquerda recebe as regras da aventura. Cada página encaixa o próprio corpo, até 30, como no Proxyshop.
- **Sombra da lombada.** As páginas vão até a lombada (parando antes, as letras que chegam perto dela deixavam pingos). A máscara das letras compara cada pixel com a média em volta: na beira do retângulo, onde o papel é mais escuro, o papel virava "letra" e o remendo, mais claro, deixava um degrau na sombra. Antes de apagar, cada coluna da página é clareada até o tom da coluna mais clara (`pageShade`, `shadePage`: o percentil 60 da coluna, alisado), e a página fica com o papel por igual, como o de uma carta comum. Depois, o que não foi apagado volta exatamente como era e o remendo ganha a sombra da sua coluna. Escurecer até a coluna mais escura, a primeira versão, tirava contraste das letras longe da lombada: o {T} cinza do Midgar (FIN 286) saía da máscara e ficava.
- Do pé da página para cima, até y = 946, só sai o que se liga às letras de cima (`attachedBelow`), para a sombra do pé do livro não virar remendo claro.
- **Digitalizações claras demais.** Nas promos de pré-estreia de ELD e CLB (Chop Down, Cast Off, Ysgard's Call) o papel é quase branco e as letras brancas do nome ficam a 25 a 49 tons da barra: o apagamento não as pegava e o inglês ficava por baixo do português. Com o papel da página da esquerda a partir de 238 e menos de 52 tons entre a barra do nome e o mais claro dela, `adventureBook` desiste e a carta sai na original. As barras da aventura usam o limiar 20, mais baixo que o 28 das barras do nome e do tipo: numa barra cinza clara (Birthright Boon da pré-estreia de WOE), pontas suavizadas das letras ficavam fora da máscara e o remendo da linha saía como um risco claro atravessando o nome em PT.

## Regressão

As 270 impressões na moldura de livro com texto em PT, no banco local, montadas e conferidas em folhas de contato, lado a lado com a original: 266 em português. Saem na original a Secret Lair 2129, que tem outro desenho, e três promos de pré-estreia claras demais (Chop Down e Cast Off de ELD, Ysgard's Call de CLB); a versão da coleção de cada uma sai em PT.

## Consequências

- As Aventuras com texto em PT saem reescritas em qualquer arte da moldura de livro, inclusive as 35 sem imagem em PT nenhuma até aqui.
- O lembrete da página da esquerda ("Then exile this card…") não vem do Arena: entra o texto oficial das cartas impressas em PT ("Depois, exile este card…"), onde o Oracle o traz (ADR 0018).
- O flavor segue a regra de sempre: só na arte de onde veio o texto em PT, ou numa de mesmo flavor em inglês. Nas outras, a página da direita fica só com as regras.
