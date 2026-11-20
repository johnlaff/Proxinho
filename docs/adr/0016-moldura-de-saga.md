# ADR 0016: moldura de Saga

- Status: aceito
- Data: 20/11/2026
- Complementa: ADR 0011 (medidas na imagem) e ADR 0002 (fontes do texto em PT)

## Contexto

As Sagas saíam com a imagem oficial em português, quando existia, ou em inglês. Das 147 Sagas com texto oficial em PT, 60 não têm imagem em PT nenhuma, e as outras só saíam em PT na arte daquela impressão.

A moldura de Saga (desde Dominaria, 2018) é outra: a caixa de texto é uma coluna à esquerda da arte, com o lembrete ("(As this Saga enters…)") ou o "Read ahead" no alto e uma faixa por capítulo embaixo, separadas por fios (uma sombra de ~8 px que acaba num degrau claro). Os marcadores hexagonais com o número romano de cada capítulo ficam numa tira à esquerda, na altura do texto em inglês. A barra de tipo fica no pé da carta.

O português não cabe nas faixas do inglês: é mais longo, e o lembrete do alto e a explicação do "Adiantar leitura" não existem no Arena. Com as faixas como estão, a do alto ficava vazia e o texto dos capítulos saía em letra pequena. Sem o lembrete, os fios no lugar novo também deixavam um vazio no alto da coluna, que a carta física não tem (o João apontou no Urza's Saga e no Book of Mazarbul, 20/11).

As ferramentas que refazem a carta a partir de um modelo (Proxyshop) distribuem os capítulos pela coluna, encolhem o texto até caber, desenham os fios entre eles e alinham cada marcador ao seu texto. Aqui os marcadores são parte da imagem: mexer neles pediria redesenhar a tira dos marcadores.

## Decisão

**Pipeline.** `saga_supported` marca a moldura padrão: `frame` 2015, layout `saga`, borda preta, efeitos só de lendária e de encantamento, sem `full_art`, sem ser criatura (as Invocações de Final Fantasy têm outra moldura) e sem as sem borda e as de vitrine. O Arena traz um parágrafo por capítulo, sem o número, e repete o texto dos capítulos agrupados (o mesmo parágrafo seis vezes no Long List of the Ents). `saga_chapters` remonta "I — …", "I, II — …" com os números e os grupos do Oracle, pela ordem, e tira o travessão solto que alguns capítulos trazem ("— Procure…"). Se as contas não batem, a carta sai como está (3 cartas). O lembrete do alto vem das Sagas impressas em PT (`saga_reminders`: o texto oficial de cada lembrete em inglês do Oracle, cinco no total, como "(Conforme esta Saga entra e após sua etapa de compra, adicione um marcador de conhecimento. Sacrifique-a após III.)") e `saga_reminder` o põe antes dos capítulos; o "Adiantar leitura" sozinho do Arena ganha a explicação da carta impressa. Só entra lembrete idêntico ao de uma carta impressa, nunca montado (as Invocações com cinco capítulos ficam sem). As linhas de capítulo passam por `ability_word_lines` sem o número, para os nomes de capítulo das Invocações saírem em itálico.

**Medidas na imagem** (`src/engine/saga.ts`): o lado da arte (`sagaArtLeft`, a coluna escura em x 360 a 384), os fios (`sagaDividers`, um degrau de mais de 6 tons em duas linhas, na largura toda, depois da sombra), os números dos marcadores (`sagaNumerals`, tinta escura no meio do dourado) e a barra de tipo no pé (`typeBarEdges` de 850 a 960). Se o número de fios não bate com o de capítulos, ou a barra não está onde deve, a carta sai na original.

**Fios móveis.** Os marcadores ficam; os fios mudam de lugar. Para cada corpo, de 30 a 18, `sagaPlan` põe cada fio entre o último marcador de um capítulo e o primeiro do seguinte, com o texto de cada faixa cabendo nela, no meio do caminho entre o texto de cima e o de baixo (cada capítulo centrado nos seus marcadores). Fica o maior corpo que cabe, igual em todos os capítulos e no lembrete do alto. A curva da tira dos marcadores fica onde estava, no fio de cima original, e o texto do alto acaba 26 px antes dele (`TOP_CURVE_CLEAR`), encostado no alto da faixa (`topAligned`), como na carta impressa: o lembrete em PT, mais comprido, ia por baixo da curva. Sem texto no alto, o fio de cima sai. O fio antigo é apagado inteiro (a faixa dele entra na máscara) e o novo é desenhado com o fator de cor de um fio da própria carta (`dividerProfile`, o original dividido pela coluna já apagada), o que leva a cor da sombra de cada coleção. Sem os números, as faixas ficam como estão; se o texto não cabe, a carta sai na original.

**Apagamento.** Só as letras, sem crescer a mancha como nas cartas comuns: a marca-d'água de Dominaria atravessa as faixas, e com a mancha cada faixa levava o pedaço dela. A curva da tira dos marcadores no pé da faixa do alto é protegida linha a linha (`sagaTopFrame`): apagada como papel, virava um retângulo branco.

## Regressão

As 253 impressões de Saga suportadas com texto em PT, no banco local, montadas e conferidas uma a uma em folhas de contato:

- 241 em português. As 12 que saem na original são promos de pré-estreia digitalizadas claras demais (o fio é uma queda de 2 tons no papel quase branco); a versão da coleção de cada uma sai em PT.
- O degrau medido de uma linha para a outra deixava de fora 21 digitalizações: três de Theros (THB 53, 160 e 166) e 18 promos, em que ele se espalha por duas linhas. Medido em duas, todas entram.
- Marca-d'água inteira nas de Dominaria (redemoinho do Eldest Reborn, brasão de Benália).
- Com o lembrete em PT no alto, as mesmas 241 em PT, conferidas de novo uma a uma: o corpo dos capítulos desce um pouco nas que têm o lembrete comprido (o "Adiantar leitura" de DMU fica perto do mínimo, 18), como na carta impressa em PT.

## Consequências

- 131 das 147 Sagas com texto em PT saem reescritas em qualquer arte da moldura padrão, 44 delas sem imagem em PT nenhuma até aqui. Ficam de fora as 15 Invocações de Final Fantasy (criaturas Saga) e as Sagas sem borda e de vitrine.
- Onde o português não cobre a linha em inglês, o disco cinza de um símbolo de mana pode deixar um contorno muito fraco (~5 tons, o {0} do Urza's Saga), que não aparece na carta impressa. Crescer a mancha só nos pedaços pequenos foi testado e cortava a marca-d'água de Dominaria nas faixas com lembrete.
- O lembrete do alto sai em PT, com o texto oficial das Sagas impressas, como na carta física; só fica de fora quando nenhuma carta impressa em PT tem o mesmo lembrete em inglês.
