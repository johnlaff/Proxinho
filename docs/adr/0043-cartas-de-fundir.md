# ADR 0043: A frente das cartas de fundir (meld)

- Status: aceito
- Data: 26/11/2026
- Complementa: ADR 0007 (cartas de duas faces), ADR 0018 (lembretes das cartas impressas)

## Contexto

As cartas de fundir (meld) nasceram em Eldritch Moon (2016) e voltaram em The Brothers' War (2022), em Final Fantasy (2025) e em Innistrad Remastered: duas cartas que, juntas no campo, viram uma terceira, impressa nos dois versos (metade em cada). O Scryfall as marca com o layout `meld`, e o pipeline só aceitava o `normal` e os de duas faces: as 14 frentes saíam na original, em inglês. As 7 cartas fundidas (Brisela, Chittering Host, Urza, Planeswalker…) são outra coisa: a imagem do Scryfall junta os dois versos numa carta só.

A frente é a moldura da carta comum com o que a das cartas de transformar tem: o ícone à esquerda do nome (o círculo, ou a lua com o Eldrazi em Eldritch Moon) e, no pé da caixa, em cinza, o P/R da carta fundida ("9/10" na Bruna, a Luz Desvanecente, EMN 15). O Proxyshop faz o mesmo: trata a carta de fundir como a de transformar, com o ícone e o P/R do outro lado.

Nos dados havia dois erros:

- O Arena liga a cada carta de fundir as outras partes e a carta fundida (`linkedFaces`): a Bruna ficava com a face da Brisela, e o nome de quatro cartas saía junto com o da fundida ("Fang, l’Cie Destemida // Ragnarok, Salvação Divina"; "Urza, Planeswalker // Urza, Lorde Protetor // As Pedras de Força e de Fraqueza").
- O Arena tira o lembrete "(Melds with Gisela, the Broken Blade.)", que o Oracle e a carta impressa trazem numa linha própria.

## Decisão

**Pipeline.** `meld_supported`: moldura atual, layout `meld`, borda preta, sem efeito além da coroa de lendária, do ícone de Eldritch Moon e da arte estendida, e não a carta fundida (`is_meld_result`, pelas partes que o Scryfall lista). `own_faces` deixa só a face da própria carta, no texto e no nome. `add_meld_data` põe na face o P/R da carta fundida (`meld_pt`, quando ela é criatura: a frente do Urza, Lorde Protetor, não imprime nada) e o lembrete "(Funde-se com …)" das impressas em PT, quando o Oracle o traz e o texto do Arena não. Sem impressa em PT o lembrete não é montado (Fang, l’Cie Destemida: FIN 99).

**Motor.** Pelo caminho da carta comum em `renderCard`: o ícone à esquerda do nome (`hasLeftIcon`, como nas de duas faces) e o P/R da carta fundida no lugar do do verso (`backPt`), apagado e escrito como o das cartas de transformar. O "*" do P/R sai como a estrela da carta impressa ("★/★" na Titânia, Voz de Gaia: BRO 193), desenhada (`starPoints`): o asterisco da Beleren é pequeno e alto, e lia-se só a barra e um pingo.

## Regressão

As 34 impressões das frentes (EMN, BRO, INR, V17, FIN e as promos de pré-estreia de EMN e BRO), montadas com o código desta árvore e conferidas na folha de contato: o ícone e o nome, o P/R da carta fundida e o lembrete no pé da caixa (Mishra, Tomado por Gix: BRO 216; Ameias de Hanweir, um terreno com o P/R da fundida: EMN 204). A regressão de sempre (ADR 0027) ganha o grupo "fundir (meld)". As outras cartas de duas faces passam pelo mesmo código do P/R do verso: a estrela só muda o "*", que nenhuma delas tinha na amostra.

## Consequências

- As frentes das 14 cartas de fundir saem em PT, com o lembrete da impressa nas 6 que o trazem.
- O nome das cartas de fundir na busca e na lista é o da própria carta.
- As cartas fundidas, as sem borda (Secret Lair, FIN) e as de vitrine continuam na original.
