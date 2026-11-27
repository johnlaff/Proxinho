/**
 * Cartas de transformar de Innistrad e Dark Ascension na moldura de 2003 (ADR 0049). A frente
 * traz o P/R do verso numa ponta de papel que avança para a moldura, acima da caixa de P/R (e no
 * mesmo lugar quando a frente não tem P/R: Elbrus, the Binding Blade), com os algarismos na
 * Matrix Bold, em cinza. Os algarismos são os mesmos em PT: ficam como estão, protegidos, e o
 * texto em PT desvia deles. Escritos de novo, saíam com os algarismos antigos da Matrix Bold do
 * site (o "3" descendo abaixo da linha, o "1" como um "I"), diferentes dos da carta.
 */
import { BASE_H, BASE_W, type Rect } from "./geometry";

/**
 * O P/R do verso na escala-base: os algarismos vão de y 895 a 916 e acabam em x 677 (o "13/13"
 * começa em 611, o "3/2" em 633); a ponta de papel vai de y ≈ 889 a 922, e o lado dela, a moldura,
 * começa em x ≈ 680. `gap` é o maior vão entre dois algarismos (o "/" fica a ~4 px deles).
 */
export const BACK_PT_2003 = { x0: 590, x1: 680, y0: 891, y1: 920, top: 889, gap: 9, ink: 70 };

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Os algarismos do P/R do verso na imagem (escala-base, com 2 px de folga): as colunas com tinta
 * (70 tons abaixo do papel da ponta), da direita para a esquerda, até o primeiro vão maior que o
 * dos algarismos. O papel é o percentil 80 da região. Sem tinta onde eles ficam, `null`.
 */
export function backPtDigits2003(img: ImageData): Rect | null {
  const B = BACK_PT_2003;
  const fx = img.width / BASE_W;
  const fy = img.height / BASE_H;
  const y0 = Math.round(B.y0 * fy);
  const y1 = Math.round(B.y1 * fy);
  const x0 = Math.round(B.x0 * fx);
  const x1 = Math.round(B.x1 * fx);
  const all: number[] = [];
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) all.push(lum(img.data, (y * img.width + x) * 4));
  all.sort((a, b) => a - b);
  const paper = all[Math.floor(all.length * 0.8)];
  const inked = (x: number) => {
    for (let y = y0; y < y1; y++) if (lum(img.data, (y * img.width + x) * 4) < paper - B.ink) return true;
    return false;
  };
  const gap = Math.round(B.gap * fx);
  let right = -1;
  let left = -1;
  let run = 0;
  for (let x = x1 - 1; x >= x0; x--) {
    if (inked(x)) {
      if (right < 0) right = x;
      left = x;
      run = 0;
    } else if (right >= 0 && ++run > gap) break;
  }
  if (right < 0) return null;
  // (o fim tem de cair onde o P/R acaba: um traço só na ponta é a moldura)
  if (right / fx < 660 || (right - left) / fx < 18) return null;
  return { x0: left / fx - 2, y0: B.y0, x1: right / fx + 3, y1: B.y1 };
}

/**
 * O canto reservado no pé do texto (relativo à caixa `box`, escala-base): da ponta ao pé, a 12 px
 * dos algarismos (com 6, a última linha em PT encostava no "4/4": Huntmaster of the Fells, DKA 140).
 */
export function backPtNotch2003(box: Rect, digits: Rect): { width: number; height: number } {
  return { width: box.x1 - (digits.x0 - 12), height: box.y1 - BACK_PT_2003.top };
}

/**
 * Onde começa o símbolo da coleção na barra de tipo (escala-base). Nas 73 faces de Innistrad e
 * Dark Ascension a medida dá de x 629 a 642; mais à esquerda que 620, ela grudou no fim do tipo
 * em inglês, e vale 634. Na promo de pré-estreia do Mondronen Shaman (PDKA 98★), de foil, o
 * "Shaman" acaba em x 626 (o pé do "n"), a 3 px do símbolo, e as letras têm franjas coloridas:
 * a cor começava no meio da palavra, a medida dava 565 e o "man" ficava ao lado do português.
 * (O apagamento vai até 6 px antes do símbolo: com 630 e 632, o último traço do "n" ficava.)
 */
export function dfcSymbolLeft2003(measured: number): number {
  return measured < 620 ? 634 : measured;
}
