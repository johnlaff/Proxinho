# Pesquisa: a dor, o estado da arte e o lado legal

Levantamento feito em 17/11/2026, antes de escrever a primeira linha de código. É a fase de "Inception" do projeto (ver [aidlc.md](aidlc.md)).

## A dor

- Modern Horizons 3 (junho de 2024) foi a última coleção impressa em português. Daí em diante, cartas físicas só em inglês.
- Cerca de 5% dos brasileiros falam inglês e cerca de 1% com fluência (British Council / Data Popular).
- O MTG Arena continua em português, inclusive nas coleções novas. Quem aprende pelo Arena chega ao papel e encontra só inglês.
- Mesmo cartas que saíram em português raramente têm a arte que a pessoa quer em português, e só 4% das 38.832 imagens em português do Scryfall estão em alta resolução (1.620).

## O que já existe

| Ferramenta | O que faz bem | Português |
|---|---|---|
| MPCFill | Banco comunitário de imagens em alta e pedido na MakePlayingCards | Só imagens prontas, quase todas em inglês |
| Proxxied | Cola a lista, escolhe a arte e gera PDF com marcas de corte | Não |
| MTGProxyPrinter | App de desktop aberto; PDF em A4/Carta; opção de "traduzir" | Parcial: troca pela imagem PT do Scryfall quando existe |
| Card Conjurer | Editor de cartas com molduras e texto livre | Manual; saiu do ar oficialmente em 2022 após notificação da Wizards |
| Gráficas de proxy | Vendem a carta impressa | Não, e vender proxy é proibido pela Wizards |

**A lacuna:** nenhuma ferramenta pega qualquer impressão e reescreve o texto oficial em português. Todas dependem de já existir uma imagem em português. Esse é o diferencial do Proxinho.

## Cobertura da tradução oficial

Cruzando a lista de cartas do Scryfall com o texto do Arena e com as impressões em português (17/11/2026):

| Cartas legais no Commander | Cartas | % |
|---|---:|---:|
| Total | 31.597 | 100 |
| Com impressão física em português | 24.519 | 77,6 |
| Com texto PT-BR no Arena | 15.781 | 49,9 |
| Com pelo menos uma das duas | 29.191 | 92,4 |
| Entre as 1.000 mais jogadas (EDHREC) | 989 | 98,9 |

Algumas impressões em português aparecem no Scryfall só com a imagem, sem o texto (Advent of the Wurm em DGM): essas não contam como tradução. O texto impresso que existe às vezes vem com habilidades coladas, sem a quebra de linha ("reserva de mana.{3}{W}", "VoarAterragem", "Ímpeto{T}: Adicione"), e o pipeline devolve a quebra (ADR 0011); no Arena, duas regras perdem o espaço antes do símbolo ("Adicione{B}"), que volta. Criaturas sem habilidades também vêm sem o texto, mas com o tipo em PT: o texto delas é vazio de verdade, e elas contam como tradução (eram 139 cartas saindo em inglês). Uns 20 lembretes, nas duas fontes, vêm sem o "(" ou sem o ")", e um bônus do Arena vem como "+1/++1": o pipeline repõe só a pontuação, nunca palavras. Umas 17 regras trazem uma palavra repetida ("Toda vez que que"), e a cópia sai. No Arena, alguns planeswalkers vêm com uma habilidade sem o custo de lealdade no texto em PT; o custo é um número da regra, não texto traduzido, e o pipeline o copia do Oracle.

As que faltam são quase todas exclusivas de decks prontos de Commander de 2022 a 2026, que não estão no Arena. Hoje elas saem em inglês, marcadas. Uma tradução assistida pelo glossário do Arena, marcada como não oficial, está no [roadmap](roadmap.md).

## Importação de decks

| Origem | Como | Situação |
|---|---|---|
| Lista colada (MTGO, Arena, Moxfield, Archidekt, ManaBox, Liga Magic) | Um leitor único que aceita quantidade, coleção, número, foil, seções e nomes em português | Feito |
| Busca manual | Nome em português ou inglês, com autocompletar | Feito |
| Link do Archidekt | API pública, mas o CORS libera só localhost: passa pelo Worker | Feito |
| Link do Moxfield | A API responde 403 para terceiros; orientamos "Exportar → copiar" | Tentativa + orientação |

## Fichas (tokens)

Pesquisa de 17/11/2026. Impressões de fichas em português quase não existem no Scryfall. O Arena tem as fichas como cartas (`isToken` no `cards.json`), com nome, tipo e habilidades em PT-BR. Casando nome, tipos, P/R e texto em inglês sem lembretes, 534 das 795 fichas do Scryfall ganham texto oficial, o que cobre cerca de 82% das referências a fichas nas cartas legais em Commander (a maior parte do que falta são fichas raras de uma carta só). Nenhuma ferramenta de proxy olhada (Proxxied, MPCFill, MTGProxyPrinter) sugere as fichas do deck; o MPCFill tem fichas, mas só como imagem pronta. Decisão no ADR 0009.

Emblemas: o Arena não tem os emblemas de papel e o Scryfall não tem emblemas em PT, mas o texto de cada emblema está entre aspas na habilidade do planeswalker ("Você recebe um emblema com …"), oficial. 73 dos 89 emblemas saem assim (ADR 0010).

## Apagar texto sobre arte (planeswalkers)

As caixas de texto dos planeswalkers são translúcidas: a arte aparece por trás das letras. O preenchimento por média da vizinhança deixa ali uma mancha borrada. O que existe (pesquisa de 17/11/2026):

| Abordagem | Quem usa | Para nós |
|---|---|---|
| Refazer a moldura a partir de modelos | Proxyshop (Photoshop), Card Conjurer | Fiel ao modelo, não à impressão escolhida; exige recriar cada moldura |
| Síntese por patches (PatchMatch) | "Preenchimento sensível ao conteúdo" clássico | Sem download, mas repete pedaços e erra em gradientes |
| Inpainting por rede neural (LaMa, MI-GAN) | IOPaint, removedores de marca d'água no navegador | Estado da arte para remover texto; LaMa quantizado tem 37 MB e roda com ONNX Runtime Web (WebGPU ou WebAssembly) |

Escolha: LaMa quantizado, só nas caixas dos planeswalkers (ADR 0008).

## Lado legal e o caminho seguro

| Ponto | O que diz | Risco |
|---|---|---|
| Política de Conteúdo de Fãs da Wizards | Permite conteúdo de fã gratuito; proíbe vender, usar logos e tirar avisos de copyright; exige o aviso de "não aprovado" | Baixo, se grátis |
| Posição da Wizards sobre proxies (2016) | O foco é falsificação e eventos oficiais; não fiscalizam cartas de teste para uso pessoal | Baixo no uso pessoal |
| Card Conjurer (2022) | Gerador web recebeu notificação; a Wizards citou cópia literal de texto e arte | Médio num site público |
| Termos do Arena | Proíbem engenharia reversa | Alto se extrair do cliente: não fazemos |
| Dados da Untapped | Arquivos públicos, sem termos claros de reuso | Médio: pedir autorização antes de divulgar |
| Regras de imagem do Scryfall | Não cortar artista e copyright, não distorcer, não pôr marca d'água | Médio: avisar o Scryfall |
| Fontes das cartas | Beleren e Plantin são de terceiros | Arquivos fornecidos pelo dono do projeto, servidos do KV e fora do repositório; reserva livre: Eczar e Splentinex (OFL). Rever antes de abrir ao público |

**O que o Proxinho faz para ficar no caminho seguro:** é grátis, não vende impressão, gera tudo no navegador (o servidor não guarda nem distribui imagens de cartas, e não há galeria pública), não extrai nada do cliente do Arena, mantém artista e copyright, mostra o aviso de conteúdo de fã no site e no PDF e não usa nomes ou logos da Wizards como marca.

**Pendente antes de divulgar amplamente:** pedir autorização à Untapped e avisar o Scryfall.
