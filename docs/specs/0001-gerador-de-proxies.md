# Spec 0001: gerador de proxies em português

- Situação: entregue na v1.0 (17/11/2026)
- Dono do produto: João

## Objetivo

Qualquer pessoa cola a lista do deck e, em poucos minutos, baixa um PDF com as cartas no tamanho real, com nome, tipo e texto oficiais em português, sobre a arte que escolheu.

## Histórias e critérios de aceite

### H1. Colar a lista
Como jogador, quero colar a lista exportada de qualquer site para não digitar carta por carta.
- [x] Aceita "1 Nome", "1x Nome", "Nome", "1 Nome (SET) 123", "*F*", seções Commander/Comandante/Sideboard, categorias do Archidekt e nomes em português.
- [x] Ignora o maybeboard. A seção "Tokens"/"Fichas" entra como fichas (desde 17/11/2026).
- [x] Mostra os nomes não encontrados, com a quantidade, e permite ignorá-los; sugere até três nomes parecidos para cada um (desde 25/11/2026, H17).

### H2. Importar por link
- [x] Link público do Archidekt importa comandante e deck, sem o maybeboard.
- [x] Moxfield: tenta; se recusar, explica como copiar o texto.
- [x] O servidor só acessa hosts da lista.

### H3. Buscar uma carta
- [x] Autocompletar por nome em português ou inglês, sem acento, com teclado (setas, Enter, Esc).

### H4. Revisar as folhas
- [x] As cartas aparecem montadas em folhas de 9, na ordem de impressão, comandante primeiro.
- [x] Cada carta mostra coleção e número e, quando não sai reescrita, uma etiqueta em texto.
- [x] Um resumo conta quantas saem reescritas, com imagem oficial em PT ou em inglês (e por quê).
- [x] O pedido conta as cartas como o deck: a carta de duas faces conta uma vez, e as faces que vão para o papel aparecem ao lado ("100 cartas (101 faces)", desde 21/11/2026).
- [x] Enquanto a rede neural prepara uma carta, a prévia diz a etapa (baixando, com a porcentagem; preparando; apagando o inglês). Se ela travar ou falhar no navegador, a carta não fica presa: sai do jeito simples ou na original, e a gaveta diz por quê (desde 19/11/2026).
- [x] A carta que espera a rede neural aparece em português em poucos segundos (rascunho) e troca sozinha pela acabada; a prévia diz a parte e o tempo que falta ("Acabamento: parte 2 de 3, cerca de 35 s"), as outras cartas não esperam por ela, a carta aberta na gaveta passa na frente e o PDF diz qual carta está no acabamento. Quando a rede neural não roda, a etiqueta diz isso, e não que a moldura não é reescrita (ADR 0013, 19/11/2026). A gaveta diz se o acabamento roda na placa de vídeo ou no processador, e por quê (ADR 0014).

### H5. Trocar a arte e a quantidade
- [x] Tocar numa carta abre a gaveta com todas as impressões (coleção, número, ano, artista) e diz se cada uma sai em português.
- [x] A imagem oficial em português aparece como opção quando existe, com aviso de baixa resolução.
- [x] Mudar a quantidade (1 a 99), tirar do pedido e ver no tamanho real.

### H6. Baixar o PDF
- [x] A4 ou Carta; "na frente da carta" (sem sangria, opção −0,5 mm) ou "carta inteira" (com sangria).
- [x] Qualidade padrão (300 dpi) ou alta (480 dpi).
- [x] Marcas de corte, régua de 5 cm e aviso de imprimir em tamanho real em toda página.
- [x] Progresso visível; gerado no navegador, ou já pronto do servidor.
- [ ] As cartas já montadas no servidor pelo mesmo motor aparecem na hora já na primeira visita, e o PDF delas sai sem montar nada no aparelho; o que não está lá é montado no aparelho, como antes (ADR 0022; o R2 está ligado desde 21/11/2026 e o montador roda sozinho no GitHub, ADR 0023; marcar quando a primeira montagem terminar).
- [x] O PDF é montado em segundo plano enquanto a pessoa revisa (depois das prévias, com a página parada, e nada antes do clique com a economia de dados ligada), e as cartas prontas ficam guardadas no navegador para a próxima visita: num deck de 100 cartas, o PDF sai em 2 s depois de um minuto de revisão, em vez de ~1 min (ADR 0014, 19/11/2026).

### H7. Honestidade e regras
- [x] A origem do texto aparece na gaveta (Arena, impressão PT ou tradução não oficial).
- [x] Sem tradução oficial nem não oficial, a carta sai em inglês e a interface diz.
- [x] A explicação das palavras-chave (o lembrete entre parênteses) sai onde a carta física tem, ou seja, onde o Oracle traz, com o texto oficial das cartas impressas em PT; a que nunca saiu impressa em PT vem da explicação oficial que o Arena mostra ao lado da carta, quando ela diz o mesmo que a carta (ADRs 0018 e 0021).
- [x] O flavor sai em cada arte que o tem na carta física, com a tradução oficial da versão do Arena daquela arte (a fala da Sra. Margarida na Birds of Paradise da BLC; 3.878 artes desde 21/11/2026).
- [x] Se o motor não reconhece a moldura de uma impressão e ela sai na imagem original, a etiqueta, a legenda e o resumo dizem que sai em inglês.
- [x] Aviso de conteúdo de fã no site e no PDF; nenhuma marca da Wizards como marca do produto.

## Requisitos não funcionais

- WCAG 2.2 AA: contraste, foco visível, alvos de 44 px, nada só por cor, leitor de tela nas abas, busca e gaveta.
- Funciona no celular (a partir de 360 px) e no desktop.
- Primeira tela com menos de 100 KB de JavaScript comprimido além do React; o gerador de PDF carrega só quando pedido.
- Nenhum dado pessoal coletado.

## Fora do escopo da v1

Molduras além da 2015 normal (a de 2003 entrou em 21/11/2026, H14; a antiga, em 25/11/2026, H18), edição manual do texto, tradução não oficial (entrou em 21/11/2026, H15), fichas. Ver [roadmap](../roadmap.md).

Entregue depois da v1 (17/11/2026): cartas de duas faces (frente e verso lado a lado na folha e no PDF) e planeswalkers reescritos, com a caixa translúcida preenchida por rede neural (ADRs 0007 e 0008). Em 19/11/2026: artes sem borda na moldura padrão, com o nome de crossover mantido no alto e o nome em PT na linha de baixo, e a sangria do PDF com a própria arte (ADR 0012). Em 20/11/2026: Sagas na moldura padrão (ADR 0016) e Aventuras na moldura de livro (ADR 0017). Em 25/11/2026: a faixa de baixo das cartas modais em PT (ADR 0029) e as faixas dos planeswalkers do tamanho do texto em PT (ADR 0030), e a moldura antiga (ADR 0031).

### H8. Fichas (entregue em 17/11/2026, ADR 0009)
Como jogador, quero imprimir as fichas que o meu deck cria, em português, junto com as cartas.
- [x] O resumo do pedido lista as fichas que as cartas criam e ainda não estão no pedido, com P/R e cor, e adiciona uma ou todas.
- [x] A seção "Tokens"/"Fichas" da lista e a busca também adicionam fichas.
- [x] A ficha sai com nome, tipo e texto oficiais do Arena; sem tradução, sai em inglês com a etiqueta de sempre.
- [x] As fichas vão para o fim das folhas.
- [x] Emblemas dos planeswalkers entram nas sugestões, com o texto oficial tirado do planeswalker (ADR 0010).
- [x] Fichas de duas faces aparecem como artes das fichas equivalentes; fichas de 2003 saem reescritas.

### H9. Artes sem borda (entregue em 19/11/2026, ADR 0012)
Como jogador, quero usar as artes sem borda (Secret Lair, Commander, Marvel) com o texto em português.
- [x] As artes sem borda na moldura padrão saem em português; as de moldura própria, caixa clara ou arte de retícula grossa saem na original, e a etiqueta diz que saem em inglês.
- [x] A arte padrão de cada carta continua sendo a com borda; a sem borda aparece na gaveta para escolher.
- [x] Nas artes com nome de crossover (sem borda e com borda), o nome do alto fica como impresso e o nome em PT vai na linha pequena logo abaixo.
- [x] No PDF com sangria, a sangria das artes sem borda é a própria arte, sem filete preto.

### H10. Sagas (entregue em 20/11/2026, ADR 0016)
Como jogador, quero imprimir as Sagas em português na arte que eu escolher.
- [x] As Sagas na moldura padrão saem em português, com o texto de cada capítulo ao lado do seu marcador, em letra do mesmo corpo nos capítulos todos.
- [x] Os fios entre os capítulos mudam de lugar para o português caber; os marcadores não mudam.
- [x] O lembrete do alto sai em PT, com o texto oficial das Sagas impressas ("(Conforme esta Saga entra…)", "Adiantar leitura (Escolha um capítulo…)"), como na carta física; sem texto no alto, a faixa do alto sai.
- [x] A explicação das palavras-chave dos capítulos sai como na carta física ("Arregimentar Orcs 1. (Coloque um marcador +1/+1…)" no Livro de Mazarbul), com o texto oficial das cartas impressas em PT; a que nunca saiu impressa em PT fica de fora.
- [x] Quando o motor não acha os fios ou os marcadores na imagem, ou o texto não cabe, a carta sai na original e a etiqueta diz que sai em inglês.

### H11. Aventuras (entregue em 20/11/2026, ADR 0017)
Como jogador, quero imprimir as Aventuras em português na arte que eu escolher.
- [x] As Aventuras na moldura de livro (e os Presságios de TDM) saem em português: a criatura na página da direita, o nome, o tipo e as regras da aventura na da esquerda, com o custo da aventura no lugar.
- [x] A sombra do papel perto da lombada continua igual depois de apagar o inglês.
- [x] Quando o motor não acha o livro na imagem, a carta sai na original e a etiqueta diz que sai em inglês.

### H11h. Divididas da moldura antiga (entregue em 26/11/2026, ADR 0038)
Como jogador, quero imprimir as cartas divididas da moldura antiga (Fire // Ice, Life // Death, Wax // Wane e as outras de Invasion e Apocalypse) em português na arte que eu escolher.
- [x] As de borda preta saem em português: o nome e o tipo das duas metades em letras brancas com sombra, como na carta de pé da moldura antiga, e o texto de cada uma, alinhado como o inglês daquela metade.
- [x] O custo, o símbolo da coleção, os fios do alto da arte (onde o pé das letras passava) e a caixa de cada cor (com bisel, só com o fio ou de pergaminho) ficam como na carta impressa.
- [x] Sem a rede neural no navegador, ou quando o motor não reconhece a moldura na imagem, a carta sai na original, e a etiqueta diz por quê.

### H11g. Divididas da moldura de 2003 (entregue em 26/11/2026, ADR 0037)
Como jogador, quero imprimir as cartas divididas da moldura de 2003 (Crime // Punishment, Boom // Bust e as com Fundir de Dragon's Maze, como Turn // Burn) em português na arte que eu escolher.
- [x] As de borda preta saem em português: o nome e o tipo das duas metades na letra da moldura de 2003, o texto de cada uma e, nas com Fundir, a faixa do pé com o lembrete oficial.
- [x] O custo, o símbolo da coleção e a ponta arredondada das barras ficam como na carta impressa.
- [x] As promos da Friday Night Magic de 2006, com o logotipo como marca-d'água, e as que o motor não reconhece na imagem saem na original, e a etiqueta diz que saem em inglês.

### H11f. Fundir na moldura atual (entregue em 25/11/2026, ADR 0036)
Como jogador, quero imprimir as cartas com Fundir da moldura atual (Wear // Tear, Turn // Burn) em português na arte que eu escolher.
- [x] As de borda preta saem em português: o nome, o tipo e o texto das duas metades, e a faixa do pé com o lembrete oficial do Fundir.
- [x] O nome de cada metade é a parte dela do nome da carta inteira (Transformar // Queimar), também onde o Arena dá outro.
- [x] Quando o motor não acha a faixa na imagem, ou não há o lembrete oficial, a carta sai na original e a etiqueta diz que sai em inglês.

### H11e. Consequência (entregue em 25/11/2026, ADR 0035)
Como jogador, quero imprimir as cartas com Consequência (Dusk // Dawn, Commit // Memory) em português na arte que eu escolher.
- [x] As de borda preta saem em português: o nome, o tipo e o texto das duas metades, a de baixo de lado como na carta impressa, com o custo, o símbolo da coleção e o selo holográfico no lugar.
- [x] Quando o motor não acha as barras e as caixas das duas metades na imagem, a carta sai na original e a etiqueta diz que sai em inglês.

### H11d. Cartas divididas da moldura atual (entregue em 25/11/2026, ADR 0034)
Como jogador, quero imprimir as cartas divididas (Find // Finality, Fire // Ice, Expansion // Explosion) em português na arte que eu escolher.
- [x] As divididas de borda preta da moldura atual saem em português: o nome, o tipo e o texto de cada metade, com o custo e o símbolo da coleção no lugar.
- [x] Quando o motor não acha as barras e as caixas das duas metades na imagem, a carta sai na original e a etiqueta diz que sai em inglês.
- [x] As divididas impressas em PT mostram o nome em PT de cada metade, também onde o Scryfall o tem em inglês (Confusão // Bagunça).

### H11c. Salas de Duskmourn (entregue em 25/11/2026, ADR 0033)
Como jogador, quero imprimir as Salas de Duskmourn em português na arte que eu escolher.
- [x] As Salas de borda preta saem em português: o nome e o texto de cada metade, com o custo no lugar, "Encantamento — Cômodo" e o lembrete das Salas na faixa do meio, com o texto oficial da explicação do Arena.
- [x] Quando o motor não acha a moldura das Salas na imagem, ou a rede neural não roda, a carta sai na original e a etiqueta diz que sai em inglês.
- [x] O nome em PT das cartas divididas aparece uma vez só ("Armário // Porão Esquecido").

### H11b. Cartas com Preparar (entregue em 25/11/2026, ADR 0032)
Como jogador, quero imprimir as cartas com Preparar de Secrets of Strixhaven em português na arte que eu escolher.
- [x] As cartas com Preparar na moldura padrão e na de arte estendida saem em português: a criatura à esquerda do fio e o nome, o tipo e as regras da mágica preparada à direita, com o custo dela no lugar.
- [x] Quando o motor não acha o fio ou as barras da mágica na imagem, a carta sai na original e a etiqueta diz que sai em inglês.

### H12. Classes (entregue em 20/11/2026, ADR 0019)
Como jogador, quero imprimir as Classes em português na arte que eu escolher, inclusive as que nunca saíram impressas em PT.
- [x] As Classes na moldura padrão saem em português, com todas as habilidades no mesmo corpo de letra e cada uma no meio da faixa do seu nível.
- [x] As barras de nível mudam de lugar quando o texto em PT pede, com o custo e o "Nível N" no lugar do "Level N", como na Classe impressa em PT.
- [x] O lembrete do alto sai com o texto oficial das Classes impressas ("(Ganhe o próximo nível como um feitiço para adicionar sua habilidade.)").
- [x] Quando o motor não acha a coluna, o fio do lembrete ou as barras na imagem, ou o texto não cabe, a carta sai na original e a etiqueta diz que sai em inglês. As promos com o "&" de D&D em alto-relevo ficam de fora.

### H13. Naves e planetas com Posicionar (entregue em 20/11/2026, ADR 0020)
Como jogador, quero imprimir as naves e os planetas de Edge of Eternities e de Star Trek em português na arte que eu escolher, mesmo sem nenhuma impressão em PT.
- [x] As naves e os planetas na moldura padrão e na arte estendida saem em português, com o texto principal e o de cada nível no mesmo corpo de letra.
- [x] As faixas de cada nível mudam de lugar para o texto em PT, com o selo do nível e a caixa de P/R no meio da faixa, a arte por trás e o mesmo escurecimento de cada faixa da carta original.
- [x] A explicação do Posicionar, que nunca saiu impressa em PT, sai com o texto oficial da dica do Arena, como na carta física (ADR 0021), e o texto se espalha com a mesma folga em volta de cada parte, como nas artes estendidas.
- [x] Quando o motor não acha os selos, a caixa de P/R ou o pé da caixa na imagem, quando o texto não cabe ou quando a rede neural não roda, a carta sai na original e a etiqueta diz que sai em inglês. As sem borda e as de vitrine ficam de fora.

### H14. Moldura de 2003 (entregue em 21/11/2026, ADR 0024)
Como jogador, quero imprimir em português as artes da moldura de 2003 a 2014, inclusive das cartas que nunca tiveram arte na moldura atual.
- [x] As cartas normais na moldura de 2003, com borda preta ou branca, saem em português, com o texto dentro da caixa, que é mais estreita e curta que a da M15.
- [x] O nome e o tipo saem em Matrix Bold, a fonte da época, no tamanho e na altura das letras da carta impressa, começando onde começavam nas cartas da mesma época.
- [x] A ponta arredondada das barras do nome e do tipo fica como está, e o tipo começa onde começa na carta impressa.
- [x] Quando a carta tem uma arte na moldura atual, ela continua sendo a padrão; a de 2003 aparece na gaveta para escolher, e vira a padrão só quando é a única em PT.
- [x] Na moldura de 2003, a marca-d'água lisa (as das guildas, das facções, o símbolo da coleção) fica: só as letras saem, e a rede neural refaz a marca por baixo delas; sem a rede neural, a carta sai na original.
- [x] As impressões com o logotipo de uma promo como marca-d'água (FNM, Pro Tour, Junior), com efeito de moldura (lápide, milagre, cores trocadas; o céu estrelado de Theros entra, com as barras e a caixa da comum), os planeswalkers de 2003 e as promos com outro desenho (Champs and States, a Secret Lair espelhada) saem na original, e a etiqueta diz que saem em inglês.

### H15. Tradução não oficial (entregue em 21/11/2026, ADR 0025)
Como jogador, quero imprimir em português as cartas que nunca saíram em PT, sabendo que a tradução não é oficial.
- [x] A carta sem texto oficial em PT sai em português quando todas as linhas dela têm tradução: a linha que já saiu igual numa carta oficial vem igual, a que só muda nos números segue o molde da oficial e o resto foi traduzido no padrão do Arena.
- [x] O nome fica em inglês, salvo quando existe o nome impresso em PT, e não há flavor.
- [x] A carta leva a etiqueta "PT não oficial" na folha, a legenda "não oficial", "Tradução não oficial" na escolha da arte, a explicação na gaveta e a linha "Reescrita com tradução não oficial" no resumo.
- [x] Quando existe a imagem oficial em PT, ela é a escolha padrão; e quando o Arena ou uma impressão em PT trouxer a carta, o texto oficial entra no lugar sozinho.
- [x] Se falta a tradução de uma linha ou do tipo, a carta sai em inglês, como antes.

### H16. Texto das impressões em PT que só têm a imagem (entregue em 25/11/2026, ADR 0026)
Como jogador, quero o texto oficial das cartas que saíram em PT mesmo quando o Scryfall só tem a imagem delas (Dragon's Maze), em qualquer arte.
- [x] As 86 cartas de Dragon's Maze saem com o texto oficial, transcrito da imagem da carta em PT, com o nome, o tipo e o flavor dela, e a etiqueta de texto oficial.
- [x] O texto é o da carta física, com os erros dela; a carta de 1995 com as regras daquele tempo (Sewers of Estark) fica só com o nome em PT e a tradução não oficial.
- [x] Quando o Scryfall trouxer o texto, ele entra no lugar sozinho.

### H17. Pedido guardado, link do pedido e nomes parecidos (entregue em 25/11/2026, ADR 0028)
Como jogador, quero que o pedido revisado continue lá quando eu voltar, mandar o mesmo pedido a um amigo e corrigir um nome errado sem refazer a lista.
- [x] O pedido volta como estava ao recarregar ou reabrir o navegador: as cartas, as quantidades, as artes escolhidas (inclusive a imagem oficial em PT), as fichas e os nomes não encontrados, com o aviso "Seu último pedido voltou como você deixou.".
- [x] "Começar outro pedido" apaga o pedido e a lista colada, com "Desfazer".
- [x] "Copiar link do pedido" copia um link com o pedido inteiro (no celular, abre o compartilhar do sistema); quem abre recebe as mesmas cartas e artes, e a lista na aba "Colar lista". O pedido vai depois do `#` e nunca chega ao servidor. Link cortado ou alterado dá um aviso e não apaga o pedido guardado.
- [x] A linha com coleção e número acha a impressão pedida mesmo entre fichas de mesmo nome e em cartas com mais de 80 impressões.
- [x] Cada nome não encontrado mostra até três cartas parecidas ("Você quis dizer…?": erro de digitação, nome pela metade, palavras do nome); tocar numa põe a carta no pedido com a quantidade da linha e corrige o nome na lista colada.
- [x] Cada linha da legenda do resumo filtra a prova pelas cartas daquele resultado (por exemplo, só as que saem em inglês); as folhas filtradas dizem "Filtro" e o PDF continua com todas.

### H18. Moldura antiga (entregue em 25/11/2026, ADR 0031)
Como jogador, quero imprimir em português as artes da moldura antiga (Mirage a Scourge, as edições básicas de 5ª a 7ª e as reimpressões retrô), inclusive das cartas que só têm arte nela.
- [x] As cartas normais na moldura antiga, com borda preta ou branca, saem em português: o nome e o tipo em letras brancas com a sombra preta, como na carta, sobre a moldura refeita pela rede neural (sem barra pintada por cima).
- [x] O nome sai na Goudy Medieval da época, com os acentos e a cedilha do português; o tipo e as regras, na MPlantin. O texto fica centrado na altura da caixa, sem o fio do flavor, como na carta antiga.
- [x] O custo de mana e o símbolo da coleção ficam como estão, e o tipo em PT vai até o símbolo.
- [x] Quando a carta tem arte na moldura atual ou na de 2003, ela continua sendo a padrão; a antiga aparece na gaveta e vira a padrão só quando é a única em PT.
- [x] Sem a rede neural, a carta sai na original, e a etiqueta diz que o apagador de texto não rodou. O nome em PT começa depois da lápide de Odyssey a Scourge, que fica como está. As impressões com marca-d'água, os planeswalkers e a Secret Lair na moldura antiga saem na original, e a etiqueta diz que saem em inglês.

### H19. Moldura de 1993 (entregue em 26/11/2026, ADR 0039)
Como jogador, quero imprimir em português as artes da moldura de 1993 (Alpha a Alliances: as edições básicas até a 4ª, as Collectors' Editions, Arabian Nights, Antiquities, Legends, The Dark, Fallen Empires, Homelands, Ice Age, Chronicles e as promos da época), inclusive das cartas que só têm arte nela.
- [x] As cartas normais na moldura de 1993, com borda preta ou branca, saem em português, com o nome e o tipo no estilo de letra da própria carta: brancas com sombra nas molduras escuras de Revised em diante, "gravadas" (miolo cinza, contorno escuro e brilho claro) de Alpha a Unlimited, nas Collectors' Editions e nas molduras claras.
- [x] O nome sai na Goudy Medieval do tamanho do nome em inglês da carta (menor de Alpha a Revised), a partir da primeira letra dele; o tipo, na serifada do texto, até o símbolo da coleção.
- [x] O inglês sai inteiro também nas digitalizações com a retícula da impressão, sem fantasma embaixo do português, no nome, no tipo e na caixa.
- [x] A caixa apagada fica com a textura dela, sem mancha: a beira queimada do pergaminho das pretas fica como é, e o papel claro (a renda das brancas, a névoa das douradas) é refeito pela rede neural, na cor do papel.
- [x] O nome sem tradução (o da carta em inglês) fica como está. O terreno básico fica com a caixa vazia, como o texto oficial dele em PT.
- [x] Quando a carta tem arte na moldura atual, na de 2003 ou na antiga, ela continua sendo a padrão; a de 1993 vira a padrão só quando é a única em PT.
- [x] Sem a rede neural, a carta sai na original, e a etiqueta diz que o apagador de texto não rodou. As douradas do Campeonato Mundial, as promos da DragonCon e do Celebration e as impressões com marca-d'água saem na original, e a etiqueta diz que saem em inglês.

### H20. Criaturas com Mutação (entregue em 26/11/2026, ADR 0040)
Como jogador, quero imprimir em português as criaturas com Mutação de Ikoria e das reimpressões.
- [x] As criaturas com Mutação na moldura comum, de borda preta, saem em português: a linha da Mutação, com o lembrete oficial, na faixa translúcida do alto da caixa, com a arte por trás refeita pela rede neural onde estava o inglês, e o resto no papel abaixo do fio.
- [x] As duas partes saem com a mesma letra, a maior em que as duas cabem, como na carta impressa em PT; o fio e a sombra dele ficam como estão.
- [x] O Glowstone Recluse e o Sawtusk Demolisher saem com o "Mutação" que faltava nos dados, e o Dirge Bat com o lembrete da Mutação, como na carta física.
- [x] Sem a rede neural, a carta sai na original, e a etiqueta diz que o apagador de texto não rodou. As de vitrine, as de Godzilla e as de Fallout saem na original, e a etiqueta diz que saem em inglês.

### H21. Criaturas com Subir de Nível (entregue em 26/11/2026, ADR 0041)
Como jogador, quero imprimir em português as criaturas com Subir de Nível de Rise of the Eldrazi e das reimpressões.
- [x] As criaturas com Subir de Nível na moldura de 2003 e na atual, de borda preta, saem em português: o "Subir de nível" com o lembrete oficial na faixa do alto e as habilidades de cada nível na faixa dele, entre o selo e a caixa de P/R.
- [x] As três faixas saem com a mesma letra, a maior em que todas cabem, como na carta impressa em PT; as mudanças de tom entre elas, as caixas de P/R e o filete do pé da caixa ficam como estão.
- [x] Os selos dizem "NÍVEL", com o intervalo como impresso.
- [x] O Hexdrinker, que vem do Arena, sai com os níveis como o Oracle e a carta impressa.
- [x] As promos de ROE com marca-d'água, as sem borda da Secret Lair e as de Mystery Booster 2 saem na original, e a etiqueta diz que saem em inglês.

### H22. Invocações de Final Fantasy (entregue em 26/11/2026, ADR 0042)
Como jogador, quero imprimir em português as Invocações de Final Fantasy, as criaturas Saga.
- [x] As Invocações de borda preta de FIN, FIC e das promos de pré-estreia saem em português: o lembrete oficial das Sagas impressas na faixa larga do alto, os capítulos ao lado dos marcadores, com os fios entre eles no lugar que o português pede, e a palavra-chave da criatura ou o flavor centralizados na caixa abaixo da barra de tipo.
- [x] O lembrete desvia da curva da tira dos marcadores, como na carta impressa; o fio do lembrete, onde a arte começa, fica como está.
- [x] O fim do tipo em inglês sai inteiro e o símbolo da coleção fica inteiro, com a barra escurecendo perto dele.
- [x] Os Knights of Round, cujo lembrete nunca saiu impresso em PT, e as sem borda saem na original, e a etiqueta diz que saem em inglês.
