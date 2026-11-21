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
- [x] Mostra os nomes não encontrados, com a quantidade, e permite ignorá-los.

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
- [ ] As cartas já montadas no servidor pelo mesmo motor aparecem na hora já na primeira visita, e o PDF delas sai sem montar nada no aparelho; o que não está lá é montado no aparelho, como antes (ADR 0022; falta ligar o R2 da conta).
- [x] O PDF é montado em segundo plano enquanto a pessoa revisa (depois das prévias, com a página parada, e nada antes do clique com a economia de dados ligada), e as cartas prontas ficam guardadas no navegador para a próxima visita: num deck de 100 cartas, o PDF sai em 2 s depois de um minuto de revisão, em vez de ~1 min (ADR 0014, 19/11/2026).

### H7. Honestidade e regras
- [x] A origem do texto aparece na gaveta (Arena ou impressão PT).
- [x] Sem tradução oficial, a carta sai em inglês e a interface diz.
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

Molduras além da 2015 normal, edição manual do texto, tradução não oficial assistida, fichas. Ver [roadmap](../roadmap.md).

Entregue depois da v1 (17/11/2026): cartas de duas faces (frente e verso lado a lado na folha e no PDF) e planeswalkers reescritos, com a caixa translúcida preenchida por rede neural (ADRs 0007 e 0008). Em 19/11/2026: artes sem borda na moldura padrão, com o nome de crossover mantido no alto e o nome em PT na linha de baixo, e a sangria do PDF com a própria arte (ADR 0012). Em 20/11/2026: Sagas na moldura padrão (ADR 0016) e Aventuras na moldura de livro (ADR 0017).

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
