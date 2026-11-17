# Spec 0001: gerador de proxies em português

- Situação: entregue na v1.0 (17/11/2026)
- Dono do produto: João

## Objetivo

Qualquer pessoa cola a lista do deck e, em poucos minutos, baixa um PDF com as cartas no tamanho real, com nome, tipo e texto oficiais em português, sobre a arte que escolheu.

## Histórias e critérios de aceite

### H1. Colar a lista
Como jogador, quero colar a lista exportada de qualquer site para não digitar carta por carta.
- [x] Aceita "1 Nome", "1x Nome", "Nome", "1 Nome (SET) 123", "*F*", seções Commander/Comandante/Sideboard, categorias do Archidekt e nomes em português.
- [x] Ignora maybeboard e fichas.
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
- [x] Aviso de conteúdo de fã no site e no PDF; nenhuma marca da Wizards como marca do produto.

## Requisitos não funcionais

- WCAG 2.2 AA: contraste, foco visível, alvos de 44 px, nada só por cor, leitor de tela nas abas, busca e gaveta.
- Funciona no celular (a partir de 360 px) e no desktop.
- Primeira tela com menos de 100 KB de JavaScript comprimido além do React; o gerador de PDF carrega só quando pedido.
- Nenhum dado pessoal coletado.

## Fora do escopo da v1

Molduras além da 2015 normal, edição manual do texto, tradução não oficial assistida, fichas. Ver [roadmap](../roadmap.md).

Entregue depois da v1 (17/11/2026): cartas de duas faces (frente e verso lado a lado na folha e no PDF) e planeswalkers reescritos, com a caixa translúcida preenchida por rede neural (ADRs 0007 e 0008).
