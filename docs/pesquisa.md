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
| MtG Proxy Printer (site, novembro de 2026) | Cola a lista e troca a caixa de texto por uma caixa lisa da cor da moldura, com a tradução oficial ou de máquina | Sim, mas a caixa perde o desenho da moldura, e sem tradução oficial entra a de máquina |
| Card Conjurer | Editor de cartas com molduras e texto livre | Manual; saiu do ar oficialmente em 2022 após notificação da Wizards |
| Gráficas de proxy | Vendem a carta impressa | Não, e vender proxy é proibido pela Wizards |

**A lacuna:** nenhuma ferramenta pega qualquer impressão e reescreve o texto oficial em português. Todas dependem de já existir uma imagem em português. Esse é o diferencial do Proxinho.

## Cobertura da tradução oficial

Cruzando a lista de cartas do Scryfall com o texto do Arena e com as impressões em português (25/11/2026):

| Cartas legais no Commander | Cartas | % |
|---|---:|---:|
| Total | 31.597 | 100 |
| Com o texto PT-BR do Arena | 15.734 | 49,8 |
| Só com o texto de uma impressão em português | 10.816 | 34,2 |
| Com texto oficial (uma das duas) | 26.550 | 84,0 |
| Sem texto, com a imagem oficial em português | 1 | 0,0 |
| Sem nada em português | 5.046 | 16,0 |
| Entre as 1.000 mais jogadas (EDHREC), com texto oficial | 984 | 98,4 |

Algumas impressões em português aparecem no Scryfall só com a imagem, sem o texto (as 86 de Dragon's Maze, como o Advent of the Wurm): sozinhas não contam como tradução, e o texto delas foi transcrito da imagem (ADR 0026; até 21/11 elas contavam na linha "sem texto, com a imagem"). A que sobra nessa linha é a Sewers of Estark de 1995, com as regras daquele tempo, que fica só com o nome. E 9.819 impressões em português, quase todas de 1995 a 2001, não têm nem a imagem: no lugar dela, o Scryfall põe a carta em inglês com o selo "Localized Image Not Available", e só o nome impresso vale. Elas não viram "imagem oficial em português" (`real_image` no pipeline). A medição de 17/11 contava essas cartas como traduzidas (92,4% no total e 98,9% nas 1.000 mais jogadas). O texto impresso que existe às vezes vem com habilidades coladas, sem a quebra de linha ("reserva de mana.{3}{W}", "VoarAterragem", "Ímpeto{T}: Adicione"), e o pipeline devolve a quebra (ADR 0011); no Arena, duas regras perdem o espaço antes do símbolo ("Adicione{B}"), que volta. Criaturas sem habilidades também vêm sem o texto, mas com o tipo em PT: o texto delas é vazio de verdade, e elas contam como tradução (eram 139 cartas saindo em inglês). Uns 20 lembretes, nas duas fontes, vêm sem o "(" ou sem o ")", e um bônus do Arena vem como "+1/++1": o pipeline repõe só a pontuação, nunca palavras. Umas 17 regras trazem uma palavra repetida ("Toda vez que que"), e a cópia sai. No Arena, alguns planeswalkers vêm com uma habilidade sem o custo de lealdade no texto em PT; o custo é um número da regra, não texto traduzido, e o pipeline o copia do Oracle.

O Arena tira a explicação das palavras-chave (o lembrete entre parênteses), que a carta física traz. Das faces com texto do Arena, 5.468 têm lembrete no Oracle e 5.295 vêm sem; das impressões em PT desde o Magic 2010 saem 1.121 lembretes com texto oficial, casados linha a linha com o Oracle, e 3.879 cartas ganham a explicação (ADR 0018). As mecânicas que nunca saíram impressas em PT ficam sem.

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

Emblemas: o Arena não tem os emblemas de papel e o Scryfall não tem emblemas em PT, mas o texto de cada emblema está entre aspas na habilidade do planeswalker ("Você recebe um emblema com …"), oficial. 81 dos 89 emblemas saem assim (ADR 0010).

## Apagar texto sobre arte (planeswalkers e sem borda)

As caixas de texto dos planeswalkers são translúcidas: a arte aparece por trás das letras. O preenchimento por média da vizinhança deixa ali uma mancha borrada. O que existe (pesquisa de 17/11/2026):

| Abordagem | Quem usa | Para nós |
|---|---|---|
| Refazer a moldura a partir de modelos | Proxyshop (Photoshop), Card Conjurer | Fiel ao modelo, não à impressão escolhida; exige recriar cada moldura |
| Síntese por patches (PatchMatch) | "Preenchimento sensível ao conteúdo" clássico | Sem download, mas repete pedaços e erra em gradientes |
| Inpainting por rede neural (LaMa, MI-GAN) | IOPaint, removedores de marca d'água no navegador | Estado da arte para remover texto; LaMa quantizado tem 37 MB e roda com ONNX Runtime Web (WebGPU ou WebAssembly) |

Escolha: LaMa quantizado, só nas caixas dos planeswalkers (ADR 0008).

### Artes sem borda (19/11/2026)

Nas artes sem borda as barras e a caixa inteiras são translúcidas, e a arte atrás é mais variada que nos planeswalkers (gravuras, retícula de impressão, robôs, céus). A pesquisa de novo:

| Abordagem | Para nós |
|---|---|
| Refazer a moldura a partir de modelos (Proxyshop, Card Conjurer) | Precisa da arte sem o texto, que a imagem da carta não tem: a arte passa por trás da caixa |
| Remoção de texto de cena por difusão (modelos de inpainting de difusão) | Melhor em fundos complexos, mas pesa gigabytes e leva segundos por quadro na placa de vídeo; inviável no navegador |
| MI-GAN | Mais leve que o LaMa, mas pior em textura repetida |
| LaMa na resolução da imagem, com máscara só das letras | Reaproveita o modelo que já está no site. A rede trabalha em 512 px: reduzir a caixa inteira para isso apagava o desenho fino da arte; em quadros na resolução da imagem, um depois do outro, ela continua a textura. A retícula grossa de impressão (2 a 3 px) ela não refaz: essas cartas saem na original |

Escolha: LaMa em quadros na resolução da imagem, com a máscara só das letras brancas e o grão da vizinhança de volta depois (ADR 0012). Depois que a retícula grossa passou a sair na original, a caixa voltou a um quadro só, reduzido: igual na regressão das 260 artes e 30% mais rápido (ADR 0015).

### Rede neural no navegador do celular (19/11/2026)

A prévia de uma arte sem borda ficou parada em "Montando a prévia…" no Firefox do celular. O que se faz hoje para rodar um modelo de imagem no navegador, e onde o Proxinho está:

| Prática | Quem faz | Proxinho |
|---|---|---|
| Modelo numa worker, fora da página | transformers.js, ONNX Runtime Web, inpaint-web | Sim, desde o começo (ADR 0008) |
| Placa de vídeo (WebGPU) com a CPU (WebAssembly) de reserva | transformers.js, ONNX Runtime Web | Parecia que sim; a placa de vídeo falhava no LaMa e tudo caía para a CPU (ver a seção seguinte) |
| Modelo guardado pelo navegador depois do primeiro download | transformers.js e os removedores de objeto no navegador | Sim |
| Andamento do download na tela | transformers.js (`progress_callback`) e as demonstrações do Hugging Face | Não havia; agora a prévia mostra a etapa e a porcentagem |
| Tempo-limite e plano B quando o runtime trava | o ONNX Runtime Web tem `env.wasm.initTimeout`; os apps põem tempo-limite e trocam de backend | Não havia; agora um vigia troca a worker por uma com uma thread e, por fim, desiste do jeito certo para cada moldura |
| Modelo leve para celular | MI-GAN (ICCV 2023): cerca de um décimo da conta do LaMa, com qualidade parecida em 512 px, 29 MB em ONNX; usado pelo inpaint-web e pelo WatermarkOut | Não: LaMa quantizado (37 MB) |
| Kernels próprios em WebGPU | wipe.photos: o LaMa em shaders próprios, menos de 1 s, também no Android e no iPhone | Não: ONNX Runtime Web |

Entre os geradores de proxy, o Card Anvil também usa o LaMa para limpar a arte.

A trava: no ONNX Runtime Web, uma thread do WebAssembly que não sobe deixa o carregamento do modelo esperando para sempre, sem erro. O `initTimeout` dele não resolve sozinho, porque depois do tempo esgotado o runtime não se recupera; só uma worker nova volta a funcionar. Por isso o vigia encerra a worker e cria outra, mais simples (ADR 0008).

Conclusão (manhã de 19/11): no essencial o Proxinho seguia a prática do mercado (worker, WebGPU com a CPU de reserva, modelo guardado), e passou a seguir também no andamento e no tempo-limite. O teste do João à tarde mostrou que não bastava (seção seguinte).

### Espera da rede neural (19/11/2026, à tarde)

Com o vigia no ar, o João testou de novo: no Chrome do celular a Konia sem borda saía na hora em inglês ("esta moldura ainda não é reescrita" e, abaixo, "o apagador de texto não rodou"); no Firefox, dois minutos em "Apagando o inglês…" e ele desistiu. O pedido: corrigir, esperar o mínimo sem perder qualidade e não deixar a pessoa desistir.

O que achamos e o que o mercado faz:

| Ponto | O que achamos | Prática / estado da arte | Proxinho agora (ADR 0013) |
|---|---|---|---|
| Placa de vídeo | O runtime JSEP (o padrão do pacote `onnxruntime-web`) falha no LaMa: `[WebGPU] Kernel "[Add] …/ffc/convg2g/Add" failed`. Toda carta caía para a CPU | O runtime WebGPU próprio (`onnxruntime-web/webgpu`): quem trocou relata WebGPU no Chrome e no Safari do Mac e do iPhone com uma linha de import; o JSEP no Safari 26 sobe a ~5 GB e a aba cai (issue 26827 do onnxruntime) | Runtime WebGPU, conferido: mesmo resultado da CPU (diferença máxima de 0,03 tom em 255) |
| CPU | 6,6 a 8 s por quadro com 4 threads, 19,6 s com uma, aqui; o celular é mais lento | Runtime só de CPU (`onnxruntime-web/wasm`), menor; MI-GAN para celular | Runtime só de CPU (15 MB, 4 MB compactado). Testados e descartados: quadros do tamanho da caixa (o modelo tem medidas fixas de 512 px), manter a quantização (mais lento), outro nível de otimização (mais lento) |
| Download | 66 MB (modelo e runtime JSEP) sem compactar | Compactar; baixar só o runtime que vai rodar | 37 MB na placa de vídeo, 33 MB na CPU (gzip, descompactado na worker); o download começa quando a primeira carta entra no pedido |
| Recuo | Erro da placa de vídeo ia direto para a CPU com uma thread, a mais lenta, que também falhou no celular | Recuo por degraus | Placa de vídeo → CPU com várias threads → CPU com uma; o limite de cada quadro segue o ritmo medido |
| Espera | Só a etapa, sem parte nem tempo; a prévia em branco | NN/g: acima de 10 s, porcentagem, texto do passo ("3 de 50") e tempo estimado com folga; imagens com versão provisória que vira a final (LQIP) | Rascunho em PT em segundos, "Acabamento: parte 2 de 3, cerca de 35 s" com barra que anda, fila à parte e a carta da gaveta na frente |
| Falha | A etiqueta culpava a moldura | Dizer o motivo de verdade | "Em inglês: o apagador de texto não rodou neste navegador", com o detalhe técnico na gaveta |

Fontes: Nielsen Norman Group, "Progress Indicators Make a Slow System Less Insufferable" e "Response Times: The 3 Important Limits"; microsoft/onnxruntime, issue 26827 ("Severe CPU and memory issues in Safari/WebKit 26 with JSEP mode"); relatos de troca para `onnxruntime-web/webgpu` em projetos públicos (mailwoman, the-gathering); medições próprias no quadro da Konia (DSK 358) com o mesmo modelo.

O que sobra: a CPU do celular sem WebGPU (o Firefox do Android) continua levando dezenas de segundos por quadro; agora a carta em português aparece logo e a espera é visível. O próximo passo possível é o MI-GAN só para o rascunho (roadmap), se a qualidade empatar nas nossas artes.

### Velocidade do acabamento e do deck inteiro (19/11/2026, noite)

Com tudo funcionando, o João perguntou quanto leva um deck inteiro, se uma carta leva 47 s. Medimos no site (Chromium sem placa de vídeo, 4 núcleos, celular emulado) e em bancada com os quadros reais de 6 artes sem borda (Konia DSK 358, Squall PSS5 2, Ulamog 2X2 577, Timber Protector LTC 533, Roaming Throne LCI 344, G'raha Tia FIC 203):

| Medida | Resultado |
|---|---|
| Deck de 100 cartas (71 diferentes) só com nomes | Nenhuma carta passou pela rede neural. Todas as prévias em 45 s; o PDF levou mais 59 s, porque remonta cada carta na resolução de impressão, duas por vez |
| Mesmo deck com 6 artes sem borda | As 6 mostram o rascunho e acabam em segundo plano; o PDF levou os mesmos 60 s (as caixas limpas pela prévia são reaproveitadas) |
| Carta sem borda na CPU | Preparo do modelo 10,4 a 12,7 s (uma vez por visita) e 5,8 a 6,3 s por quadro com 4 threads (18 s com uma); 3 quadros por carta (as duas barras num, a caixa em dois) |
| MI-GAN 512 (ICCV 2023), no mesmo navegador | Preparo 0,6 s e 0,5 s por quadro (2,1 s com uma thread): 11 vezes mais rápido. Mas nos 18 quadros deixou a sombra das letras apagadas (Konia), um bloco branco no meio da arte (Roaming Throne) e riscos vermelhos inventados dentro da barra do nome (Ulamog). Reprovado para o acabamento |
| LaMa pré-otimizado (medidas fixas de 512 px e as constantes da transformada de Fourier calculadas antes, no ONNX Runtime em Python, com a quantização preservada) | Preparo de 10,4 s para 1,8 s, quadro no mesmo tempo, saída igual (no máximo 1 tom em 255 de diferença na CPU, arredondamento; idêntica no runtime WebGPU). O arquivo passa de 36,9 para 38,2 MB |
| Só fixar o lote em 1 na sessão (`freeDimensionOverrides`), no navegador | Preparo de 10,4 s para 3,2 s, saída idêntica, sem ferramenta nova no build. É o que entrou (ADR 0013, item 9); o modelo pré-otimizado no build daria 1,8 s, mas pede o `onnxruntime-node` (300 MB) |
| Caixa num quadro só, reduzida (em vez de dois na resolução da imagem) | Carta de 19 a 20 s para 13 a 14 s na CPU. Visualmente igual em 5 das 6; no Roaming Throne sobrou um risco escuro de uns 3 px entre duas linhas. Na regressão das 260 artes sem borda: 47 idênticas, nenhum defeito visível, só pingos de 1 a 5 px que a rede neural inventa nos dois modos (7 a mais num, 6 no outro). É o que entrou (ADR 0015) |
| XNNPACK no ONNX Runtime Web | Não existe no pacote web |

O que o estado da arte diz:

- **Modelos menores.** O MI-GAN (Sargsyan et al., ICCV 2023) tem 5,98 milhões de parâmetros e 15,7 GFLOPs a 512 px, contra 27 milhões e 128 GFLOPs do LaMa (Tabela 2 do artigo; o nosso é o Big-LaMa, com 51 milhões). O FID dele empata com o do LaMa, mas o LPIPS é pior (0,345 contra 0,314), e o artigo mede em fotos com buracos grandes, não em letras finas sobre arte. Ferramentas de proxy usam o MI-GAN no navegador para tirar marca-d'água (Card Anvil); nas nossas letras ele não segura a qualidade.
- **Destilação.** O caminho do próprio MI-GAN é treinar uma rede pequena imitando uma grande (knowledge distillation). Uma rede nossa, treinada com o LaMa como professor em cartas com texto apagado, poderia chegar perto da qualidade com uma fração da conta, mas pede semanas de treino em placa de vídeo.
- **Placa de vídeo no navegador.** A img.ly mediu o ONNX Runtime Web com WebGPU 16 a 20 vezes mais rápido que o WebAssembly com 16 threads num modelo de imagem. Wang et al. ("Anatomizing Deep Learning Inference in Web Browsers", ACM TOSEM 2024) medem até 28 vezes de diferença de velocidade entre aparelhos na CPU, e o Firefox uns 9% mais lento que o Chrome. Em novembro de 2026 o WebGPU está no Chrome do Android 12+ (Qualcomm, ARM, Intel desde a versão 121), no Safari do iOS 26 e no Firefox de Windows e Mac; no Firefox do Android segue atrás de uma opção, com o trabalho previsto pela Mozilla para 2026 (gpuweb, "Implementation Status").
- **NPU.** O WebNN ainda depende de uma opção ligada à mão no Chrome e no Edge (documentação do ONNX Runtime): não serve para o público.
- **Alta resolução.** O IOPaint (ex-lama-cleaner) oferece três estratégias: imagem inteira, recorte em volta do buraco e redução; recortar e reduzir são as rápidas. O Proxinho já recorta; reduzir é o teste da caixa num quadro só.

Conclusão: na CPU não há como deixar o LaMa muito mais rápido sem perder qualidade; o ganho grande por carta vem da placa de vídeo, que o Chrome do celular já usa. O que encurta o deck inteiro é preparar o modelo mais rápido (3,2 s em vez de 10 a 13 s), adiantar a montagem do PDF enquanto a pessoa revisa (hoje ~1 min no fim) e guardar no aparelho o que já ficou pronto.

Depois de feitos (ADR 0014), no mesmo deck de 100 cartas, num build local:

| Medida | Resultado |
|---|---|
| PDF logo depois das prévias, 2 cartas por vez | 61,1 s |
| PDF logo depois das prévias, 4 por vez (computador, 4 núcleos) | 55,7 s: a montagem roda na thread da página, e mais vagas ajudam pouco |
| PDF depois de 70 s de revisão (computador) | 1,8 s |
| PDF depois de 30 s de revisão (celular emulado) | 30,8 s, em vez de ~60 |
| Página durante o adiantado (30 s, celular emulado) | 27 tarefas longas, a maior de 646 ms, 14,7 s ocupados: por isso o adiantado só monta depois de 1,5 s sem toque, rolagem ou tecla |
| Segunda visita com a mesma lista (Konia sem borda, Sol Ring, Arcane Signet) | As três acabadas em 0,2 s, sem baixar a rede neural; PDF em 0,1 s; 0,9 MB guardados |

## Molduras especiais

### Sagas (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop (Photoshop) refaz a Saga a partir do próprio modelo. Ele encolhe os textos dos capítulos até caberem na coluna (`scale_text_layers_to_height`), espalha os capítulos por igual (`spread_layers_over_reference`), desenha os fios entre eles e alinha cada marcador ao seu texto (`align_vertical`). O Magic Set Editor pede as coordenadas dos marcadores e dos fios à mão. Os dois desenham os marcadores; aqui eles fazem parte da imagem escolhida, então o Proxinho faz o inverso: os marcadores ficam, e os fios e o texto se ajustam a eles (ADR 0016).

Medidas nas imagens do Scryfall (745 × 1040), em 16 coleções de DOM a TRK:

| Medida | Valor |
|---|---|
| Coluna de texto | x ≈ 58 a 368, do pé da barra do nome (119) ao fio de baixo (867) |
| Fio preto entre a coluna e a arte | x ≈ 370 a 374 |
| Fio entre faixas | sombra de ~8 px e degrau de 10 a 30 tons na largura toda; o primeiro em ~308 (356 em DMU, com "Read ahead") |
| Marcadores | hexágonos dourados em x ≈ 30 a 84, ~60 px de altura, número romano de 19 a 27 px no meio (x ≈ 57) |
| Barra de tipo | fio de cima em ~870 a 873, ~291 px abaixo do da carta comum |

O que o texto em PT pede: o Arena não tem o lembrete do alto (nem a explicação do "Adiantar leitura"), que vem das Sagas impressas em PT: são cinco lembretes em inglês no Oracle com texto oficial em PT (Sacrifique-a após III, IV e VI, o sem sacrifício das que se transformam e o "Adiantar leitura"). O Arena também tira o lembrete de palavra-chave dos capítulos, que o Oracle e a carta física trazem (o "Arregimentar Orcs 1." do Book of Mazarbul): o texto oficial vem das impressões em PT com o mesmo lembrete em inglês (1.402 lembretes; 11 Sagas ganham a explicação). E traz o texto dos capítulos agrupados repetido (o Long List of the Ents, um parágrafo seis vezes); o número de cada capítulo vem do Oracle. Com as faixas do inglês, a do alto ficava vazia e o texto dos capítulos, pequeno; com os fios no lugar novo, a letra dos capítulos fica perto do corpo do inglês (~30).

Digitalizações: nas cartas de Theros e nas promos de pré-estreia, o degrau do fio se espalha por duas linhas e não passa de 6 tons em nenhuma; medido em duas linhas, entram. Em 12 promos de pré-estreia (sobretudo de Kaldheim e Theros) o papel sai quase branco (249) e o fio é uma queda de 2 tons: não há como achá-lo sem confundir com o grão, e elas saem na original (a versão da coleção sai em PT).

### Aventuras (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop tem, para a Aventura (`AdventureMod`), camadas próprias para o nome, o custo, o tipo e as regras da aventura. O nome encolhe até não encostar no custo (`ScaledTextField` com o custo de referência) e as regras ocupam a caixa da página da esquerda (`FormattedTextArea` com uma caixa de referência própria, sem centralizar); a caixa principal é a página da direita. O Proxinho segue a mesma divisão sobre a imagem escolhida: cada página encaixa o próprio corpo (ADR 0017).

Medidas nas imagens do Scryfall (745 × 1040), em ELD, WOE, CLB, HOB, MOC, FIN e TDM:

| Medida | Valor |
|---|---|
| Barra do nome da aventura | y ≈ 652 a 697, x ≈ 44 até a lombada; letras em ~679; custo acabando em x ≈ 356, ~31,5 px por símbolo e ~35,5 nos híbridos (os quatro {G/W} do Bring Back começam em 213) |
| Barra do tipo da aventura | y ≈ 700 a 746, letras em ~725; no Presságio (TDM), um filete até ~752 |
| Página da esquerda | x ≈ 50 até a lombada; papel de ~747 (761 no Presságio) a ~956 |
| Lombada | a coluna mais escura em x ≈ 372 a 375 |
| Página da direita | da lombada a x ≈ 694, de ~655 a ~956; texto a partir de x ≈ 398 (388 no Presságio) |

O papel escurece em direção à lombada: na página da direita, de ~210 tons no meio a ~95 colado nela, numa faixa de até 100 px; na da esquerda, só nos últimos 6 a 8 px. Sem tirar essa sombra antes de apagar, a beira do retângulo virava "letra" e o remendo deixava um degrau (ADR 0017). No Presságio as duas páginas são lisas.

O que o texto em PT pede: o Arena traz a criatura e a aventura como duas faces, repete o flavor da criatura nas duas e não tem o lembrete "(Then exile this card…)". O nome da aventura em PT é quase sempre mais longo ("Mágica Instantânea — Aventura" contra "Instant — Adventure"), e as duas barras comprimem a letra antes de reduzir o corpo, como a impressão oficial em PT.

### Preparar (25/11/2026)

Como as ferramentas existentes fazem: nenhuma ferramenta de proxy conhecida tem modelo para o Preparar (Secrets of Strixhaven, abril de 2026); as notas de lançamento descrevem a mágica num "conjunto de características alternativas numa moldura menor, do lado direito da caixa de texto". O desenho é a Aventura de lado trocado, sem o livro, e o Proxinho segue a divisão do `AdventureMod` do Proxyshop: a caixa principal é a da criatura, e o nome, o tipo e as regras da mágica têm caixas próprias (ADR 0032).

Medidas nas imagens do Scryfall (745 × 1040), em SOS, SOC, FRA e as promos (PSOS, PFRA):

| Medida | Valor |
|---|---|
| Fio entre as caixas | x ≈ 366 a 377, o mais escuro em 371 a 373 |
| Barra do nome da mágica | y ≈ 657 a 699, do contorno em x ≈ 377 até a ponta em ~699; letras a partir de x ≈ 389, em ~679; custo acabando em x ≈ 690 |
| Barra do tipo da mágica | y ≈ 701 a 750 (uma linha escura de 701 a 705, logo abaixo da barra do nome, fica fora do apagamento), letras em ~726; a ponta da direita é redonda |
| Caixa da mágica | papel de x ≈ 379 a 687, de 760 a 762 (depois de um bisel claro) até 919 a 922 (o bisel acima da caixa de P/R) |
| Página da criatura | de x ≈ 52 até o fio, de ~652 a 956 a 964 |

Nas promos de pré-estreia e em algumas da coleção, a última linha da criatura desce até ~945 e o pé dela tem mais tinta que papel na linha: a mediana da linha passava pelo pé da página. As bordas das caixas são medidas pela parte de cada linha no tom do papel (ADR 0032).

### Salas de Duskmourn (25/11/2026)

Como as ferramentas existentes fazem: nenhuma das conhecidas (Proxyshop, MTG.design, Card Conjurer) tem modelo para as Salas de Duskmourn: House of Horror (2024). As cartas divididas antigas (Invasion, Ravnica, Amonkhet) têm modelos no Proxyshop, com as duas metades lado a lado na carta de pé ou deitada, e nenhum serve: a Sala tem uma linha de tipo e uma faixa de lembrete comuns às duas metades, translúcidas, de uma ponta à outra da carta deitada.

O que o texto em PT pede: o Arena traz a carta inteira ("Armário // Porão Esquecido", com os dois textos juntos) e as duas metades; o lembrete das Salas não está em nenhuma delas e nunca saiu impresso em PT. O Arena o mostra como dica da palavra-chave (`Room_Body`), com o inglês igual ao do Oracle: "Você pode conjurar qualquer metade. Aquela porta é destrancada no campo de batalha. Como um feitiço, você pode pagar o custo de mana de uma porta trancada para destrancá-la." Em PT ele é uns 20% mais comprido e cabe em duas linhas do corpo ~20 (o inglês tem 24).

Medidas nas imagens do Scryfall giradas 90° no sentido horário (1040 × 745), nas 51 impressões de borda preta (DSK, DSC, PDSK, The List):

| Medida | Valor |
|---|---|
| Barras dos nomes | y ≈ 37 a 89, a da esquerda de x ≈ 96 a 515 e a da direita de ≈ 573 a 992; letras a partir de x ≈ 111 e 590, em ~63 |
| Custo de mana | acaba em x ≈ 508 e 984; ~35,3 px por símbolo, a sombra do círculo uns 2 px à esquerda |
| Linha de tipo | barra translúcida entre os fios de y ≈ 401 a 408 e 442 a 448; letras brancas a partir de x ≈ 101, em ~423, de ~17 px de altura; o símbolo da coleção de x ≈ 935 a 980 |
| Faixa do lembrete | translúcida, de y ≈ 448 a 511 e x ≈ 96 a 990; itálico branco centrado em duas linhas |
| Caixas | papel de x ≈ 102 a 503 e 578 a 979, de y ≈ 524 a 703; o relevo do lado direito (x ≈ 504 a 507 e 980 a 983) é mais escuro que o papel também na moldura branca, em que o fio em volta da caixa tem a cor do papel |

A barra do tipo e a faixa do lembrete ficam entre 16 e 91 tons de mediana (a arte por trás, escurecida); as letras brancas passam de 230. As promos de PDSK estão 1 px deslocadas, dentro da folga das medidas.

### Cartas divididas da moldura atual (25/11/2026)

Como as ferramentas existentes fazem: o Proxyshop tem modelo para as divididas da moldura atual (as duas metades como cartas pequenas, lado a lado), desenhado do zero; aqui a moldura é a da imagem, e o que importa são as medidas de cada parte, tiradas das impressões. A metade da direita repete a da esquerda 480 px adiante.

Medidas nas imagens do Scryfall giradas 90° no sentido horário (1040 × 745), nas 90 impressões de borda preta (GRN, RNA, MKM, CLU, DMR, RVR, TSR, UMA, MH2 e os decks de Commander):

| Medida | Valor |
|---|---|
| Barras dos nomes | y ≈ 52 a 105, a da esquerda de x ≈ 90 a 515 e a da direita de ≈ 570 a 995; letras a partir de x ≈ 107 e 587, de ~27 px de altura das maiúsculas |
| Custo de mana | acaba em x ≈ 505 e 981; ~36,4 px por símbolo; o híbrido tem um círculo de 41 px |
| Barras de tipo | y ≈ 405 a 437; letras a partir de x ≈ 107 e 587, de ~18,5 px; o tipo em inglês acaba antes de x 200 e 680; o símbolo da coleção começa em x ≥ 455 e 934 (DMR, UMA, MH2 são os mais largos) |
| Caixas | y ≈ 450 a 713 (de 709 a 715 no pé); o lado de dentro da da esquerda vai de x 93 (RNA) a 102 (MKM, RVR, CLU); a da direita, de 570 a 987; o texto em inglês chega a ~22,5 px de altura das maiúsculas (corpo ~34), centrado na altura |

As de Commander 2016 (Trial // Error, Order // Chaos) têm as metades mais altas (caixa até y ≈ 664, com o copyright no pé da carta deitada) e as cartas de teste dos Mystery Boosters e do Unknown Event, a moldura de rascunho: ficam de fora. Em 18 cartas divididas impressas em PT o Scryfall põe o nome de cada metade em inglês (ou o nome inteiro da carta em inglês em cada metade) com o texto em PT; os nomes foram transcritos das imagens oficiais.

### Consequência (25/11/2026)

Como as ferramentas existentes fazem: não achamos, na documentação e nas versões publicadas do Proxyshop, modelo próprio para a Consequência. Aqui a moldura é a da imagem, e o que importa são as medidas, tiradas das impressões. A metade de cima é uma M15 mais baixa, de pé; a de baixo fica de pé com a carta girada 90° no sentido anti-horário.

Medidas nas imagens do Scryfall, nas 69 impressões de borda preta (AKH, HOU, as promos de pré-estreia, The List, MH2, CLB e os decks de Commander), a de cima de pé (745 × 1040) e a de baixo na carta girada (1040 × 745):

| Medida | Valor |
|---|---|
| Barra do nome de cima | papel de y ≈ 52 a 105 (49 a 103 em algumas reimpressões); o custo no lugar da M15 |
| Barra de tipo de cima | papel de y ≈ 358 a 410, com o símbolo da coleção no fim, entre x 560 e 660 |
| Caixa de cima | papel de x ≈ 55 a 689 e de y ≈ 422 a 557; na moldura branca o fio em volta tem a cor do papel |
| Barra do nome de baixo | papel de y ≈ 57 a 110, de x ≈ 576 a 955; o custo acaba em x ≈ 947, ~37,4 px por símbolo (o híbrido, 44) |
| Barra de tipo de baixo | papel de y ≈ 345 a 397; acaba em x ≈ 940, antes do selo holográfico das raras |
| Caixa de baixo | papel de x ≈ 585 a 952 e de y ≈ 408 a 690 |

As 25 de Amonkhet Remastered e a promo do MTGO são só digitais; a de vitrine de MH2 e a da Secret Lair com a MSCHF ficam de fora.

### Fundir (25/11/2026)

As cartas com Fundir da moldura atual são reimpressões das de Dragon's Maze (moldura de 2003): Turn // Burn (GK1), Wear // Tear (CMR, DMC, MOC, PIP), Gallifrey Falls // No More (WHO) e Double Jump // Flying Kick (TMC), 9 impressões de borda preta com texto em PT. Deitada, a carta é a dividida da moldura atual (acima) com as caixas mais curtas e a faixa do Fundir no pé.

Medidas nas imagens do Scryfall, na carta deitada (1040 × 745):

| Medida | Valor |
|---|---|
| Caixas | acabam em y ≈ 665, num fio escuro, nas duas metades |
| Faixa do Fundir | papel de y ≈ 672 a 704 (675 a 707 nas de MOC) e de x ≈ 95 a 990, com as pontas arredondadas; passa por cima da borda preta entre as metades, com o degradê das cores das duas |
| Texto em inglês da faixa | "Fuse (You may cast one or both halves of this card from your hand.)", centralizado, de x ≈ 147 a 932; o lembrete em itálico |

Nos dados: o Arena (Pioneer Masters) tem o "Fundir" só no fim do texto da carta inteira, sem o lembrete, e dá às metades do Turn // Burn os nomes "turno" e "A Queima" (a carta inteira e a impressa em PT, no Gatherer, são "Transformar // Queimar"). O lembrete oficial em PT está no Wear // Tear impresso em PT (CMR e DMC): "Você pode conjurar uma ou ambas as metades deste card da sua mão."

### Divididas de 2003 (26/11/2026)

As divididas da moldura de 2003 são as de Dissension (DIS 149 a 158), Planar Chaos (PLC 112 a 114), as quinze com Fundir de Dragon's Maze (DGM 121 a 135) e as reimpressões na moldura de 2003 (Duel Decks, Planechase, Archenemy, Commander, Commander 2013, The List e a promo de pré-estreia do Breaking // Entering): 48 impressões de papel de borda preta, de 35 cartas. Deitada, cada metade é uma carta pequena da moldura de 2003, a da direita 501 px adiante.

Medidas nas imagens do Scryfall, na carta deitada (1040 × 745):

| Medida | Valor |
|---|---|
| Barra do nome | papel de y ≈ 50 a 101 e de x ≈ 52 a 490 (contorno da ponta em x ≈ 47); minúsculas de 72 a 91; o nome começa em x ≈ 59 e 560 |
| Custo | acaba em x ≈ 483 e 984; 36 px por símbolo (o círculo tem 32), 42 no híbrido |
| Barra de tipo | papel de y ≈ 420 a 453 (contorno da ponta em x ≈ 50); minúsculas de 433 a 447; a perna do "y" de "Sorcery" desce até 455, no chanfro do pé |
| Símbolo da coleção | a partir de x ≈ 446 e 946; o da Friday Night Magic de 2006, o mais largo, em 435 e 927 |
| Caixa | papel de y ≈ 465 a 663 e de x ≈ 53 a 483, num fio escuro, sem bisel claro; o texto em inglês chega a x 481 (Flesh // Blood) |
| Faixa do Fundir | caixas até y ≈ 613; papel da faixa de 617 a 658 e de x ≈ 52 a 985; "Fuse" em x ≈ 60 e o lembrete alinhado à esquerda logo depois, até ≈ 963; nas douradas, papel de 145 a 160 de brilho |

As letras, na Matrix Bold: o nome tem maiúsculas de 27 px, como na carta de pé de 2003 (ADR 0024), e o tipo de 20 (23 na carta de pé). Nos dados, das 35 cartas, 14 têm o texto impresso em PT, 12 o do Arena e 9 só a tradução não oficial; as duas da Friday Night Magic de 2006 têm o logotipo da FNM como marca-d'água na primeira metade e ficam de fora, como as cartas de pé com ele.

### Divididas da moldura antiga (26/11/2026)

As divididas da moldura antiga são as de Invasion (INV 292 a 296) e Apocalypse (APC 128 a 132) e as reimpressões na mesma moldura, de The List (APC-129 e APC-131, a imagem de Apocalypse) e de Time Spiral (TSB 106): 13 impressões de papel de borda preta, de 10 cartas; as seis douradas do Campeonato Mundial (WC01, WC02) ficam de fora pela borda. Deitada, cada metade é uma carta pequena da moldura antiga, a da direita 499 px adiante, sem barras: o nome e o tipo são letras brancas com sombra sobre a moldura texturizada, do tamanho das da carta de pé (ADR 0031).

Medidas nas imagens do Scryfall, na carta deitada (1040 × 745):

| Medida | Valor |
|---|---|
| Metades | de x ≈ 41 a 500 e de 539 a 999, de y ≈ 37 a 708; a borda preta entre elas, de 500 a 539 |
| Nome | primeira letra em x ≈ 73 e 572 (77 na de Time Spiral), linha de base em ≈ 75 (74 a 77), Goudy Medieval de ≈ 42,5 px; o pé do "p", do "y" e do "g" desce até ≈ 93, sobre os fios escuros do alto da arte, em ≈ 85 (a 89) e ≈ 94, com um bisel de ≈ 7 px entre eles |
| Custo | círculos de ≈ 35 px, um a cada 38, o último acabando em x ≈ 486 e 985 |
| Tipo | primeira letra em x ≈ 72 e 571, linha de base em ≈ 391 (388 a 394), serifada de ≈ 32,5 px; o fio de baixo da arte em ≈ 358 e o contorno da caixa em ≈ 402 |
| Símbolo da coleção | de x ≈ 434 a 466 e de y ≈ 363 a 399 |
| Caixa | muda com a cor: nas azuis e nas vermelhas, fio escuro em x ≈ 69 a 72 e bisel de 9 px (papel de 80 a 459 e de y 411 a 625); na branca, só o fio (papel de 74 a 465 e de 408 a 633); nas pretas e nas verdes, pergaminho de beira irregular sobre a moldura (de ≈ 71 a 466 e de 404 a 635). Na de Time Spiral, o papel vai de 80 a 463 e de 415 a 627 |
| Texto em inglês | de x ≈ 89 a 449 (86 a 456 na de Time Spiral) e de y ≈ 429 a 611; o alinhado à esquerda começa de 88 a 91, e o centralizado mais curto, em 95 (Reality) |

O papel da caixa não sai pela medida das cartas de pé (`insideBoxSides`): o degrau do papel para o bisel claro das azuis fica abaixo de 20 tons em boa parte das linhas, e a beira do pergaminho fica fora da busca dela. A distância de cor até o papel do miolo separa os três desenhos: numa coluna de papel ela fica de 6 a 26 (o grão das vermelhas é o mais forte), no bisel de 14 a 60 e na moldura acima de 30; o limite de 1,6 vez a do papel, mais 6, para no lugar certo nas 26 caixas. O texto alinhado varia por metade, não por carta: no Wax // Wane, o da esquerda é alinhado à esquerda e o da direita, centralizado. Nos dados, das 10 cartas, 2 têm o texto impresso em PT (Order // Chaos e Assault // Battery, este com o texto antigo da de Time Spiral), 1 o do Arena (Life // Death) e 7 só a tradução não oficial, com os nomes impressos em PT.

### Mutação (26/11/2026)

Como as ferramentas existentes fazem: o Proxyshop tem um molde próprio para a Mutação, com uma camada de texto à parte para a linha da Mutação, mas monta a carta inteira do zero, com a moldura digital do molde; ninguém reaproveita a faixa translúcida da carta impressa, com a arte por trás.

Medidas nas imagens do Scryfall (745 × 1040), nas 59 impressões de papel na moldura comum (IKO, PIKO, C20, DMC, MOC, PL22, The List):

| Medida | Valor |
|---|---|
| Faixa | do alto da caixa (y ≈ 654 a 657) até a sombra do fio, translúcida, com a arte por trás; mediana das linhas de 150 a 245 |
| Fio | linha mais escura em y 783 a 787 (1 a 3 linhas), 85 a 160 tons abaixo do papel; a sombra acima dele escurece só nas 2 ou 3 linhas antes dele |
| Papel | de y ≈ 787 a 956 a 964, mediana de 220 a 250, como o da M15 |
| Texto | em inglês, o lembrete da Mutação em 4 linhas na faixa; na impressa em PT (IKO 155, IKO 16), em 5, com a letra da carta inteira menor, a mesma nas duas partes |

A escolha (ADR 0040): o fio medido na imagem parte a caixa; o papel é apagado como o da M15 e a faixa vai à rede neural com a máscara das naves com Posicionar (a mesma caixa translúcida de letra escura), num quadro só; o texto é partido na primeira linha, e as duas partes saem com a mesma letra, como na impressa em PT.

### Níveis, Subir de Nível (26/11/2026)

Como as ferramentas existentes fazem: o Proxyshop tem um molde próprio (`LevelerTemplate`, com o `LevelerLayout` partindo o Oracle em três partes por uma expressão regular): uma camada de texto para o "Level up", e uma de texto, uma de intervalo e uma de P/R para cada nível, cada texto na caixa de referência da sua faixa, na moldura digital do molde. O fork do preshtildeath pedia ajuste à mão das camadas de texto dos níveis. Num fórum do Magic Set Editor, o molde dos níveis é criticado por não usar a mesma letra nas duas faixas de nível, como a carta impressa (Kargan Dragonlord). Ninguém reaproveita a moldura da imagem.

Medidas nas imagens do Scryfall (745 × 1040), nas 55 impressões suportadas (41 na moldura de 2003: ROE, DDG, C13 e The List; 14 na atual: DDP, CMA, MH1, C21, LCC e The List):

| Medida | Valor |
|---|---|
| Faixas | três, fixas; o papel da faixa do alto, de 220 a 245; cada faixa de baixo de 9 a 39 tons (2003) ou de 16 a 26 (atual) mais escura que a de cima, a mudança em y 743 a 749 e 835 a 842 (2003) ou 745 a 750 e 846 a 853 (atual) |
| Caixas de P/R | uma por faixa, à direita, a partir de x ≈ 553 (2003, contorno preto) ou 576 (atual, contorno cinza, de 115 a 130) |
| Selos | nas duas faixas de baixo, à esquerda, até x ≈ 184 (2003) ou 143 (atual); o "LEVEL" muda de 2 a 3 px de lugar entre coleções (C13, DDG) |
| Pé do papel | o filete claro começa em y 931 a 933 (2003) ou 955 a 957 (atual), de 13 a 76 tons acima do papel |
| Texto | em PT (ROE), a mesma letra nas três faixas; o selo diz "NÍVEL", e o intervalo e o P/R são os mesmos |

A escolha (ADR 0041): as faixas, as caixas de P/R, a palavra dos selos e o pé do papel medidos na imagem; cada faixa apagada como a caixa de sempre, à parte; o texto com a mesma letra nas três faixas e o "NÍVEL" no lugar do "LEVEL".

### Invocações de Final Fantasy (26/11/2026)

As criaturas Saga nasceram em Final Fantasy (2025): a MTG Wiki ("Saga creature") descreve a moldura como a da Saga com a barra de tipo mais alta, para caber a caixa de P/R, uma caixa pequena abaixo dela para as outras habilidades ou o flavor, a arte mais curta e o lembrete na largura da carta, logo abaixo do nome. As habilidades dessa caixa não são de capítulo. Não achei molde próprio para elas no Proxyshop (o molde de Saga monta a Saga comum) nem no Card Conjurer.

Medidas nas imagens do Scryfall (745 × 1040), nas 29 impressões de borda preta (FIN, FIC e as promos de pré-estreia de FIN):

| Medida | Valor |
|---|---|
| Faixa do lembrete | na largura da caixa, o papel até x ≈ 684; o fio de baixo em y = 221 nas 29, onde a arte começa; a curva da tira dos marcadores desce até o pé dela, à esquerda (a última linha em inglês começa uns 24 px depois) |
| Coluna dos capítulos | do fio do lembrete ao alto da barra de tipo, com o fio da arte em x ≈ 370 a 374, como na Saga comum |
| Barra de tipo | o fio de cima de 786 a 789 (uns 84 px acima do da Saga comum); escurece perto do símbolo da coleção, de ~225 em x 580 a ~170 em x 640; o símbolo começa em x ≈ 636 (FIN) ou 648 (FIC) |
| Caixa de baixo | dos lados da caixa da carta comum (o papel de x 55 a 684) até y ≈ 953, a 12 px do pé da barra de tipo; a caixa de P/R e o selo da coleção como na carta comum |
| Texto | a palavra-chave ("Flying", "Ward {2}") ou o flavor centralizados, no corpo da caixa da carta comum, maior que o dos capítulos |

A escolha (ADR 0042): o caminho da Saga na coluna medida, com o fio do lembrete fixo e o lembrete desviando da curva; a barra de tipo sem o escurecimento enquanto se acha o símbolo e se apaga; a caixa de baixo como a da carta comum, com a letra dela.

### Cartas de fundir, meld (26/11/2026)

Como as ferramentas existentes fazem: o Proxyshop trata a carta de fundir como a de transformar (o layout de transformar, com o ícone de fundir desde a v1.5 e os dados da carta fundida corrigidos na v1.4): o ícone fica visível e o P/R do outro lado vai numa camada própria no pé da caixa (`TransformMod`, `text_layers_transform_front`). A carta fundida não tem molde: a imagem é a junção dos dois versos.

Na imagem do Scryfall (745 × 1040), nas 34 frentes de borda preta: a moldura da carta comum, com o ícone à esquerda do nome (o círculo; a lua com o Eldrazi em EMN, V17 e nas promos de EMN) e o P/R da carta fundida em cinza no canto de baixo da caixa, como o do verso nas de transformar, também nos terrenos (Ameias de Hanweir, "7/4") e com estrelas quando a fundida é "*/*" (Titânia, Voz de Gaia, e Argoth). A frente do Urza, Lorde Protetor e a das Pedras de Força e de Fraqueza não imprimem nada (a fundida é um planeswalker). Nas impressas em PT (EMN, BRO) o lembrete é "(Funde-se com Gisela, a Lâmina Partida.)".

A escolha (ADR 0043): o caminho da carta comum com o ícone e o P/R do verso, o P/R vindo da carta fundida e o lembrete das impressas.

### Cartas viradas de Kamigawa, flip (26/11/2026)

A MTG Wiki ("Flip card") descreve a moldura: a arte no meio, e de cada lado dela a barra do nome com o custo, a caixa de texto e a barra de tipo, com a caixa de P/R no fim da barra quando há; as duas metades viradas para dentro, a de baixo de cabeça para baixo; o artista, o copyright, o número e o símbolo da coleção abaixo da metade de baixo. São 21 cartas (20 de Kamigawa e a Curse of the Fire Penguin, de Unhinged); as fichas de Papel de Wilds of Eldraine também têm o layout `flip` no Scryfall. Não achei molde de carta virada no Proxyshop nem no Card Conjurer.

Medidas nas imagens do Scryfall (745 × 1040), nas 33 impressões de borda preta e branca; a de baixo, girada 180°:

| Medida | Moldura de 2003 | Moldura atual (C18, CM2) |
|---|---|---|
| Caixa da de cima | papel de x 60 a 678 e de y 131 a 257 (na branca, a borda tem a cor do papel) | de x 58 a 690 e de y 99 a 231 |
| Barra de tipo da de cima | fio de cima em 257 a 259, o de baixo em 311 a 314 | de 232 (o fio grosso até 243) a 296 |
| Caixa da de baixo | de x 66 a 684 e de y 159 a 285 (6 px mais à direita) | de x 57 a 689 e de y 179 a 312 |
| Barra de tipo da de baixo | de 285 a 341; na branca, um fio do fim da caixa 10 px acima | de 313 a 377 |
| Tipo | começa em x ≈ 63 a 67; o centro das minúsculas 33 a 36 px abaixo do fio de cima | começa em x ≈ 63; 38 a 41 px abaixo |
| Caixa de P/R | o fio escuro de dentro em x ≈ 593 a 599, com a sombra começando 6 a 11 px antes (até 24 nas digitalizações da Hachette); só na criatura | o fio em 599 a 606; o símbolo da coleção de 555 a 591, só na de cima |
| Texto | alinhado à esquerda; centralizado no texto curto (Rune-Tail, SOK 27) | alinhado à esquerda |

Nenhuma saiu em PT com texto no Scryfall, e o bloco de Kamigawa não está no Arena: todas têm só a tradução não oficial, com o nome em inglês. A Erayo, Soratami Ascendant, banida no Commander, não tem nem ela.

A escolha (ADR 0044): como a Consequência, cada metade apagada e escrita na orientação dela (a de baixo na carta girada 180°), com as barras de tipo achadas pelos fios, a caixa de P/R pelo fio de dentro, a caixa pelo papel; o nome fica.

### Caso (26/11/2026)

As regras (719, "Case") definem o Caso como um tipo de encantamento com três partes: uma habilidade, a condição "To solve" e a habilidade "Solved", que só vale depois de solucionado. A MTG Wiki ("Murders at Karlov Manor") lista os 12 de MKM (5 raros e 7 incomuns) e a variante do Case of the Gorgon's Kiss com o cobertor de outra cor (um dos quebra-cabeças da coleção, sem número próprio: o Scryfall a separa como MKM 79†). A moldura é a coluna da Classe sem as barras: o Scryfall dá às 25 impressões de papel o layout `case`, todas de borda preta na moldura atual (só a Case of the Lost Witness, MBC 62, com o céu estrelado). Não há Caso de vitrine nem sem borda.

Medidas nas imagens do Scryfall (745 × 1040), nas 24 impressões de papel com texto (MKM, MKC e as promos de PMKM):

| Medida | Valor |
| --- | --- |
| Fio escuro da esquerda e da direita da coluna | x 371 a 372 e 686 a 688 (os da Classe) |
| Papel da coluna | y 122 a 865 (sombra do fio de cima até 121; filete claro do pé em 866) |
| Fio entre as partes | 2 linhas, ~110 a 120 no meio (x 456 a 600), esmaecendo até o papel em x ≈ 400 e 660; nas promos reamostradas, 3 ou 4 linhas, com o meio de 100 a 150 |
| Folga do inglês em volta de cada parte | 16 a 22 px |
| Texto do inglês | de ~24 a ~32 de corpo (36 px entre linhas no Case of the Gateway Express) |

### Protótipo (26/11/2026)

As regras (718.1) descrevem a moldura: uma moldura menor embutida abaixo da linha de tipo, com a palavra-chave e o segundo custo, poder e resistência; a MTG Wiki ("Prototype") completa: a caixa de texto partida em duas na horizontal, a parte de cima com um fio da cor do custo do protótipo. São 21 cartas: 17 de The Brothers' War, a Frogmyr Enforcer de Modern Horizons 3 e duas do Alchemy (só digitais). O Proxyshop (`PrototypeTemplate`, `PrototypeLayout`) parte o Oracle na primeira linha: dela tira o custo e o P/R do protótipo, que vão em camadas próprias (a aba e a caixa), e o resto vai na caixa de baixo; a palavra com o lembrete fica numa camada de texto da faixa.

Medidas nas imagens do Scryfall (745 × 1040), nas 40 impressões de papel (BRO, as promos de PBRO, The List e MH3, com as de arte estendida):

| Medida | Valor |
|---|---|
| Faixa | da cor do custo do protótipo, com grão como o papel; começa em y 658 a 662 (666 na Woodcaller de arte estendida, BRO 377), depois de um fio de 2 a 10 px (claro e fino na branca, da cor da faixa nas outras), e tem 98 px de altura |
| Pé da faixa | um filete claro de 2 a 8 px, o fio (4 a 7 px nas coloridas, um traço cinza na branca) e o papel 108 a 118 px abaixo do alto da faixa (113 ou 114 em quase todas) |
| Aba do custo | lado esquerdo em x 574 com três símbolos e 607 com dois (de 568 a 604 nas de arte estendida e na MH3); contorno escuro, ao menos 50 tons abaixo da faixa |
| Caixa de P/R da faixa | lado esquerdo em x 576 a 583, de ~42 px abaixo do alto da faixa até o pé dela |
| Lembrete em inglês | três linhas, a primeira acabando em x ≈ 556, antes da aba; letra preta, como no papel |
| Impressa em PT | "Protótipo (Você pode conjurar esta mágica com custo de mana, cor e tamanho diferentes. Ela permanece com suas habilidades e tipos.)" em três linhas, com a mesma letra do papel |

O Arena traz a palavra junto das outras da primeira linha, sem o custo e sem o lembrete ("Protótipo, voar"); as 19 cartas de papel têm impressa em PT, com o lembrete na linha entre o custo e o P/R do protótipo (o Scryfall marca a faixa com "//PRT-Prototype_Mech//").

A escolha (ADR 0045): como a Mutação, a caixa partida em duas, com a faixa medida na imagem e as abas como estão; o texto do Arena com o lembrete das impressas no alto.

### Moldura de 1993 (26/11/2026)

A moldura que o Scryfall chama de `1993` vai de Alpha (1993) a Alliances (1996), com as edições básicas até a 4ª, as Collectors' Editions, Chronicles, Summer Magic, os decks de introdução da época e as promos (Arena League, livros, Harper Prism): 3.090 impressões em inglês, 1.754 de borda preta, 1.100 de borda branca e 236 douradas, do Campeonato Mundial.

Medidas nas imagens do Scryfall (745 × 1040), em 149 impressões de 24 coleções:

| Medida | Valor |
|---|---|
| Letras | claras com sombra nas molduras escuras de Revised em diante; "gravadas" (miolo cinza um pouco mais claro que a moldura, contorno escuro, brilho claro do outro lado) de Alpha a Unlimited, nas Collectors' Editions e nas molduras claras; traço de 1 ou 2 px nas gravadas |
| Retícula | de Alpha a Revised, nas Collectors' Editions, em Legends e em Summer Magic: 40 tons ou mais de um ponto a outro; some numa gaussiana de 1,2 px, o traço das letras fica |
| Nome | primeira letra em x ≈ 51 a 67 (69 a 79 nas terras da Arena League); linha de base de 70 a 88; de Alpha a Revised, nas Collectors' Editions e na Arena League (linha de base de 79 para baixo) o nome tem 93% da largura dele na Goudy Medieval de 41,5 px, e de 4ª em diante, ~102% |
| Custo | círculos de ≈ 35 px, um a cada 40,5, o último acabando em x ≈ 676 a 681 |
| Tipo | primeira letra em x ≈ 62 a 86, linha de base de 606 a 616, serifada de ≈ 33 px; "Summon Giant", "Enchant Creature", "Mono Artifact" de Alpha a Revised |
| Símbolo da coleção | na ponta direita da linha de tipo, de x ≈ 570 (a cimitarra de Arabian Nights) a 690; as básicas até a Revised e as Collectors' Editions não têm |
| Caixa | papel de x ≈ 80 a 104 até 642 a 670 e de y ≈ 615 a 632 até 910 a 946; bisel com fio, pergaminho queimado nas pretas, tábuas nas verdes, papel texturizado nas brancas e nos artefatos |

A faixa das letras sai melhor pela energia da imagem bem alisada (a média, linha a linha, da diferença de brilho entre colunas vizinhas numa gaussiana de 1,6 px) que pixel a pixel: o pé da faixa fica na linha de base (diferença mediana de 0 px contra a medida das letras claras) e o fim do primeiro trecho, no fim do texto em inglês (3 a 6 px depois, salvo bolhas da pedra coladas). O começo do trecho não serve: a beira da moldura (x ≈ 46) e o canto da arte, na linha de tipo, também têm energia.

A caixa muda de papel com a cor: a água das azuis, a pedra das vermelhas, as tábuas das verdes, o pergaminho queimado das pretas, o mosaico dos artefatos e, claros e sem cor (mediana do brilho de 150 para cima e da diferença entre os canais até 34, e a cor das médias de blocos de 10 px quase sem variar, 20 das 149 da amostra), a renda das brancas, a névoa das douradas e o papel das terras. Nos cinco primeiros o apagamento de sempre (a pirâmide com o grão copiado) não deixa marca, desde que a beira queimada e o bisel não sirvam de fonte. Na renda, com o texto denso, ele deixava um cinza liso e manchado, com tracinhos do grão copiado da renda nas linhas apagadas (Wall of Swords, SUM 43), e a rede neural refaz uma textura parecida, sem as manchas; no mosaico, de pedras de cores diferentes, ela borrava as pedras, e a pirâmide acerta.

A escolha (ADR 0039): o estilo, o tamanho e a linha medidos no inglês; quando a medida não fecha, a faixa inteira à rede neural, em dois quadros na resolução da imagem; a caixa medida pela cor e as letras dela numa cópia alisada.

### Marcas-d'água na moldura de 2003 (25/11/2026)

Como as ferramentas existentes fazem: o Proxyshop não reaproveita a imagem; ele monta a carta do zero e põe a marca-d'água como uma camada vetorial, desenhada à parte a partir do nome que o Scryfall dá (`watermark`). O Proxinho escreve sobre a digitalização, então a marca já está lá e precisa ficar: apagar a caixa inteira levava a marca junto, e apagar só onde as letras passam deixava a marca em cacos. A saída é a mesma da arte sem borda (ADR 0012): só as letras saem da máscara, e a rede neural (LaMa) refaz o que estava por baixo delas, a marca inclusive.

Medidas em 71 faces de 73 impressões, de todas as marcas da época: a marca fica de 15 a 40 tons abaixo do papel (as letras, mais de 150), e a cor das marcas das guildas passa de 60 perto das letras (o sol dos Boros), enquanto o miolo dos símbolos de mana do texto passa de 120. Os logotipos das promos são outra coisa: grandes, com letras, contorno escuro ou foil holográfico, e a rede neural os refaz em borrões; ficam de fora (adendo do ADR 0024).

### Classes (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop tem, para a Classe (`ClassMod`), uma camada de texto por nível. Ele encolhe todas até caberem na coluna (`scale_text_layers_to_height`), espalha-as com a mesma folga acima e abaixo de cada uma (`spread_layers_over_reference`) e põe uma barra de nível entre cada duas (`position_dividers`). A barra é desenho do modelo, com o custo e o "Level N" escritos por cima. Aqui a barra faz parte da imagem escolhida: o Proxinho a recorta com o custo, tira o "Level N" e a cola onde o plano do texto em PT pede, com a mesma folga do Proxyshop (ADR 0019).

Medidas nas imagens do Scryfall (745 × 1040), em AFR, CLB, BLB, BLC, TMT, SOC e nas promos:

| Medida | Valor |
|---|---|
| Coluna de texto | x ≈ 375 a 681, do fio do lembrete ao fio de cima da barra de tipo (~867) |
| Fio preto entre a arte e a coluna | x ≈ 370 a 374 |
| Bisel cinza e fio da direita | bisel de ~681 a 686, fio escuro de ~686 a 690 |
| Lembrete do alto | caixa de altura fixa de ~121 a 203, fio fino cinza em ~206 em todas |
| Barra de nível | linha preta de 2 a 4 px na largura toda da coluna, passando pelo bisel, com um chanfro em "v" no meio (x ≈ 520 a 540, até 14 px abaixo); um brilho claro ~4 px acima; degradê cinza até ~48 px abaixo da linha |
| Rótulo da barra | custo à esquerda; "Level N" em Beleren, acabando em x ≈ 668 a 672, no meio do degradê |
| Barra de tipo | como a da Saga, de ~862 a 900 |

O que o texto em PT pede: o Arena não tem o lembrete do alto, que vem das Classes impressas em PT (o mesmo texto em inglês nas 28 Classes com texto oficial; 15 delas, de Bloomburrow e das Tartarugas Ninja, não têm imagem em PT nenhuma). O Arena traz uma linha "CLASSLEVEL [3] […]" que repete a habilidade do nível 3 da Classe: Ladino, e o texto impresso do Scryfall traz linhas "//Level_2//" entre a barra e a habilidade: as duas saem no pipeline. Na carta impressa em PT o lembrete ocupa três linhas na mesma caixa, e as barras mudam de lugar quando um nível cresce mais que os outros.

Promos de loja (AFR) com o "&" de D&D em alto-relevo: o relevo atravessa a coluna e as barras. Recortar as barras levava pedaços dele, e o resto ficava pela metade no papel apagado; elas saem na original.

### Naves e planetas com Posicionar (20/11/2026)

Como as ferramentas existentes fazem: o Proxyshop monta a Station a partir do próprio modelo, com uma camada de texto por nível, o selo e as faixas desenhados por cima, e espalha os textos com a mesma folga acima e abaixo de cada um, como na Classe. As artes estendidas da própria coleção, que vêm sem a explicação do Posicionar, fazem igual: faixas mais altas e a mesma folga em volta de cada texto. Aqui as faixas fazem parte da imagem escolhida, com a arte por trás: o Proxinho tira o escurecimento delas, apaga as letras, os selos e a caixa de P/R com a rede neural e escurece de novo onde o texto em PT pede (ADR 0020).

Medidas nas imagens do Scryfall (745 × 1040), em EOE, EOC, TRK, TRC e nas promos:

| Medida | Valor |
|---|---|
| Caixa de texto | translúcida, de x ≈ 55 a 687 (fio da esquerda de 49 a 54, beira sombreada de 684 a 687, fio da direita de 688 a 693) e de y ≈ 656 ao pé (~956, o fio claro 8 px acima da borda preta) |
| Faixas dos níveis | da largura da caixa, cada uma mais escura que a de cima (~0,87 nas molduras brancas; nas coloridas, cada canal de um jeito), com a arte atrás; o limite é uma rampa de ~4 px; a última vai até o pé da caixa |
| Selo do nível | redondo, centro em x ≈ 49,5, anel claro de raio ~29 e miolo escuro de raio ~23 com o nível em branco ("9+", "10+"), meio para fora da caixa, no meio da altura da faixa |
| Caixa de P/R | na última faixa, na altura do selo: miolo escuro de x ≈ 597 a 698 no meio, mais curto no alto e no pé (as pontas abauladas), ~42 px de altura; anel de ~6 px, que dos lados, com a beira cinza, vai até 7 px depois do miolo e embaixo, com a sombra, até 8 |
| Selo da coleção | holográfico, no meio do pé da caixa |

O que o texto em PT pede: o Arena marca cada nível com uma linha interna antes das habilidades dele (em inglês "STATIONLEVEL [9+] [3/4] [Flying] [First strike]", em PT "#StationLevelInstrinsic_NoTranslation"); o pipeline lê o nível no inglês e escreve como o Oracle ("9+ | Voar, iniciativa"). A explicação do Posicionar nunca saiu impressa em PT e os arquivos públicos do Arena não têm lembrete nenhum (nenhum dos 54.581 textos em PT tem parênteses); ela vem da dica do jogo instalado (ver a seção seguinte e o ADR 0021). 23 naves de Star Trek e de Commander não estão no Arena e seguem em inglês.

A rede neural: num quadro só, com a caixa inteira (697 px com o espelho) reduzida aos 512 px do modelo, as palavras densas da explicação em inglês viravam um borrão cinza no lugar delas (Lumen-Class Frigate, EOE 25). Em duas metades, cada uma na resolução da imagem, o borrão some. Na sem borda valeu o contrário (ADR 0015): ali as letras são brancas, finas e esparsas.

### Explicações das palavras-chave pelas dicas do Arena (20/11/2026)

De onde vem: o Arena mostra, ao lado da carta, a explicação de cada palavra-chave, traduzida oficialmente. O texto fica no banco da interface do jogo instalado, `MTGA_Data/Downloads/Raw/Raw_ClientLocalization_*.mtga`: um SQLite com a tabela `Loc` (`Key`, `Bundle` e uma coluna por idioma: `enUS`, `ptBR`…). As dicas têm chaves `AbilityHanger/Keyword/<Nome>_Body` e `AbilityHanger/AbilityWord/<Nome>_Body`, com o título em `_Title`. Na versão 2026.65 do cliente são 1.099 dicas com inglês e português. Os arquivos públicos da Untapped têm só o texto das cartas, sem as dicas.

Ninguém publica essas dicas em PT: os sites de cartas mostram o lembrete em inglês do Oracle, e as listas da comunidade traduzem por conta própria.

Como a dica se compara ao lembrete da carta (comparação com os lembretes do Oracle das cartas de papel):

| O que muda | Exemplo | O que o pipeline faz |
|---|---|---|
| Ordem das palavras | "Put charge counters on this Spacecraft equal to its power" na dica do Posicionar, "…equal to its power on this Spacecraft" na carta | Compara as palavras sem a ordem, com variáveis só de número |
| Variáveis | "{chargeRequirement}", "{numeral}", "{abilityCost}", "{mana}" | Recebem o número (em algarismos) ou o custo da carta |
| Jeito de falar da carta | "it" na dica da Dobra Espacial, "this creature" na carta; "its" no Power-up, "his" na carta do Shang-Chi | Aceito; o "it" da carta só quando é a própria carta |
| "token" | "create a 1/1 copy" na dica da Cria, "a 1/1 token copy" na carta | Aceito: o que se cria é sempre uma ficha |
| Começo de definição | "To manifest dread, look at…" na dica, "Look at…" na carta | A dica em PT perde o "Para Manifestar Pavor," |
| Símbolos | "{o2}" e "o2" | Viram "{2}" |
| Tradução errada | Enweb e Web-slinging sem o "virada"; Mayhem do terreno com "conjurar" | Fora (`HINT_SKIP`) |
| Sem tradução | Discover N, com o PT igual ao inglês | Fora |

Qualidade: dos 194 lembretes que as cartas impressas em PT já traziam e que uma dica também cobre, 81 são idênticos ao impresso e a semelhança mediana é de 98,7% (a diferença típica é "para cada" contra "por cada"). As diferenças grandes eram o impresso antigo: o atropelar dos Fractius da M14 e o toque mortífero de antes de 2010, que não dizem o mesmo que o lembrete de hoje.

Resultado: 164 lembretes em inglês ganham texto em PT, em 643 cartas (632 de papel). Os maiores grupos: Posicionar (as naves e planetas), Preparar (61 cartas de Secrets of Strixhaven), "Liguem seus motores!" (39), Exaustão (33), Dobra Espacial (29), Definhar (29), Bushido (26), Manifestar Pavor (22) e Cria (20). As cartas com número por extenso ("Mobilize 2" diz "two") entraram em 25/11/2026, com o número por extenso em PT ("crie duas fichas"): com elas, 692 cartas. Ficam de fora as dicas que dizem outra coisa (Prototype, Suspend sem o "it has haste", Partner com "Parceiro" onde a carta diz "this ability") e a "it" que não é a própria carta (o Changeling da ficha do Stalactite Dagger).

## Cartas prontas no servidor (21/11/2026)

O João pediu a experiência instantânea, com tudo montado no servidor (o Proxinho é para ele e para colegas próximos, decisão de 20/11/2026). Como o mercado faz:

- **Imagem pronta num CDN** é o padrão de quem abre na hora: o MPC Autofill serve imagens já montadas por um cache na borda, e o Scryfall e os sites de deck servem a imagem da carta. Quem monta (Card Conjurer, MtG Proxy Printer, Proxyshop no desktop) monta uma carta por vez, no aparelho, e a pessoa espera.
- **Montar sob demanda num navegador da nuvem** (Cloudflare Browser Run): 10 horas por mês no plano pago e US$ 0,09 por hora depois; a primeira visita continua esperando, e a rede neural (15 s a 1 min por carta no processador) passa do incluído.
- **Outro motor no servidor** (node-canvas, Skia) seriam dois motores para manter iguais, com fontes e antialiasing diferentes.

A escolha (ADR 0022): o mesmo motor, rodado de antemão num Chromium com o Playwright, grava cada carta no R2 com a mesma chave das cartas guardadas no navegador (o resumo do código, as fontes e a entrada inteira da carta), e o site procura lá antes de montar. São 57.693 artes suportadas com texto oficial (21.470 cartas, 3.616 sem borda, 615 de duas faces), ~115 mil imagens (prévia e face do PDF) e ~20 GB: o R2 cobra US$ 0,015 por GB por mês além dos 10 GB grátis (KV seria US$ 0,50 por GB). A arte padrão de cada carta vem primeiro, das mais jogadas às menos.

**Onde rodar a montagem, de graça (21/11/2026).** A documentação de cobrança do GitHub Actions diz que as máquinas padrão são grátis em repositório público e que as maiores são cobradas mesmo em público; cada job tem no máximo 6 horas e uma conta grátis roda até 20 jobs ao mesmo tempo. A cota grátis do R2 (10 GB, 1 milhão de gravações e 10 milhões de leituras por mês) é da conta inteira, e o plano Workers Paid não a aumenta; acima dela, US$ 0,015 por GB por mês. Para o job gravar sem senha guardada, o padrão de mercado é o token OIDC do provedor de CI (a "publicação confiável" do PyPI e do npm, e o acesso do GitHub Actions à AWS, ao Google Cloud e à Azure): o GitHub assina um JWT de poucos minutos com o repositório, a branch e o workflow, e quem recebe confere a assinatura com as chaves públicas de `token.actions.githubusercontent.com/.well-known/jwks` e as afirmações, pelo número do repositório (o nome muda com renomeação). A escolha (ADR 0023): 12 máquinas padrão, o token OIDC conferido pelo Worker e um limite de 5 GB no depósito, com a rede neural primeiro. Em 25/11/2026 o limite subiu para 6 GB: com 5 GB o depósito encheu e as cartas traduzidas depois ficavam de fora, e o R2 da conta só tem esse depósito.

## Tradução das cartas sem texto oficial (21/11/2026)

Depois de tirar a falsa imagem em PT do Scryfall, 7.384 cartas ficavam sem texto oficial, 987 delas entre as 10 mil mais jogadas no EDHREC. O João pediu para traduzi-las, marcadas como não oficiais.

- **Padrão de mercado.** O MtG Proxy Printer, o concorrente mais próximo, troca o texto por uma caixa lisa e usa tradução de máquina (um tradutor de IA, o Google ou a Microsoft), com um selo "MT" na carta. Erra a terminologia que o Arena escreve sempre igual ("terra" por "terreno", "lançar" por "conjurar").
- **Estado da arte.** Tradução guiada por glossário e por exemplos aprovados (memória de tradução). Na tarefa de terminologia do WMT 2025, dar a terminologia certa melhorou a qualidade e o acerto dos termos, e os melhores sistemas chegaram perto de 100% de acerto por frase. Traduzir e depois revisar impondo os termos (DuTerm, 2025) e buscar exemplos aprovados na hora de traduzir são o que a localização de jogos usa hoje.
- **A memória que já existe.** As 26.416 faces oficiais dão 29.629 linhas distintas pareadas com o Oracle. Nas 5.305 cartas que têm a tradução (25/11), 35% das linhas já tinham saído iguais numa carta oficial e 4% só mudavam nos números (o molde da oficial serve); 62% precisaram de tradução.

A escolha (ADR 0025): a linha oficial igual, depois o molde, depois a tradução feita uma vez, com os pares oficiais parecidos à vista e o glossário das cartas oficiais, guardada no repositório e conferida nos números e símbolos. A carta só ganha a tradução quando todas as linhas e o tipo têm tradução, e a interface a marca como não oficial.

## Auditoria e o padrão de mercado (25/11/2026)

O João pediu o Proxinho "perfeito e completo", com arquitetura, UI/UX e desempenho no padrão de mercado. A auditoria do site no ar:

- **Desempenho.** Lighthouse 99 no celular e 96 no computador (o que faltava era o deslocamento de layout, CLS 0,099, no computador). Um deck de 100 cartas (Liesa) fica pronto na tela em 8,6 s, com 176 das 180 imagens vindas do servidor (ADR 0022), e o PDF sai 1,4 s depois do clique. Já está acima do mercado: o Moxfield e o Archidekt mostram a imagem pronta do Scryfall, sem montar nada.
- **Acessibilidade.** O axe não achou nada além do papel de aba (`tabpanel`) posto num `<form>`, que o ARIA não aceita: o papel foi para um `div` em volta.
- **O que os sites de referência têm e o Proxinho não tinha.** O Moxfield e o Archidekt guardam o deck e o compartilham por link, mas com conta; o Scryfall (`/cards/named?fuzzy=`) e os sites de deck acham o nome com erro de digitação. Ferramentas sem conta guardam o documento inteiro no endereço (o playground do TypeScript comprime o código depois do `#`), e o que vem depois do `#` nunca chega ao servidor. Faltavam também o manifesto do app, a prévia do link (`og:image`) e um `robots.txt` (o endereço devolvia a página do site).
- **Regressão.** A regressão de 630 cartas, exigida antes de toda publicação que muda o desenho, vivia fora do repositório e se perdia com a máquina. As ferramentas de mercado (Percy, Chromatic, o `toHaveScreenshot` do Playwright) guardam as imagens de referência num serviço ou no repositório, e as do Proxinho não podem ir para um repositório público (são cartas da Wizards).

As escolhas: o pedido como lista no `localStorage` e num link `#pedido=` comprimido com o `CompressionStream` do navegador, "Você quis dizer…?" no Worker com Damerau-Levenshtein sobre os nomes do banco (ADR 0028), e a regressão no repositório, com a amostra versionada e as imagens só na máquina (ADR 0027).

## A faixa das cartas modais (25/11/2026)

A faixa do pé das cartas modais de duas faces resume o outro lado, e nenhum dado do Scryfall a traz. Conferida nas imagens das 99 cartas (em inglês) e nas impressões em PT de ZNR, KHM, STX e MH3:

- **O que ela diz.** Terreno do outro lado: "Land" e a última habilidade de mana ("{T}: Add {W} or {B}."). Sem subtipo: o tipo sem os supertipos ("Artifact" para "Legendary Snow Artifact"). Com subtipo: o último em ZNR, KHM e STX ("Cleric", "God", "Tibalt", "Vehicle"); em MH3, "Human" (Witch Enchanter), "Elf" (Disciple of Freyalise) e "Monk" (Pinnacle Monk). Desde Marvel's Spider-Man (setembro de 2025): "4/4 Creature", e o mesmo em Marvel Super Heroes e Marvel's Deadpool.
- **Em PT.** As impressões traduzem a palavra pela linha de tipo oficial ("Clérigo", "Deus", "Mago", "Ave", "Humano", "Mágica Instantânea" apertada até o custo, "Veículo", "Aura") e a habilidade pelo texto oficial ("{T}: Adicione {W} ou {B}.", num corpo menor que o da palavra quando falta lugar).
- **Medidas.** O miolo vai de y ≈ 927 a 965 (925 a 964 nas digitalizações de 744 px), a palavra começa em x ≈ 52 e o custo e a habilidade acabam em x ≈ 320, com ~24 px por símbolo (~27 nos híbridos).

A escolha (ADR 0029): a faixa montada do texto oficial da outra face, com as regras por coleção e as duas exceções de MH3.

## Lado legal e o caminho seguro

| Ponto | O que diz | Risco |
|---|---|---|
| Política de Conteúdo de Fãs da Wizards | Permite conteúdo de fã gratuito; proíbe vender, usar logos e tirar avisos de copyright; exige o aviso de "não aprovado". E exclui expressamente criar proxies, mesmo grátis ("does not include … creating counterfeit/proxy Magic cards"): não é permissão para o Proxinho | Médio: a tolerância vem da posição de 2016 (uso pessoal). O Proxinho é para o dono e colegas próximos (decisão de 20/11/2026) |
| Posição da Wizards sobre proxies (2016) | O foco é falsificação e eventos oficiais; não fiscalizam cartas de teste para uso pessoal | Baixo no uso pessoal |
| Card Conjurer (2022) | Gerador web recebeu notificação; a Wizards citou cópia literal de texto e arte | Médio num site público |
| Termos do Arena | Proíbem engenharia reversa | Alto se extrair do programa: não fazemos. Desde 20/11/2026 lemos só as dicas das palavras-chave no banco da interface (SQLite) da instalação do dono do projeto, com o ok dele, fora do repositório (ADR 0021): rever antes de abrir ao público |
| Dados da Untapped | Arquivos públicos, sem termos claros de reuso | Médio: pedir autorização antes de divulgar |
| Regras de imagem do Scryfall | Não cortar artista e copyright, não distorcer, não pôr marca d'água, e não "simplesmente reempacotar, republicar ou servir como proxy" os dados do Scryfall | Médio: as cartas montadas no servidor (ADR 0022) são imagens derivadas, num depósito privado, sem galeria nem listagem; avisar o Scryfall antes de abrir ao público |
| Fontes das cartas | Beleren e Plantin são de terceiros | Arquivos fornecidos pelo dono do projeto, servidos do KV e fora do repositório; reserva livre: Eczar e Splentinex (OFL). Rever antes de abrir ao público |

**O que o Proxinho faz para ficar no caminho seguro:** é grátis, não vende impressão, é para o dono e colegas próximos, guarda as cartas montadas num depósito privado servido só pelo site, pela chave exata, sem galeria, listagem nem indexação (ADR 0022), não extrai nada do cliente do Arena além das dicas das palavras-chave (ADR 0021), mantém artista e copyright, mostra o aviso de conteúdo de fã no site e no PDF e não usa nomes ou logos da Wizards como marca.

**Pendente antes de divulgar amplamente:** pedir autorização à Untapped e avisar o Scryfall.
