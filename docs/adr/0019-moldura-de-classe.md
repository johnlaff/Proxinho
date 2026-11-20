# ADR 0019: moldura de Classe

- Status: aceito
- Data: 20/11/2026
- Complementa: ADR 0016 (Saga) e ADR 0018 (lembretes das cartas impressas)

## Contexto

As Classes saíam com a imagem oficial em português, quando existia, ou em inglês. Das 28 Classes com texto oficial em PT, 15 não têm imagem em PT nenhuma: as de Bloomburrow e das Tartarugas Ninja, que saíram depois de a Wizards parar de imprimir em português.

A moldura de Classe (desde Adventures in the Forgotten Realms, 2021) é a Saga espelhada: a arte à esquerda e uma coluna de texto à direita, com a barra de tipo no pé. No alto da coluna vem o lembrete "(Gain the next level as a sorcery to add its ability.)", numa caixa de altura fixa, com um fio fino embaixo (y ≈ 206 em todas). Depois vêm a habilidade do nível 1 e uma barra por nível: uma linha preta na largura toda da coluna, com um chanfro em "v" no meio, e um degradê cinza de uns 48 px, com o custo à esquerda e "Level 2" à direita. A linha preta passa pelo bisel cinza da moldura, até o fio da direita.

Na carta impressa em PT o lembrete ocupa três linhas na mesma caixa, e as barras mudam de lugar quando o texto em PT de um nível cresce mais que o dos outros (Classe: Ladino).

O Arena traz as habilidades e as linhas "{2}{U}: Nível 2" sem o lembrete do alto. Na Classe: Ladino ele traz também uma linha "CLASSLEVEL [3] […]", um modelo interno que repete a habilidade do nível 3. O texto impresso em PT do Scryfall traz linhas "//Level_2//" entre a barra e a habilidade.

O Proxyshop (`ClassMod`) monta a Classe a partir do próprio modelo: encolhe as habilidades até caberem (`scale_text_layers_to_height`), espalha-as com a mesma folga (`spread_layers_over_reference`) e põe uma barra entre cada duas (`position_dividers`).

## Decisão

**Pipeline.** `class_supported` marca a moldura padrão: `frame` 2015, layout `class`, borda preta, efeitos só de lendária e de encantamento (as das Tartarugas Ninja têm o brilho de encantamento), sem `full_art`. Ficam de fora as sem borda (pôster e Secret Lair) e as promos de loja com relevo: o "&" de D&D em alto-relevo atravessa a coluna, as barras que mudam de lugar levavam pedaços dele e o resto ficava pela metade no papel apagado.

- O lembrete do alto vem das Classes impressas em PT, como o das Sagas: `top_reminders` (antes `saga_reminders`) junta os lembretes da primeira linha das Sagas e das Classes impressas, e `top_reminder` (antes `saga_reminder`) o põe no alto do texto do Arena. Só entra lembrete idêntico ao de uma carta impressa, nunca montado.
- `is_arena_marker` tira o "CLASSLEVEL […]" junto com os marcadores "#…" do Arena, e `drop_level_marks` tira as linhas "//Level_N//" do texto impresso.

**Motor** (`src/engine/classCard.ts`). Nome, tipo e símbolo da coleção seguem o caminho da Saga (a barra de tipo no pé, medida por `typeBarEdges`). A coluna é conferida na imagem: os fios escuros dos dois lados (`classColumn`, com o bisel), o fio fino do lembrete (`classRule`) e as linhas pretas das barras (`classBars`: 85% ou mais da coluna escura numa linha, o que letra nenhuma faz). Sem eles, ou com um número de barras diferente do de níveis no texto em PT, a carta sai na original.

- **Texto.** Todas as habilidades no mesmo corpo, o maior até 30 em que a folga entre texto e barra fica com 8 px ou mais (`classPlan`). A folga livre se divide por igual acima e abaixo de cada habilidade, como no Proxyshop e na carta impressa: cada texto fica no meio da sua faixa. O lembrete vai na caixa do alto, no corpo das habilidades ou menor (em PT ele pede três linhas, como na carta impressa).
- **Barras que mudam de lugar.** O "Level N" sai de cada barra (preenchimento linha a linha, porque o degradê muda de uma linha para outra), e a barra é recortada da imagem com o custo, do fio da esquerda até o da direita (`cutStrip`). A coluna é apagada: o lembrete e as habilidades como letras no papel, as barras inteiras. O bisel nas linhas das barras antigas volta copiado de uma linha limpa logo acima (`restoreBevel`), e as barras são coladas onde o plano pede, com as três linhas de cima e de baixo misturadas ao papel (`pasteStrip`). O "Nível N" é escrito na Beleren, alinhado à direita onde acabava o "Level N" e na altura dele (`classLabel`).

## Regressão

As 63 impressões de moldura preta com texto em PT, montadas no banco local e conferidas em folhas lado a lado com a original: todas em português. As 7 promos de loja com relevo saíam com pedaços do "&" soltos na coluna e ficaram de fora (o pipeline as marca como não suportadas); ficam 56.

## Consequências

- As Classes com texto em PT saem reescritas em qualquer arte da moldura padrão, inclusive as 15 sem imagem em PT nenhuma até aqui.
- O lembrete do alto sai com o texto oficial das Classes impressas ("(Ganhe o próximo nível como um feitiço para adicionar sua habilidade.)"), também nas Classes que nunca saíram impressas em PT: é o mesmo texto em inglês.
- Habilidades longas em PT (Classe: Druida, Classe: Feiticeiro) encolhem a letra de todas, até 18; abaixo disso a carta sai na original.
- O papel das barras antigas é refeito pelo preenchimento: em papel de grão forte, o lugar delas pode ficar um pouco mais liso que o resto da coluna.
