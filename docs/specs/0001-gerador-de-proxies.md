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

### H5. Trocar a arte e a quantidade
- [x] Tocar numa carta abre a gaveta com todas as impressões (coleção, número, ano, artista) e diz se cada uma sai em português.
- [x] A imagem oficial em português aparece como opção quando existe, com aviso de baixa resolução.
- [x] Mudar a quantidade (1 a 99), tirar do pedido e ver no tamanho real.

### H6. Baixar o PDF
- [x] A4 ou Carta; "na frente da carta" (sem sangria, opção −0,5 mm) ou "carta inteira" (com sangria).
- [x] Qualidade padrão (300 dpi) ou alta (480 dpi).
- [x] Marcas de corte, régua de 5 cm e aviso de imprimir em tamanho real em toda página.
- [x] Progresso visível; tudo gerado no navegador.

### H7. Honestidade e regras
- [x] A origem do texto aparece na gaveta (Arena ou impressão PT).
- [x] Sem tradução oficial, a carta sai em inglês e a interface diz.
- [x] Se o motor não reconhece a moldura de uma impressão e ela sai na imagem original, a etiqueta, a legenda e o resumo dizem que sai em inglês.
- [x] Aviso de conteúdo de fã no site e no PDF; nenhuma marca da Wizards como marca do produto.

## Requisitos não funcionais

- WCAG 2.2 AA: contraste, foco visível, alvos de 44 px, nada só por cor, leitor de tela nas abas, busca e gaveta.
- Funciona no celular (a partir de 360 px) e no desktop.
- Primeira tela com menos de 100 KB de JavaScript comprimido além do React; o gerador de PDF carrega só quando pedido.
- Nenhum dado pessoal coletado.

## Fora do escopo da v1

Molduras além da 2015 normal, edição manual do texto, tradução não oficial assistida, fichas. Ver [roadmap](../roadmap.md).

Entregue depois da v1 (17/11/2026): cartas de duas faces (frente e verso lado a lado na folha e no PDF) e planeswalkers reescritos, com a caixa translúcida preenchida por rede neural (ADRs 0007 e 0008). Em 19/11/2026: artes sem borda na moldura padrão, com o nome de crossover mantido no alto e o nome em PT na linha de baixo, e a sangria do PDF com a própria arte (ADR 0012).

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
