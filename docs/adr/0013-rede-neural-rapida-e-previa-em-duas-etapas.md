# ADR 0013: Rede neural na placa de vídeo de verdade e prévia em duas etapas

- Status: aceito
- Data: 19/11/2026
- Complementa: ADR 0008 (preenchimento por rede neural) e ADR 0012 (moldura sem borda)

## Contexto

O João testou a Konia sem borda (DSK 358) no celular depois do vigia do ADR 0008:

- **Chrome:** a carta saía na hora em inglês, com a etiqueta "esta moldura ainda não é reescrita" e, logo abaixo, "o apagador de texto não rodou neste navegador". As duas frases se contradiziam.
- **Firefox:** dois minutos em "Montando a prévia… Apagando o inglês…" sem sinal de andamento, e ele desistiu.

Reproduzindo no Chromium com WebGPU (SwiftShader), o runtime de placa de vídeo do pacote principal do ONNX Runtime Web (o JSEP) falhava no primeiro quadro: `[WebGPU] Kernel "[Add] /generator/model/model.5/conv1/ffc/convg2g/Add" failed. Error: Can't perform binary op on the given tensors`. É a soma da convolução de Fourier do LaMa. Ou seja, **a placa de vídeo nunca funcionou**: todo navegador com WebGPU caía para a CPU, a mais lenta, e o ADR 0008 prometia "menos de 1 s por carta" que nunca aconteceu. No celular, o vigia trocava para a CPU com uma thread, que também falhava e deixava a carta na original.

O que o mercado faz (pesquisa em `docs/pesquisa.md`, "Espera da rede neural"):

- **Runtime:** o ONNX Runtime Web tem um runtime WebGPU próprio (`onnxruntime-web/webgpu`, com o `.wasm` "asyncify"), separado do JSEP do pacote principal. Quem trocou relata a WebGPU funcionando no Chrome e no Safari do Mac e do iPhone com a troca de uma linha de import, e o JSEP no Safari 26 sobe a memória a ~5 GB até a aba cair (issue 26827 do onnxruntime). Medido aqui, o runtime WebGPU dá o mesmo resultado da CPU no quadro real da Konia (diferença máxima de 0,03 tom em 255).
- **Espera:** o Nielsen Norman Group pede indicador com porcentagem acima de 10 s, com texto do que está acontecendo ("3 de 50"), estimativa de tempo arredondada e com folga ("cerca de 3 minutos"), e um jeito de não ficar preso esperando. Para imagens, o padrão é mostrar uma versão provisória na hora e trocar pela final (o "LQIP" ou "blur-up").
- **Download:** o `.wasm` do ONNX cai a um quarto com gzip; o modelo, a 80%.

Alternativas que não servem: quadros do tamanho da caixa (o LaMa quantizado tem `Reshape` com medidas fixas de 512 px e quebra com outro tamanho, testado), manter a quantização no preparo (mais lento na CPU, medido), outro nível de otimização do grafo (mais lento), o MI-GAN no lugar do LaMa (mais rápido, mas sem prova de mesma qualidade nas nossas artes; fica no roadmap só para o rascunho).

## Decisão

1. **Dois runtimes, escolhidos na worker.** Com placa de vídeo de verdade (`navigator.gpu`, adaptador que não seja o de software), `onnxruntime-web/webgpu`; sem ela, `onnxruntime-web/wasm`, o só de CPU, com metade do tamanho. Cada um é um pedaço de JavaScript à parte (`worker: { format: "es" }` no Vite: no formato iife os dois ficavam embutidos na worker, e as threads do WebAssembly, que reabrem o arquivo do runtime, nunca subiam).
2. **Recuo em três degraus** (`MODES` e `nextMode` em `lama.ts`): placa de vídeo, CPU com várias threads, CPU com uma thread. A falha passa para o degrau seguinte ao que a worker de fato usou: erro da placa de vídeo vai para a CPU com várias threads (antes ia direto para uma thread). Saída com NaN conta como falha (`brokenOutput`).
3. **Limite de tempo que acompanha o ritmo** (`runLimit`): 90 s no primeiro quadro na placa de vídeo, 240 s na CPU, e depois quatro vezes a média medida (no mínimo 60 s). Um celular lento que segue no ritmo não é cortado; um quadro travado não espera 4 minutos.
4. **Download compactado:** `scripts/modelo.mjs` grava o modelo e os dois runtimes em gzip (o modelo em duas partes, abaixo de 25 MiB) e a worker descompacta com `DecompressionStream`. Placa de vídeo: 37 MB em vez de 66; CPU: 33 em vez de 52. O modelo começa a baixar quando a primeira carta que precisa dele entra no pedido (`prepareLama`), junto com o apagamento.
5. **Prévia em duas etapas:** a carta que espera a rede neural mostra primeiro o **rascunho** (`draftUrl`: o português já escrito, com o preenchimento simples no lugar da rede neural, `neural: false` em `renderCard`), em poucos segundos; o acabamento troca a imagem quando fica pronto, com a mesma animação de registro das tintas. O PDF sempre sai com o acabamento.
6. **Fila à parte:** as cartas da rede neural esperam numa fila própria, uma de cada vez; antes elas tomavam as quatro vagas da fila e as cartas comuns ficavam minutos sem prévia. A carta aberta na gaveta passa na frente (`hurry`). A prévia e o PDF que pedem a mesma caixa ao mesmo tempo esperam uma pela outra, e a memória das caixas limpas vai a 96 MB (umas 40 cartas) em vez de 24 caixas.
7. **Andamento honesto:** a montagem diz quantos quadros a carta vai rodar antes do primeiro (`frameCount`), e a prévia mostra "Acabamento: parte 2 de 3, cerca de 35 s", com o tempo pela média dos quadros anteriores (`etaMs`, `neuralLine`), uma barra que anda com o tempo do quadro atual, "Na fila do acabamento" para as que esperam e, no primeiro download, a porcentagem e o tamanho. O PDF diz qual carta está no acabamento.
8. **Falha que não culpa a moldura:** a carta que saiu na original porque a rede neural não rodou ganha o resultado próprio "Em inglês: o apagador de texto não rodou neste navegador" (`apagador`), com o motivo de cada degrau num "Detalhe técnico" da gaveta; as outras artes sem borda passam a dizer "Sai em inglês" na escolha de arte.

## Consequências

- Chrome, Edge e Safari com WebGPU rodam a rede neural na placa de vídeo, como o ADR 0008 pretendia. A saída na CPU ficou idêntica pixel a pixel à de antes (7 artes sem borda conferidas).
- No celular sem placa de vídeo (Firefox), a conta continua na CPU, mas a carta em português aparece em segundos e a espera tem parte, tempo e barra; a carta acabada chega sozinha.
- O primeiro uso baixa 37 MB (placa de vídeo) ou 33 MB (CPU), uma vez só.
- Um navegador sem `DecompressionStream` (anterior a 2023) não roda a rede neural; os planeswalkers saem com o preenchimento simples e as artes sem borda na original, como antes.
- O rascunho custa uma montagem a mais por carta da rede neural (um a dois segundos de CPU), na fila comum.
