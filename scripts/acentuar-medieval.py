"""
Monta as letras acentuadas do português na fonte do nome da moldura antiga (ADR 0031).

A MagicMedieval (a Goudy Medieval ajustada para as cartas, grátis para uso não comercial)
só tem as letras sem acento e os acentos soltos (grave, agudo, trema, circunflexo e til),
sem cedilha. Sem as letras prontas, o navegador escreve "Água" e "Ação" com outra fonte
nas letras acentuadas. Este script junta cada letra com o acento dela (componentes, como
nas fontes de verdade), desenha a cedilha e passa o arquivo pelo OTS, como o
`consertar-fontes.py`. O arquivo fica fora do repositório, no KV `FONTES` (`medieval.ttf`).

Uso: python3 scripts/acentuar-medieval.py Magicmedieval.ttf medieval.ttf
Requer: pip install fonttools opentype-sanitizer
"""

import math
import sys

import ots
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

# letra acentuada -> (base, acento)
LETRAS = {
    "À": ("A", "grave"),
    "Á": ("A", "acute"),
    "Â": ("A", "circumflex"),
    "Ã": ("A", "tilde"),
    "Ä": ("A", "dieresis"),
    "È": ("E", "grave"),
    "É": ("E", "acute"),
    "Ê": ("E", "circumflex"),
    "Ë": ("E", "dieresis"),
    "Ì": ("I", "grave"),
    "Í": ("I", "acute"),
    "Î": ("I", "circumflex"),
    "Ï": ("I", "dieresis"),
    "Ñ": ("N", "tilde"),
    "Ò": ("O", "grave"),
    "Ó": ("O", "acute"),
    "Ô": ("O", "circumflex"),
    "Õ": ("O", "tilde"),
    "Ö": ("O", "dieresis"),
    "Ù": ("U", "grave"),
    "Ú": ("U", "acute"),
    "Û": ("U", "circumflex"),
    "Ü": ("U", "dieresis"),
    "à": ("a", "grave"),
    "á": ("a", "acute"),
    "â": ("a", "circumflex"),
    "ã": ("a", "tilde"),
    "ä": ("a", "dieresis"),
    "è": ("e", "grave"),
    "é": ("e", "acute"),
    "ê": ("e", "circumflex"),
    "ë": ("e", "dieresis"),
    "ì": ("dotlessi", "grave"),
    "í": ("dotlessi", "acute"),
    "î": ("dotlessi", "circumflex"),
    "ï": ("dotlessi", "dieresis"),
    "ñ": ("n", "tilde"),
    "ò": ("o", "grave"),
    "ó": ("o", "acute"),
    "ô": ("o", "circumflex"),
    "õ": ("o", "tilde"),
    "ö": ("o", "dieresis"),
    "ù": ("u", "grave"),
    "ú": ("u", "acute"),
    "û": ("u", "circumflex"),
    "ü": ("u", "dieresis"),
}
# o acento das maiúsculas fica 70 unidades acima do alto da letra
FOLGA_MAIUSCULA = 70


def bounds(font: TTFont, name: str):
    pen = BoundsPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    return pen.bounds


def cedilha(pen: TTGlyphPen, cx: float) -> None:
    """Gancho abaixo da linha de base: desce do pé da letra, abre para a direita e volta para a
    esquerda, mais fino na ponta (o desenho da cedilha das romanas antigas)."""
    raio = 150
    pontos = []
    for i in range(41):
        t = i / 40
        if t < 0.25:  # a haste, reta para baixo
            x, y = 0.0, -t / 0.25 * 120
        else:  # o arco, de cima (90°) pela direita até embaixo e um pouco à esquerda (-125°)
            a = math.pi / 2 - (t - 0.25) / 0.75 * math.radians(215)
            x, y = raio * math.cos(a), -120 - raio + raio * math.sin(a)
        pontos.append((cx + x, y))
    # contorno: a linha central afastada para os dois lados, de 80 unidades até 35 na ponta
    esquerda, direita = [], []
    for i, (x, y) in enumerate(pontos):
        a = pontos[max(0, i - 1)]
        b = pontos[min(len(pontos) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        meia = 80 - 45 * (i / (len(pontos) - 1)) ** 2
        esquerda.append((x + nx * meia, y + ny * meia))
        direita.append((x - nx * meia, y - ny * meia))
    contorno = esquerda + direita[::-1]
    # (sentido horário, como os contornos de fora no TrueType)
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(contorno, contorno[1:] + contorno[:1]))
    if area > 0:
        contorno.reverse()
    pen.moveTo((round(contorno[0][0]), round(contorno[0][1])))
    for x, y in contorno[1:]:
        pen.lineTo((round(x), round(y)))
    pen.closePath()


def main(src: str, dst: str) -> None:
    font = TTFont(src)
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    order = font.getGlyphOrder()
    novos = []

    def add(name: str, glyph, advance: int, lsb: int) -> None:
        glyf.glyphs[name] = glyph
        hmtx.metrics[name] = (advance, lsb)
        novos.append(name)

    cap_top = bounds(font, "H")[3]
    for char, (base, acento) in LETRAS.items():
        name = f"uni{ord(char):04X}"
        bb = bounds(font, base)
        ab = bounds(font, acento)
        # centro do acento sobre o centro da letra; nas maiúsculas, acima do alto dela
        dx = round((bb[0] + bb[2]) / 2 - (ab[0] + ab[2]) / 2)
        dy = round(cap_top + FOLGA_MAIUSCULA - ab[1]) if char.isupper() else 0
        pen = TTGlyphPen(font.getGlyphSet())
        pen.addComponent(base, (1, 0, 0, 1, 0, 0))
        pen.addComponent(acento, (1, 0, 0, 1, dx, dy))
        adv, lsb = hmtx[base]
        add(name, pen.glyph(), adv, lsb)
        for sub in font["cmap"].tables:
            if sub.isUnicode():
                sub.cmap[ord(char)] = name

    # a cedilha (a fonte não tem): desenhada, e o ç e o Ç com ela
    for char, base in (("ç", "c"), ("Ç", "C")):
        name = f"uni{ord(char):04X}"
        bb = bounds(font, base)
        pen = TTGlyphPen(font.getGlyphSet())
        pen.addComponent(base, (1, 0, 0, 1, 0, 0))
        # (no C o pé da letra desce em curva: a cedilha sai do meio da base dela)
        cedilha(pen, (bb[0] + bb[2]) / 2 - 20)
        adv, lsb = hmtx[base]
        add(name, pen.glyph(), adv, lsb)
        for sub in font["cmap"].tables:
            if sub.isUnicode():
                sub.cmap[ord(char)] = name

    font.setGlyphOrder(order + novos)
    # a hdmx guarda a largura de cada letra por tamanho: sem as novas, o arquivo é inválido
    if "hdmx" in font:
        del font["hdmx"]
    for sub in font["cmap"].tables:
        if sub.platformID != 1:
            sub.language = 0
    font.save(dst)
    res = ots.sanitize(dst, "/dev/null", capture_output=True)
    if res.returncode != 0:
        sys.exit(f"o navegador recusaria {dst}: {res.stderr.decode().strip()}")
    print(f"{dst}: ok ({len(novos)} letras novas)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
