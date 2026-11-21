"""
As linhas que faltam traduzir para as cartas sem texto oficial em PT ganharem a tradução não
oficial (ADR 0025), das cartas mais jogadas no EDHREC para as menos.

Uso, depois de `pnpm data:build` (lê `data/out/cards.jsonl` e o Oracle em `data/cache/`):

    python3 data/pipeline/faltam.py                 # quantas faltam e as 20 primeiras
    python3 data/pipeline/faltam.py --saida x.json  # todas, com até 3 cartas de exemplo cada

A tradução de cada linha entra em `data/traducao/linhas.json` (a linha em inglês, como aqui,
para o português no padrão do Arena); um subtipo novo, em `data/traducao/tipos.json`. No fim,
lista as linhas traduzidas que citam um subtipo sem o nome oficial dele ("Wall" é "Barreira") e os
subtipos sem nome em PT que ainda deixam em inglês cartas com todas as linhas traduzidas (o nome
deles entra em `data/traducao/tipos.json`, tirado do nome impresso em PT de uma carta, quando há).
"""

import argparse
import gzip
import json
from pathlib import Path

import build as B

ROOT = Path(__file__).resolve().parents[1]
SKIP_LAYOUTS = {"token", "emblem", "art_series", "double_faced_token"}
# as folhas de adesivos de Unfinity não vão no deck, e o tipo delas ("Stickers") nunca saiu em PT
SKIP_TYPES = {"Stickers"}


def pending(cards: list[dict], oracle: dict[str, dict]):
    """
    As cartas legais no Commander sem texto oficial (fora as fichas, os emblemas e as folhas de
    adesivos), cada uma com as faces do Oracle e as linhas dela sem tradução (nem oficial, nem
    molde, nem traduzida), como (face, linha).
    """
    official = [c for c in cards if c["source"] in ("arena", "impresso") and c.get("layout") != "token"]
    best, molds = B.official_lines(official, oracle)
    lines, _ = B.load_unofficial()
    for c in cards:
        o = oracle.get(c["oracle_id"])
        if c["source"] is not None or not o or o.get("layout") in SKIP_LAYOUTS or o.get("type_line") in SKIP_TYPES:
            continue
        if (o.get("legalities") or {}).get("commander") not in ("legal", "restricted"):
            continue
        faces = o.get("card_faces") or [o]
        keys = [(e, B.line_key(raw, [e.get("name"), o["name"]])) for e in faces for raw in (e.get("oracle_text") or "").split("\n")]
        yield c, o, faces, [(e, k) for e, k in keys if k and k not in best and B.mold(k) not in molds and k not in lines]


def missing(cards: list[dict], oracle: dict[str, dict]) -> list[dict]:
    """As linhas sem tradução das cartas legais no Commander sem texto oficial, das mais jogadas para as menos."""
    todo: dict[str, dict] = {}
    for c, _, _, left in pending(cards, oracle):
        rank = c.get("edhrec_rank") or 10**6
        for e, key in left:
            t = todo.setdefault(key, {"en": key, "rank": rank, "cartas": []})
            t["rank"] = min(t["rank"], rank)
            if len(t["cartas"]) < 3:
                t["cartas"].append(f"{e.get('name')} ({e.get('type_line')})")
    return sorted(todo.values(), key=lambda t: (t["rank"], t["en"]))


def held_by_type(cards: list[dict], oracle: dict[str, dict]) -> list[tuple[str, list[str]]]:
    """
    Os subtipos sem nome em PT (nem nas linhas de tipo oficiais, nem em `tipos.json`) que deixam em
    inglês cartas com todas as linhas traduzidas, com essas cartas, dos que seguram mais para os
    que seguram menos.
    """
    heads, subs = B.official_types([c for c in cards if c.get("layout") != "token"], oracle)  # como em `add_unofficial`
    _, types = B.load_unofficial()
    held: dict[str, list[str]] = {}
    for _, o, faces, left in pending(cards, oracle):
        if left:
            continue
        for e in faces:
            head, _, rest = (e.get("type_line") or "").partition(" — ")
            if not heads.get(head) or "Planeswalker" in head:
                continue
            for word in rest.split():
                if not types.get(word) and not subs.get(word) and o["name"] not in held.get(word, []):
                    held.setdefault(word, []).append(o["name"])
    return sorted(held.items(), key=lambda kv: (-len(kv[1]), kv[0]))


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
    _, subs = B.official_types([c for c in cards if c.get("layout") != "token"], oracle)
    for en, sub, sub_pt in B.subtype_mismatches(lines, subs, types):
        print(f"subtipo fora do nome oficial ({sub} é {sub_pt}): {en}")
    for sub, names in held_by_type(cards, oracle):
        print(f"subtipo sem nome em PT, deixa em inglês {', '.join(names[:3])}{' e mais' if len(names) > 3 else ''} ({len(names)}): {sub}")
    if args.saida:
        args.saida.write_text(json.dumps(todo, ensure_ascii=False, indent=1))
        print(f"escrito {args.saida}")
    else:
        for t in todo[:20]:
            print(f"{t['rank']:>7} | {t['en']}")


if __name__ == "__main__":
    main()
