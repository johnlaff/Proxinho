"""
Conserta arquivos de fonte que o navegador recusa.

Chrome e Firefox passam toda fonte baixada pelo OpenType Sanitizer (OTS). Os
arquivos da MPlantin que temos são recusados por dois defeitos de estrutura, sem
nada de errado nos desenhos das letras:

1. tabelas sobrepostas no arquivo (o fim da `glyf` invade a `cmap`);
2. subtabela `cmap` da Microsoft com `language` = 1 (precisa ser 0).

Regravar com o fontTools refaz o índice de tabelas (resolve o 1) e o script zera
o `language` fora da plataforma Mac (resolve o 2). Os contornos, as métricas e o
kerning não mudam.

Uso: python3 scripts/consertar-fontes.py entrada.ttf saida.ttf
Requer: pip install fonttools opentype-sanitizer
"""

import sys

import ots
from fontTools.ttLib import TTFont


def main(src: str, dst: str) -> None:
    font = TTFont(src)
    for sub in font["cmap"].tables:
        if sub.platformID != 1:  # na plataforma Mac o idioma é válido
            sub.language = 0
    font.save(dst)
    res = ots.sanitize(dst, "/dev/null", capture_output=True)
    if res.returncode != 0:
        sys.exit(f"o navegador ainda recusaria {dst}: {res.stderr.decode().strip()}")
    print(f"{dst}: ok")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
