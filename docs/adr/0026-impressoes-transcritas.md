# ADR 0026: texto das impressões em PT que o Scryfall tem só na imagem

- Status: aceito
- Data: 25/11/2026
- Completa: ADR 0002 (as fontes do texto oficial) e ADR 0025 (o que faltava nela)

## Contexto

O Scryfall preenche o nome, o tipo e o texto impressos de quase todas as impressões em português. Em 87, não: as 86 de Dragon's Maze (2013) e a Sewers of Estark da promo dos livros da HarperPrism (PHPR 2) têm a imagem da carta em PT, mas os campos vêm vazios. Sem o texto, a carta não contava como traduzida (`printed_has_text`): saía na imagem oficial ou, numa arte em inglês, com a tradução não oficial (ADR 0025), mesmo com o texto oficial impresso na carta. No Moa do Bico de Bronze o Scryfall tem até o nome, mas errado ("Mao do Bico de Bronze").

## Decisão

**Transcrever a carta da imagem, uma vez, e guardar no repositório.** `data/traducao/transcritas.json` tem, por "coleção/número", o nome em inglês (para conferir a carta), o texto do Oracle de quando ela foi transcrita e o que a carta traz escrito, nos campos do Scryfall (`printed_name`, `printed_type_line`, `printed_text`, `flavor_text`): uma linha por habilidade, as aspas e a assinatura do flavor como na carta. Cada carta foi lida na imagem ampliada e conferida.

`transcribe` põe esses campos na impressão ao ler o cache do Scryfall (`read_printed_pt`), antes de tudo. Daí em diante a carta segue o caminho de qualquer impressão em PT: a escolha da impressão do texto (`pick_printed`), as faces (`printed_faces`), a fonte `impresso`, o nome em PT, o flavor, os lembretes de palavra-chave que as outras cartas tiram dela (ADR 0018) e as linhas oficiais em que a tradução não oficial se apoia (ADR 0025).

- A entrada só vale para a carta de mesmo nome naquela coleção e número, e deixa de valer quando o Scryfall trouxer o tipo ou o texto; o pipeline avisa as entradas que não valem mais. O nome transcrito ganha do Scryfall.
- A carta é copiada como está: com o texto de 2013 ("coloque no campo de batalha uma ficha", "à sua reserva de mana", "custo de mana convertido") e com os erros dela. O Herdeiro de Vitu-Ghazi cria a Ave sem "com voar", a Primeira-espada Viashino dá +2/+2 à "criatura alvo" em vez de a si mesma e o Ceifar Intelecto diz "Para cara card". É o que a carta física diz, como nas outras impressões em PT.
- Um teste do pipeline confere cada texto transcrito contra o do Oracle: os mesmos símbolos, números e "X".
- A Sewers of Estark (1995) traz as regras daquele tempo ("baixe antes da defesa ter sido escolhida"), que não dizem o que a carta faz hoje: entra só o nome, "Esgotos de Estark", e o texto segue com a tradução não oficial.

## Consequências

- 86 cartas passam da tradução não oficial ao texto oficial impresso. Nas legais no Commander, o texto oficial vai de 83,8% para 84,0%; a cobertura em PT não muda (94,1% no total, 99,8% no Commander), porque elas já saíam com a tradução não oficial.
- As linhas delas viram linhas oficiais para a tradução não oficial: o Vampiric Feast, o Whim of Volrath e o Young Deathclaws trocaram uma linha traduzida pela oficial igual (o Young Deathclaws ganhou junto a explicação da necrofagia, que o Oracle dele traz).
- Impressão em PT nova que apareça no Scryfall só com a imagem entra no arquivo do mesmo jeito: transcrita, conferida e testada.

## Alternativas descartadas

- **Reconhecimento de texto automático (OCR)**: a imagem é de baixa resolução, com a marca-d'água da guilda atrás do texto; o reconhecimento erra acentos e símbolos de mana, e o erro passaria por texto oficial. São 87 cartas, transcritas uma vez.
- **Seguir com a tradução não oficial**: o texto oficial existe, na carta; a regra é o oficial primeiro.
- **Corrigir os erros da carta impressa**: seria trocar o texto oficial por um nosso, o que a tradução não oficial já faz quando não há outro. A carta sai como a física.
