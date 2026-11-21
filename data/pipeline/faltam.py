"""
As linhas que faltam traduzir para as cartas sem texto oficial em PT ganharem a tradução não
oficial (ADR 0025), das cartas mais jogadas no EDHREC para as menos.

Uso, depois de `pnpm data:build` (lê `data/out/cards.jsonl` e o Oracle em `data/cache/`):

    python3 data/pipeline/faltam.py                 # quantas faltam e as 20 primeiras
    python3 data/pipeline/faltam.py --saida x.json  # todas, com até 3 cartas de exemplo cada

A tradução de cada linha entra em `data/traducao/linhas.json` (a linha em inglês, como aqui,
para o português no padrão do Arena); um subtipo novo, em `data/traducao/tipos.json`. No fim,
lista as linhas traduzidas que citam um subtipo sem o nome oficial dele ("Wall" é "Barreira").
"""

import argparse
import gzip
import json
from pathlib import Path

import build as B

ROOT = Path(__file__).resolve().parents[1]
SKIP_LAYOUTS = {"token", "emblem", "art_series", "double_faced_token"}


def missing(cards: list[dict], oracle: dict[str, dict]) -> list[dict]:
    """As linhas sem tradução (nem oficial, nem molde, nem traduzida) das cartas legais no Commander sem texto oficial."""
    official = [c for c in cards if c["source"] in ("arena", "impresso") and c.get("layout") != "token"]
    best, molds = B.official_lines(official, oracle)
    lines, _ = B.load_unofficial()
    todo: dict[str, dict] = {}
    for c in cards:
        o = oracle.get(c["oracle_id"])
        if c["source"] is not None or not o or o.get("layout") in SKIP_LAYOUTS:
            continue
        if (o.get("legalities") or {}).get("commander") not in ("legal", "restricted"):
            continue
        rank = c.get("edhrec_rank") or 10**6
        for e in o.get("card_faces") or [o]:
            for raw in (e.get("oracle_text") or "").split("\n"):
                key = B.line_key(raw, [e.get("name"), o["name"]])
                if not key or key in best or B.mold(key) in molds or key in lines:
                    continue
                t = todo.setdefault(key, {"en": key, "rank": rank, "cartas": []})
                t["rank"] = min(t["rank"], rank)
                if len(t["cartas"]) < 3:
                    t["cartas"].append(f"{e.get('name')} ({e.get('type_line')})")
    return sorted(todo.values(), key=lambda t: (t["rank"], t["en"]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida", type=Path, help="grava todas as linhas que faltam neste arquivo JSON")
    args = ap.parse_args()
    cards = [json.loads(line) for line in open(ROOT / "out" / "cards.jsonl")]
    oracle = {}
    with gzip.open(ROOT / "cache" / "oracle.jsonl.gz", "rt") as fh:
        for line in fh:
            o = json.loads(line)
            oracle[o.get("oracle_id") or o["card_faces"][0]["oracle_id"]] = o
    todo = missing(cards, oracle)
    print(f"{len(todo)} linhas faltam; das cartas entre as 10 mil mais jogadas: {sum(t['rank'] <= 10_000 for t in todo)}")
    lines, types = B.load_unofficial()
    _, subs = B.official_types(cards, oracle)
    for en, sub, sub_pt in B.subtype_mismatches(lines, subs, types):
        print(f"subtipo fora do nome oficial ({sub} é {sub_pt}): {en}")
    if args.saida:
        args.saida.write_text(json.dumps(todo, ensure_ascii=False, indent=1))
        print(f"escrito {args.saida}")
    else:
        for t in todo[:20]:
            print(f"{t['rank']:>7} | {t['en']}")


if __name__ == "__main__":
    main()
