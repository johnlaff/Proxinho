# ADR 0021: explicações das palavras-chave pelas dicas do Arena

- Status: aceito
- Data: 20/11/2026
- Complementa: ADR 0002 (fontes do texto em português), ADR 0018 (lembretes das cartas impressas) e ADR 0020 (Posicionar)

## Contexto

A Wizards parou de imprimir cartas em português em 2024, depois de Modern Horizons 3. As mecânicas de lá para cá (Posicionar, Dobra Espacial, Cria, Preparar, Exaustão, Mobilizar, "Liguem seus motores!") nunca saíram impressas em PT, e os arquivos públicos do Arena (Untapped) não trazem os lembretes entre parênteses. Com o ADR 0018 elas ficavam sem a explicação que a carta física em inglês tem: nas naves, o "Posicionar" sozinho numa linha.

O Arena mostra, ao lado da carta, a explicação de cada palavra-chave (a "dica"), com tradução oficial. Ela fica no banco da interface do jogo instalado, `Raw_ClientLocalization_*.mtga` (um SQLite, tabela `Loc`, chaves `AbilityHanger/…`, colunas `enUS` e `ptBR`). A regra do projeto era "nada extraído do cliente do Arena". Em 20/11/2026 o João perguntou por que não usar o texto oficial do jogo, aprovou usar o arquivo da instalação dele, fora do repositório público e com a regra mudada num ADR ("Sim, mando o arquivo"), mandou a instalação inteira e escolheu "Sim, em todas as novas": as palavras-chave novas ganham a explicação do Arena, só onde a carta física tem.

O banco tem 1.099 dicas com inglês e português (versão do cliente 2026.65). A dica não é o lembrete da carta palavra por palavra: às vezes muda a ordem ("Put charge counters on this Spacecraft equal to its power" contra "…equal to its power on this Spacecraft" na carta), tem variáveis no lugar do número e do custo ("{chargeRequirement}", "{abilityCost}"), fala da carta por "it" onde a carta diz "this creature", escreve os símbolos do jeito do Arena ("{o2}", "o2") ou começa por "To manifest dread," onde a carta vai direto ao ponto. E há dicas com a tradução errada: a do Enweb e a do Web-slinging sem o "virada" de "return a tapped creature"; a do Mayhem do terreno com "conjurar", e terreno se joga.

## Decisão

- `python3 data/pipeline/build.py --dicas <Raw_ClientLocalization_*.mtga>` lê o banco só para leitura (`extract_hints`) e grava as dicas em `data/cache/arena_dicas.json` (chave, inglês, português). O banco e o JSON ficam fora do repositório. A cópia para o pipeline diário fica no KV do Proxinho (binding `FONTES`, chave `arena-dicas.json`), ao lado das fontes; o Worker só serve os nomes de `FONT_FILES`, então ela não sai pela API.
- `hint_reminder` usa a dica só quando ela diz o mesmo que o lembrete do Oracle. Os símbolos do Arena viram os do Oracle (`hint_text`). As duas são comparadas na mesma ordem (`_hint_fill_ordered`): fora as variáveis, que recebem o custo (símbolos de mana) ou o número (algarismos) do lembrete, só pode mudar o jeito de falar da própria carta ("this creature" e "it", "his" e "its") e a palavra "token" (o que se cria é sempre uma ficha). Sem casar assim, vale a mesma comparação com as palavras em outra ordem, com variáveis só de número (`_hint_fill_bag`, a do Posicionar). A dica que começa por "To manifest dread," vale para o lembrete sem esse começo, e a dica em PT perde o "Para Manifestar Pavor," dela. O ponto final do lembrete volta, o ")" a mais no fim da dica do Ninjutsu sai e dica em PT igual à em inglês (não traduzida, a do Discover N) fica de fora. Número por extenso na carta ("two") não casa com o `{numeral}`: a dica sairia "2" onde o impresso diz "duas".
- O "it" da carta só vira o "esta criatura" da dica quando é a própria carta (`refers_to_self`): a linha é só a palavra-chave ("Wither", "Flying, wither") ou acaba com a carta fazendo algo ("This creature enters prepared.", "Tam becomes prepared."). No Stalactite Dagger o "it" do Changeling é a ficha, e no Aegis of the Legion o do Mentor é a criatura equipada. Por isso as dicas valem por carta (`arena_reminders` devolve um mapa por `oracle_id`), e o mesmo lembrete pode entrar numa e não noutra.
- O texto impresso em PT ganha: a dica entra só no lembrete que nenhuma carta impressa traz (ADR 0018), e nunca por cima do texto impresso da própria carta.
- As dicas com a tradução errada ficam em `HINT_SKIP`, com o motivo.
- Na revisão apareceu um defeito do ADR 0018: o Oracle muda o lembrete com o tempo e a carta impressa fica com o antigo. O atropelar do Groundshaker Sliver (M14), "Se um Fractius que você controla…", ia para as outras cartas com o lembrete de atropelar de hoje; o toque mortífero antigo ("Você pode dividir o dano de combate…") ia para as cartas com o de hoje. `says_all` só deixa o impresso ir para as outras cartas quando ele tem pelo menos as frases do Oracle e não passa de 1,85 vez o tamanho dele. A própria carta continua com o texto da impressão dela, que é o da carta física.

Cada um dos 164 lembretes que entram pelas dicas foi lido ao lado do inglês da carta.

## Consequências

- 164 lembretes em inglês ganham o texto oficial em PT do Arena, em 643 cartas (632 de papel): o Posicionar das naves e planetas, Preparar (61 cartas de Secrets of Strixhaven), "Liguem seus motores!" (39), Exaustão (33), Dobra Espacial (29), Definhar (29), Bushido (26), Manifestar Pavor (22), Cria (20), Mobilizar 1, Contemplar, Presentear, Forragear, Estragar e outros.
- Nas naves, o alto da caixa volta a ter a explicação, como na carta física, e as faixas dos níveis descem para dar lugar a ela.
- A regra do `AGENTS.md` muda: nada é extraído do cliente do Arena, salvo as dicas das palavras-chave do arquivo da instalação do João, fora do repositório.
- A carta de outra coleção com a mesma palavra-chave e outro número por extenso ("Mobilize 2", "Empower Jace two") segue sem a explicação.
- Quando o Arena mudar uma dica ou ganhar uma mecânica nova, o JSON é gravado de novo com `--dicas` e posto no KV (ver `docs/operacao.md`). Sem ele, o pipeline roda igual e só essas explicações ficam de fora.
- Os termos do Arena proíbem engenharia reversa do programa. Ler um banco SQLite da própria instalação não é isso, mas é conteúdo do cliente: a tabela de riscos de `docs/pesquisa.md` diz o que mudou, e o uso deve ser revisto antes de abrir o site ao público.
