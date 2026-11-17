---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# App do Proxinho (página única)

Mode: Operate. Visitante: jogador brasileiro de Commander com a lista pronta em outro site. Tarefa: colar ou importar a lista, revisar cartas e artes, baixar o PDF em tamanho real. Prova: a própria carta reescrita em português na tela. Restrições: PT-BR, WCAG 2.2 AA, celular e desktop, nada de marcas da Wizards.

## Direction contract

THESIS: O que você revisa é a folha que vai imprimir. A tela é uma prova de gráfica: as cartas aparecem já montadas em folhas 3×3 com marcas de corte, não numa lista genérica de cards. Recusa o "formulário à esquerda, lista de resultados à direita" de ferramenta de deck.

OWN-WORLD: Prova de gráfica rápida brasileira. Papel offset branco-azulado (#F4F6F8) com folhas brancas puras, tinta preta de processo (#111418) para texto, ciano de processo (#0086C9 e um ciano escuro #005B8A para texto) como cor comprometida da casca (barra de ordem de serviço, botão principal, seleção), magenta de processo (#C2186B) só para marcas de registro e avisos de tradução, amarelo de processo (#FFD400) como marca-texto de seleção. Archivo variável (largura 62–125) em todo lugar: larga e pesada no nome, condensada nos rótulos técnicos, tabular nos números. Marcas de corte e de registro desenhadas em SVG; tira de controle de cor CMYK no topo da folha.

STORY: A pessoa entende em segundos que cola a lista e recebe folhas prontas; acredita porque vê a própria carta já em português; age em "Baixar PDF".

FIRST VIEWPORT: Barra fina com marca Proxinho (marca de registro) à esquerda. Coluna esquerda (~400 px) é a "ordem de serviço": abas Colar lista / Link do deck / Buscar carta, campo grande, botão ciano "Montar folhas". À direita, a folha A4 em escala, com tira CMYK, marcas de corte e nove espaços tracejados; no vazio, três cartas de exemplo já traduzidas. No celular a ordem de serviço vem primeiro e a folha logo abaixo.

FORM: Prova de gráfica (posição 4 da minha lista ordenada, sorteada). seed:547e7dbe45838bfe. Assinatura: cada carta na folha tem marcas de corte e uma legenda técnica condensada (coleção, número, origem do texto). Interação assinada: tocar numa carta abre a gaveta "Trocar arte" com todas as impressões, e a troca re-renderiza aquela posição da folha com uma varredura de registro (as quatro tintas se alinham). Raises: legenda de origem (do mapa de zoológico); "Ver no tamanho real" 63×88 mm (do espécime tipográfico); legenda de prancha com coleção, número e artista (do anuário de design).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
