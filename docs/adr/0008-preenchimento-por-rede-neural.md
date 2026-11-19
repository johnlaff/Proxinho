# ADR 0008: Preenchimento por rede neural nas caixas translúcidas

- Status: aceito
- Data: 17/11/2026 (vigia e andamento: 19/11/2026; runtimes, recuo e prévia em duas etapas no ADR 0013)

## Contexto

Para trocar o inglês pelo português, o motor apaga as letras e preenche o buraco. O preenchimento original é o push-pull em pirâmide (`erase.ts`): uma média borrada da vizinhança. No pergaminho liso das cartas comuns isso some. Nas caixas de texto dos planeswalkers não: elas são translúcidas, a arte aparece por trás, e o borrão ficava visível como uma mancha em volta de cada linha apagada (ADR 0007).

## Opções

1. **Refazer a moldura a partir de um modelo** (como o Proxyshop e o Card Conjurer): desenhar a caixa do zero sobre a arte. Exige recriar cada variante de moldura e perde a fidelidade à impressão escolhida.
2. **Síntese de textura por patches** (PatchMatch, o "preenchimento sensível ao conteúdo" clássico). Sem modelo para baixar, mas repete pedaços da arte e erra em gradientes.
3. **Inpainting por rede neural.** O LaMa (Suvorov et al., 2021) é o modelo de referência para remover texto e objetos; o MI-GAN é a versão leve para celular. Os dois rodam no navegador com o ONNX Runtime Web.

## Decisão

Opção 3, com o **LaMa** numa versão quantizada (pesos int4/int8, 37 MB, Apache 2.0, revisão fixa do Hugging Face conferida por SHA-256), só nas caixas de texto dos planeswalkers. Nome e linha de tipo, que ficam em barras opacas, continuam no push-pull.

- **Onde roda:** numa worker (`lamaWorker.ts`), na placa de vídeo (WebGPU) quando há e na CPU (WebAssembly) quando não. O site manda os cabeçalhos de isolamento de origem (`COOP same-origin` e `COEP credentialless`) para liberar várias threads na CPU. Até 19/11 a placa de vídeo usava o runtime JSEP, que falhava no LaMa e caía para a CPU; desde então são dois runtimes, o WebGPU e o só de CPU (ADR 0013).
- **Quadro:** o modelo trabalha em 512 × 512. A caixa inteira (~600 px no PNG) é recortada com margem e redimensionada para um quadro só; quadros sobrepostos deixavam emendas de tom.
- **Máscara:** a mesma das letras, dilatada um pouco mais e presa às faixas de texto (os dois-pontos depois do escudo ficam intactos). Os vãos de até 4 px entre dois pedaços do buraco também entram (`combineMasks`): um fio de um ou dois pixels da imagem original entre duas áreas repintadas destoa do preenchimento em volta, e na divisa entre as faixas do Niko Aris (KHM) saía um tracejado. A caixa da lealdade inicial, protegida, também vai ao modelo como buraco, sem ser repintada: vista por ele, a cor preta dela vazava como uma mancha marrom na letra apagada logo acima (Tezzeret, o Maquinador, AER; ADR 0011).
- **Pingos inventados:** o modelo às vezes desenha um pingo de tinta no meio do papel liso, fantasma de uma letra apagada (acima do "Quando" do Niko Aris). Depois do LaMa, `dropSpecks` tira os pingos pequenos (até ~80 px e 14 px de lado na escala-base), bem mais escuros que o papel em volta e cercados de buraco por todos os lados, e põe no lugar a cor média da vizinhança. Um pingo que encosta na borda do buraco pode ser a arte de fora continuando, e fica.
- **Imagem:** planeswalker usa o PNG também na prévia; o JPEG da prévia deixava restos de letra. A caixa limpa fica guardada e o PDF a reaproveita.
- **Hospedagem:** o modelo e o runtime passam do limite de 25 MiB por arquivo dos assets do Cloudflare, então `scripts/modelo.mjs` os compacta em gzip e divide em partes no build (fora do git), e a worker junta e descompacta (ADR 0013). Não há chamada a serviço de terceiros: tudo sai do próprio domínio.
- **Falha:** sem rede, navegador antigo ou erro no modelo, o planeswalker volta para o push-pull.
- **Vigia (19/11/2026):** no Firefox do celular a rede neural travava sem erro. Uma thread do WebAssembly que não sobe deixa o carregamento do ONNX Runtime esperando para sempre, e a prévia da Konia sem borda (DSK 358) ficava em "Montando a prévia…". Agora cada etapa tem limite (`LIMITS` em `lama.ts`): 60 s sem um byte novo no download, 120 s do fim do download ao modelo pronto e 180 s por quadro, bem acima do que um celular comum leva. Travada ou com erro, a worker é encerrada e trocada por uma num modo mais simples (`MODES`; desde o ADR 0013 em três degraus, com o limite do quadro seguindo o ritmo medido), que refaz o mesmo quadro; se nenhum funcionar, o modelo fica indisponível na página. O planeswalker usa o push-pull; a arte sem borda sai na original, com a etiqueta "Em inglês" e a explicação na gaveta, porque ali o push-pull deixaria o borrão sobre a arte (ADR 0012). O `env.wasm.initTimeout` do próprio ONNX Runtime não serve de plano B: depois do tempo esgotado o runtime fica num estado que não se recupera, e só uma worker nova volta a funcionar.
- **Andamento (19/11/2026):** a worker conta os bytes baixados e avisa quando terminou de baixar e quando o modelo ficou pronto. `lamaStatus` dá a etapa ("Baixando o apagador de texto: 42%", "Preparando…"), e a prévia de cada carta que espera a rede neural mostra essa linha; a gaveta mostra também a barra de progresso e o tamanho do download. Sem o andamento, a espera da primeira carta parecia travada. O ADR 0013 juntou o rascunho em PT na hora, a parte e o tempo que falta.

## Consequências

- A mancha some: a textura da arte continua por trás do texto em português.
- O primeiro planeswalker da sessão baixa 37 MB com placa de vídeo ou 33 MB sem (modelo e runtime compactados; o navegador guarda). Na CPU, cada quadro leva cerca de 7 s com 4 threads num computador; até o ADR 0013 a placa de vídeo nunca rodou (o runtime JSEP falhava no LaMa).
- Num navegador em que a rede neural não roda, a primeira carta que precisa dela espera até os limites do vigia (cerca de 2 min) antes de sair do jeito simples; as seguintes, na hora.
- `COEP credentialless` exige que recursos de outra origem venham por CORS (as imagens do Scryfall já vêm) e não existe no Safari, que então roda o LaMa com uma thread na CPU ou na placa de vídeo.
