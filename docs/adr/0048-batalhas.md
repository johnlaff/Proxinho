# ADR 0048: A frente das batalhas

- Status: aceito
- Data: 27/11/2026
- Complementa: ADR 0007 (duas faces), ADR 0011 (medidas na imagem) e ADR 0033 (a carta deitada das Salas)

## Contexto

As batalhas são o tipo de permanente de March of the Machine (2023): a frente é a batalha, com a defesa num escudo, e o verso é a carta em que ela se transforma quando é derrotada. No papel só há Cercos ("Battle — Siege"). O verso, de pé, tem a moldura das cartas de transformar e já saía em PT; a frente ficava de fora do pipeline e saía na original, em inglês. São 56 impressões de papel: 36 de MOM, 16 promos de pré-estreia (PMOM), a Invasion of Innistrad de Innistrad Remastered (INR) e 3 cartas de teste (UNK, `playtest`). Todas, salvo as de teste, são de borda preta, na mesma moldura; MOM saiu impressa em PT.

A frente é impressa deitada, como as Salas: girada 90° no sentido horário (1040 × 745 na escala-base) é uma carta de duas faces da M15 alargada. No alto, a barra do nome, com o ícone das de duas faces à esquerda e o custo no fim; a arte; a barra de tipo, com o símbolo da coleção no fim; e a caixa de texto, com o lembrete dos Cercos em itálico no alto ("(As a Siege enters, choose an opponent to protect it…)"). No canto de baixo da caixa ficam o P/R do verso, em cinza, numa ponta de papel que avança para a moldura (a ponta existe também quando o verso não tem P/R), e o escudo da defesa, uma estrela preta com o número branco e um aro claro, que avança sobre a moldura.

O Arena traz as duas faces da batalha, sem o lembrete dos Cercos, que a carta física traz e a impressa em PT também: "(Conforme um Cerco entrar no campo de batalha, escolha um oponente para protegê-lo. Você e outros podem atacá-lo. Quando ele for derrotado, exile-o e depois o conjure transformado.)". A Invasion of Alara, de texto comprido, não tem o lembrete nem em inglês.

O Proxyshop tem modelos para as batalhas desde a versão de March of the Machine (a moldura comum e a de Universes Beyond, com o modificador `BattleMod`, em que o P/R vira a defesa), que desenham a moldura do zero; aqui a moldura é a da imagem, e as medidas foram tiradas das próprias impressões.

## Decisão

**Pipeline.** `face_supported` aceita a face que é batalha: moldura atual, layout `transform`, borda preta, sem `full_art`, sem `textless`, sem moldura desenhada e sem as cartas de teste. Os efeitos aceitos (`BATTLE_EFFECTS_OK`) são os do verso, a coroa das lendárias e o fundo de encantamento (Invasion of Theros), que não mudam a frente. O lembrete do alto passa a valer também para as batalhas (`TOP_REMINDER_TYPES`): `top_reminders` tira o texto oficial das batalhas impressas em PT pelo lembrete em inglês idêntico, e `top_reminder` o põe no alto do texto do Arena, antes da primeira habilidade ("Lampejo" na Invasion of Innistrad). Sem lembrete no Oracle (Invasion of Alara), nada entra. Ficam 53 frentes de 36 cartas, com texto oficial, 35 delas com o lembrete.

**Motor** (`src/engine/battle.ts` e `renderBattle` em `render.ts`). `renderCard` manda a frente de uma carta de transformar cujo tipo é batalha para `renderBattle`, que gira a imagem para a carta deitada e trabalha nela, como as Salas; no fim, escreve o português na carta deitada e a põe de pé de novo.

- **Conferido na imagem** (`battleFrame`): a carta deitada, a barra do nome, a de tipo e a caixa claras, o fio escuro abaixo de cada barra (o pé da barra do nome sobre a arte e o fio entre a barra de tipo e a caixa) e o preto do escudo no canto de baixo. Nas 53 frentes, as barras ficam acima de 159, a caixa acima de 175, os fios abaixo de 41 e o escudo abaixo de 49; os limites são 150, 140, 150, 80 e 80. Sem as pistas, a carta sai na original.
- **A barra do nome** sai linha a linha, como o nome da M15, de x 186 (depois da curva que segue o ícone) até o custo, contado do fim (x 968) com ~38 px por símbolo e 45 nos híbridos (`battleCostLeft`); o custo fica protegido e opaco. **A barra de tipo** sai até x 620: "Battle — Siege" acaba antes de 350, e o símbolo da coleção (de 905 a 965) não é tocado. As pontas arredondadas das duas ficam com `barCapGuard`. O nome em PT começa em x 196 e o tipo em 136, como o inglês.
- **A caixa** (`battleBox`): o papel é medido do miolo para fora até a primeira coluna (ou linha) mais escura que ele, 3 px para dentro, dentro dos limites da moldura. O lado da direita é medido acima da ponta do P/R do verso. Na moldura branca, o fio em volta da caixa tem a cor do papel do lado esquerdo e a medida vai ao limite; no alto e à direita, o bisel cinza a para. O texto é encaixado de x 135 a 952 e de y 505 a 705, até o corpo 34, com o canto de baixo à direita reservado (`battleNotch`): com o P/R do verso, da ponta dele (y 595) ao pé, a partir de x 912; sem ele, só o escudo (do alto do aro, y 645, a partir de x 934).
- **O escudo da defesa** (`battleShield`): o preto da estrela é achado por enchente a partir da ponta da esquerda (x 955, y 690), com 1200 a 5000 px na escala-base (a estrela tem ~2500; mais que isso vazou para a borda preta), e protegido e opaco linha a linha, com o aro claro e o contorno em volta (6 px, num disco), até o fim da carta. As letras em inglês chegam a 4 px do aro (a vírgula de "field," na Invasion of Eldraine, MOM 113), e um retângulo do canto deixava o fim dessa linha embaixo do português.
- **O P/R do verso** é apagado na ponta de papel (de x 912 ao fim da caixa, y 599 a 636) e escrito de novo em cinza, com o "*" como estrela, pelo fim dos algarismos do inglês (x 964, centro em y 620,5), como na impressa em PT.

## Regressão

As 53 frentes de borda preta (MOM, PMOM e INR), montadas com o código desta árvore e os dados novos e conferidas na folha de contato e no zoom do canto do escudo: o nome, o tipo e o P/R do verso nas mesmas linhas do inglês (o alto das maiúsculas a 1 px do inglês nas 53), o escudo inteiro, o lembrete dos Cercos no alto, as de moldura branca, as douradas e as de artefato, e as promos de pré-estreia, de papel mais claro. Comparadas lado a lado com as impressas em PT (Invasion of Ixalan, MOM 191, e Invasion of Tarkir, MOM 149), a letra da caixa sai no mesmo tamanho. A regressão de sempre (ADR 0027), que confere o caminho das cartas de transformar e o P/R do verso de pé (`drawBackPt`, agora com o fim como argumento), rodou contra a main com o grupo novo das batalhas na amostra: 1078 faces de 1055 impressões, nenhuma mudou. Nela as frentes novas ainda saem na original, porque os dados são os do site no ar; elas são as conferidas acima.

## Consequências

- A frente das batalhas de March of the Machine, das promos de pré-estreia e de Innistrad Remastered sai em PT, com o lembrete dos Cercos das impressas em PT; o verso já saía.
- As cartas de teste (UNK) continuam de fora.
