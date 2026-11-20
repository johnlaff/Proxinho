# ADR 0018: lembretes de palavra-chave das cartas impressas

- Status: aceito
- Data: 20/11/2026
- Complementa: ADR 0002 (fontes do texto em português) e ADR 0016 (Saga)

## Contexto

O texto do Arena não traz os lembretes entre parênteses das palavras-chave ("Arregimentar Orcs 1." sem "(Coloque um marcador +1/+1 em um Exército…)"). A carta física traz, e o João comparou o Livro de Mazarbul montado com a carta na mão: faltava a explicação do capítulo I.

Em 19/11 ele tinha recusado pôr o lembrete em toda carta com a palavra (a vigilância do Spock de Star Trek: uma versão em inglês tem o lembrete e a outra não, e o lembrete em todas deixaria a proxy diferente da física). O critério dele é a carta física. O Oracle do Scryfall traz o lembrete onde a Wizards o imprime hoje (o Book of Mazarbul tem, o Spock não), então segue a carta física na maior parte das artes.

Das faces com texto do Arena, 5.468 têm lembrete no Oracle e 5.295 vêm sem ele.

## Decisão

O lembrete entra onde o Oracle o traz, com o texto oficial das cartas impressas em português, nunca traduzido nem montado:

- `printed_reminders` casa, linha a linha, o Oracle e o texto impresso em PT de cada face: as duas com o mesmo número de linhas, cada linha acabando num lembrete só, com os mesmos números e símbolos no lembrete e no resto da linha ("+1/+1", "0/0", "{2}{W}"). Lembrete do Scryfall com erro de digitação (letra repetida no começo, sem o ponto final que o inglês tem) fica de fora (`ends_like`).
- `reminder_texts` junta os pares de todas as impressões em PT desde o Magic 2010 (antes, "jogar" e "remova do jogo") e fica com o texto da mais nova. São dois mapas: por grupo de tipo (`type_group`: o lembrete diz "ela" da criatura e "ele" do artefato) e por carta (o texto impresso da própria carta, que ganha dos outros, `face_reminders`).
- `add_reminders` põe o lembrete no fim da linha do texto do Arena, só quando as linhas batem uma a uma com o Oracle, a linha em PT tem os mesmos números e símbolos da linha em inglês e ainda não tem parênteses.

O motor já escreve o que está entre parênteses em itálico, como na carta impressa.

## Consequências

- 3.933 faces de 3.879 cartas ganham o lembrete (1.121 lembretes em inglês com texto oficial em PT), entre elas o "Arregimentar Orcs 1." do Livro de Mazarbul, o Tesouro, a Comida, o vigiar, a recapitular e o lembrete da Aventura ("Depois, exile este card…").
- As mecânicas que nunca saíram impressas em PT (a Wizards parou em 2024, depois de Modern Horizons 3: station, warp, max speed, gift) ficam sem lembrete, como antes.
- Uma arte antiga, impressa antes de o lembrete existir, sai com ele. É o mesmo texto da carta física atual.
- O texto fica mais comprido e a letra encolhe nas cartas mais cheias, como na carta impressa em PT.
