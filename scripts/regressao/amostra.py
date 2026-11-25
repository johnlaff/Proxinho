#!/usr/bin/env python3
"""Monta a amostra fixa da regressão visual (scripts/regressao/amostra.json).

A amostra tem dois pedaços:

1. Todas as impressões citadas nos "Erros que já aconteceram" do AGENTS.md e nos ADRs (as cartas
   em que o motor já errou: "Faramir, Field Commander, LTR 14", "Sol Ring, SLD 2467"...). Uma
   correção nova nunca pode trazer de volta um erro velho.
2. Um sorteio fixo (semente 20261125) por grupo de moldura, entre as impressões suportadas de
   cartas com texto em PT: a moldura comum de 2015, a de 2003 (sem e com marca-d'água), a antiga
   (1997), a sem borda, a arte estendida, as de duas faces, os planeswalkers, as fichas, os
   emblemas, as Sagas, Aventuras, Classes, cartas com Preparar, as Salas de Duskmourn, as
   outras divididas, a Consequência e o Fundir, naves e a tradução não oficial.

Lê o banco montado pelo pipeline (data/out/cards.sql, depois de `pnpm data:build`). A amostra é
versionada e só cresce: rodar de novo mantém as impressões que já estão nela e acrescenta as
citadas nos documentos depois e o que falta em cada grupo (um grupo novo, como a moldura antiga,
sai inteiro). Sortear tudo de novo mudava as cartas de todos os grupos a cada citação nova. Para
trocar a amostra de propósito, apague o arquivo (e diga no commit por quê).

    python3 scripts/regressao/amostra.py            # grava scripts/regressao/amostra.json
"""

from __future__ import annotations

import json
import random
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).with_name("amostra.json")
SEED = 20261125

# grupo → quantas impressões sortear (além das citadas nos documentos)
GROUPS: dict[str, int] = {
    "2015 comum": 120,
    "2015 com P/R": 60,
    "2015 terreno": 20,
    "2015 borda branca": 8,
    "arte estendida": 30,
    "2003": 60,
    "sem borda": 50,
    "planeswalker": 25,
    "duas faces (transformar)": 20,
    "duas faces (modal)": 15,
    "ficha": 30,
    "emblema": 10,
    "ficha de duas faces": 6,
    "saga": 15,
    "aventura": 15,
    "classe": 8,
    "nave": 10,
    "não oficial": 40,
    # por último: um grupo novo no fim não muda o sorteio dos de antes
    "1997": 40,
    "2003 com marca-d'água": 30,
    "preparar": 15,
    "sala": 10,
    "dividida": 15,
    "consequência": 15,
    "fundir": 9,
}


def group_of(row: sqlite3.Row) -> str | None:
    """O grupo de moldura de uma impressão suportada (None: fica fora do sorteio)."""
    layout, frame, border = row["layout"], row["frame"], row["border"]
    effects = set((row["effects"] or "").split(","))
    type_line = row["type_line"] or ""
    # a moldura antiga entrou depois (ADR 0031): antes de tudo, para não mudar os outros grupos
    if frame == "1997":
        return "1997"
    # (e depois a marca-d'água de 2003, ADR 0024, o Preparar, ADR 0032, as Salas, ADR 0033, as
    # outras divididas, ADR 0034, a Consequência, ADR 0035, e o Fundir, ADR 0036)
    if frame == "2003" and row["watermark"]:
        return "2003 com marca-d'água"
    if layout == "prepare":
        return "preparar"
    if layout == "split":
        if "Room" in type_line:
            return "sala"
        if "Consequência" in (row["text_pt"] or ""):
            return "consequência"
        return "fundir" if "Fundir (" in (row["text_pt"] or "") else "dividida"
    if row["source"] == "nao-oficial":
        return "não oficial"
    if layout == "emblem":
        return "emblema"
    if layout == "double_faced_token":
        return "ficha de duas faces"
    if layout == "token":
        return "ficha"
    if layout == "transform":
        return "duas faces (transformar)"
    if layout == "modal_dfc":
        return "duas faces (modal)"
    if layout in ("saga", "adventure", "class"):
        return {"saga": "saga", "adventure": "aventura", "class": "classe"}[layout]
    if "Station" in (row["text_pt"] or "") or "Posicionar" in (row["text_pt"] or ""):
        return "nave"
    if "Planeswalker" in type_line:
        return "planeswalker"
    if border == "borderless":
        return "sem borda"
    if frame == "2003":
        return "2003"
    if "extendedart" in effects:
        return "arte estendida"
    if border == "white":
        return "2015 borda branca"
    if "Land" in type_line:
        return "2015 terreno"
    if row["has_pt"]:
        return "2015 com P/R"
    return "2015 comum"


def cited(db: sqlite3.Connection) -> list[tuple[str, str]]:
    """As impressões citadas como "SET NÚMERO" no AGENTS.md e nos ADRs que existem no banco."""
    text = (ROOT / "AGENTS.md").read_text()
    for adr in sorted((ROOT / "docs" / "adr").glob("*.md")):
        text += "\n" + adr.read_text()
    out: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for m in re.finditer(r"\b([A-Z][A-Z0-9]{1,4}) (IFIYW-\d+|\d{1,4}[a-z★]?)(?![\d,.])", text):
        key = (m.group(1).lower(), m.group(2))
        if key in seen:
            continue
        seen.add(key)
        hit = db.execute("SELECT id FROM prints WHERE set_code = ? AND number = ?", key).fetchone()
        if hit:
            out.append(key)
    return out


def main() -> None:
    db = sqlite3.connect(":memory:")
    for f in sorted((ROOT / "migrations").glob("*.sql")):
        db.executescript(f.read_text())
    db.executescript((ROOT / "data" / "out" / "cards.sql").read_text())
    db.row_factory = sqlite3.Row
    rows = db.execute(
        """SELECT p.id, p.oracle_id, p.set_code, p.number, p.layout, p.frame, p.border, p.effects, p.has_pt,
                  p.supported, p.watermark, c.name_en, c.source, c.type_line, c.faces AS text_pt
           FROM prints p JOIN cards c ON c.oracle_id = p.oracle_id
           ORDER BY p.set_code, p.number, p.id"""
    ).fetchall()
    by_key = {(r["set_code"], r["number"]): r for r in rows}

    picked: dict[str, dict] = {}
    if OUT.exists():
        ids = {r["id"] for r in rows}
        for it in json.loads(OUT.read_text()):
            if it["id"] in ids:
                picked[it["id"]] = it

    def take(r: sqlite3.Row, group: str) -> None:
        picked.setdefault(
            r["id"],
            {"id": r["id"], "oracle_id": r["oracle_id"], "set": r["set_code"], "number": r["number"], "nome": r["name_en"], "grupo": group},
        )

    for key in cited(db):
        r = by_key[key]
        take(r, "citada nos documentos")

    rng = random.Random(SEED)
    pools: dict[str, list[sqlite3.Row]] = {g: [] for g in GROUPS}
    for r in rows:
        if not r["supported"] or not r["source"] or r["id"] in picked:
            continue
        g = group_of(r)
        if g:
            pools[g].append(r)
    for g, n in GROUPS.items():
        pool = pools[g]
        have = sum(1 for it in picked.values() if it["grupo"] == g)
        for r in rng.sample(pool, min(max(0, n - have), len(pool))):
            take(r, g)

    items = sorted(picked.values(), key=lambda x: (x["grupo"] != "citada nos documentos", x["grupo"], x["set"], x["number"]))
    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n")
    counts: dict[str, int] = {}
    for it in items:
        counts[it["grupo"]] = counts.get(it["grupo"], 0) + 1
    print(f"{len(items)} impressões em {OUT.relative_to(ROOT)}")
    for g, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {n:4d}  {g}")


if __name__ == "__main__":
    main()
