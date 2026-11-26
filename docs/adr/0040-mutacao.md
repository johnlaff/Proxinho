# ADR 0040: Moldura da Mutação

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0011 (medidas na imagem), ADR 0018 (lembretes de palavra-chave) e ADR 0020 (a caixa translúcida das naves)

## Contexto

As 34 criaturas com Mutação (Mutate) nasceram em Ikoria (2020) e voltaram nos decks de Commander de Ikoria, Dominaria United e March of the Machine, numa promo do Ano do Tigre e na The List. O Scryfall as marca com o layout `mutate`, e o pipeline só aceitava o layout `normal`: todas saíam na original, em inglês.

A caixa de texto é a da carta comum, partida em duas. No alto, uma faixa translúcida, com a arte aparecendo por trás, leva a linha da Mutação com o lembrete ("Mutate {1}{G}{G} (If you cast this spell for its mutate cost…)"); embaixo de um fio escuro, em y ≈ 784 nas 59 impressões de papel (escala de 745 × 1040), com uma sombra de uns 4 px em cima dele, vem o papel de sempre, com o resto do texto centralizado na altura. A faixa tem a mesma altura em todas as cartas, em inglês e em PT: na impressa em PT o lembrete ocupa 5 linhas em vez de 4, e a letra da carta inteira é menor, a mesma nas duas partes (Gemrazer, IKO 155; Huntmaster Liger, IKO 16).

São 59 impressões de papel na moldura comum (IKO, as promos de pré-estreia e do pacote de promoções, C20, DMC, MOC, PL22 e The List). As de vitrine de Ikoria, as de Godzilla (sem borda) e as de Fallout (vitrine) têm a caixa de outro desenho; as do MTGO e as do Alchemy são digitais e já ficam de fora do banco.

Nos dados havia três erros que a moldura deixava à vista:

- O Glowstone Recluse e o Sawtusk Demolisher vêm sem o nome da palavra-chave: "{3}{G}" no Arena e "{3}{G} (Se você conjurar…)" no texto impresso do Scryfall, com "Mutação" na carta impressa (IKO 156, conferida na imagem).
- O Dirge Bat vinha sem o lembrete da Mutação que a carta física traz: o Oracle tem "Flash" e "Flying" em linhas separadas, o Arena junta as duas ("Lampejo, voar"), e as linhas deixavam de bater uma a uma (`add_reminders`, ADR 0018). O mesmo acontecia em outras 19 cartas, com outras palavras-chave.

## Decisão

**Pipeline.** `mutate_supported`: `frame` 2015, layout `mutate`, borda preta, sem efeito além da coroa de lendária, sem `full_art`, sem moldura desenhada nem arte atrás da caixa. `restore_cost_keyword` põe o nome da palavra-chave (`COST_KEYWORDS_PT`, hoje só "Mutação") na frente da linha em PT que é só o custo dela, com o lembrete ou sem, quando o Oracle tem a palavra-chave com esse custo; uma habilidade ativada ("{2}, {T}: …") nunca casa. `add_reminders`, quando as linhas não batem, junta as linhas seguidas do Oracle que são só uma palavra-chave (`join_keyword_lines`: "Flash" e "Flying" viram "Flash, flying") e tenta de novo.

**Motor** (`mutate.ts`, no caminho da carta comum em `renderCard`):

- **O fio** é medido na imagem (`mutateRule`): a linha mais escura entre y 776 e 796, ao menos 35 tons abaixo do papel logo depois dela e 20 abaixo da faixa antes da sombra, com o papel claro (mediana de 190 ou mais). As linhas da sombra bem mais escuras que a faixa contam como fio. Sem ele, ou sem "Mutação {" na frente do texto em PT (`mutateText`), a carta sai na original.
- **O papel** abaixo do fio é a caixa medida de sempre (`insideBoxSides`), com o apagamento, a proteção do selo e da caixa de P/R e o alinhamento medido (`measureCentered`) da carta comum.
- **A faixa** é translúcida e a letra é escura: a máscara é a das naves com Posicionar (ADR 0020: sem o limiar por ladrilho e sem as manchas grandes de arte sem tinta, `inkOnly`), e a rede neural refaz a arte por baixo das letras, num quadro só, reduzido (a faixa tem 128 px de altura e cabe com folga). Sem a rede neural, a carta sai na original (`reason: "neural"`).
- **O texto**: a linha da Mutação vai na faixa e o resto no papel, cada um centralizado na altura do seu espaço, com a mesma letra, a maior em que os dois cabem (`fitRows`), como na impressa em PT. Nenhuma criatura com Mutação na moldura comum tem flavor.

## Regressão

As 59 impressões, montadas com o código desta árvore e conferidas na folha de contato e no zoom (a faixa limpa, sem fantasma das letras em inglês, a arte por trás intacta, o fio e a sombra no lugar, e o papel). A regressão de sempre (ADR 0027) ganha o grupo "mutacao". Nenhuma outra moldura passa pelo código novo; as 20 cartas com o lembrete novo mudam só de texto.

## Consequências

- As criaturas com Mutação da moldura comum saem em PT, com a faixa da Mutação refeita pela rede neural.
- O Glowstone Recluse e o Sawtusk Demolisher ganham o "Mutação" que faltava, e o Dirge Bat e outras 19 cartas, o lembrete oficial que a carta física traz, em todas as molduras.
- As de vitrine, as de Godzilla e as de Fallout continuam na original, até terem as medidas delas.
