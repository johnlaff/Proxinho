"""Pipeline de dados do Proxinho.

Junta três fontes públicas num índice único de cartas com texto em português:

1. Scryfall "oracle cards" (bulk JSONL): a lista oficial de cartas, em inglês.
2. Scryfall, impressões em português (`lang:pt`): nome, tipo e texto impressos.
3. MTG Arena, via arquivos públicos da Untapped.gg: texto oficial em PT-BR,
   inclusive de coleções que nunca saíram impressas em português.

Saída: `data/out/cards.jsonl` (um registro por carta) e `data/out/cards.sql`
(comandos para carregar o banco D1 do Cloudflare).

Uso: python data/pipeline/build.py [--offline]
Só usa a biblioteca padrão do Python, para rodar em qualquer lugar (inclusive
no GitHub Actions) sem instalar nada.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
OUT = ROOT / "out"
UA = {"User-Agent": "Proxinho/1.0 (+https://github.com/johnlaff/proxinho)", "Accept": "application/json"}
UNTAPPED = "https://mtgajson.untapped.gg/v1/latest/"

# Coleções digitais do Arena (Alchemy) não existem no papel.
DIGITAL_SETS = {"Y22", "Y23", "Y24", "Y25", "Y26", "Y27"}


def log(msg: str) -> None:
    print(f"[pipeline] {msg}", file=sys.stderr, flush=True)


def fetch(url: str, dest: Path, offline: bool) -> Path:
    """Baixa `url` para `dest`, reaproveitando o cache quando --offline."""
    if offline and dest.exists():
        return dest
    log(f"baixando {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as resp, open(dest, "wb") as fh:
        while chunk := resp.read(1 << 20):
            fh.write(chunk)
    return dest


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except Exception as exc:  # noqa: BLE001 - rede instável: tenta de novo
            wait = 2**attempt
            log(f"erro em {url}: {exc}; nova tentativa em {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"falhou: {url}")


def norm(text: str) -> str:
    """Minúsculas, sem acento e sem pontuação: usado na busca por nome."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9 ]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


# --------------------------------------------------------------------------
# Arena: símbolos de mana vêm como {o2oU}; o padrão da comunidade é {2}{U}.
# --------------------------------------------------------------------------
_TOKEN = re.compile(r"o(\([^)]+\)|\d+|Si|[A-Z])")
_SYMBOL_FIX = {"Si": "S"}


def arena_symbols(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        inner = match.group(1)
        parts = _TOKEN.findall(inner)
        if not parts or "".join("o" + p for p in parts) != inner:
            return match.group(0)
        out = []
        for part in parts:
            part = part.strip("()")
            out.append("{" + _SYMBOL_FIX.get(part, part) + "}")
        return "".join(out)

    return re.sub(r"\{([^}]*)\}", repl, text)


def arena_cost(cost: str | None) -> str | None:
    if not cost:
        return None
    return arena_symbols("{" + cost + "}")


_KEYWORD_LINE = re.compile(r"^[^.:;—]{1,40}$")


def join_keywords(lines: list[str]) -> list[str]:
    """No Arena cada palavra-chave é uma linha ("Voar", "Vigilância").

    Na carta impressa elas dividem a mesma linha: "Voar, vigilância".
    """
    out: list[str] = []
    for line in lines:
        is_kw = bool(_KEYWORD_LINE.match(line)) and "{" not in line
        if is_kw and out and out[-1].endswith("\u0000"):
            prev = out.pop()[:-1]
            out.append(f"{prev}, {line[0].lower()}{line[1:]}\u0000")
        elif is_kw:
            out.append(line + "\u0000")
        else:
            out.append(line)
    return [line.rstrip("\u0000") for line in out]


def load_arena(offline: bool) -> dict[str, dict]:
    """Devolve {nome em inglês: face(s) com texto em PT-BR} a partir do Arena."""
    cards = json.loads(fetch(UNTAPPED + "cards.json", CACHE / "arena_cards.json", offline).read_text())
    br = {i["id"]: i["text"] for i in json.loads(fetch(UNTAPPED + "loc_br.json", CACHE / "arena_loc_br.json", offline).read_text())}
    en = {i["id"]: i["text"] for i in json.loads(fetch(UNTAPPED + "loc_en.json", CACHE / "arena_loc_en.json", offline).read_text())}

    def text(table: dict[int, str], key: int | None) -> str | None:
        value = table.get(key) if key is not None else None
        if not value or value == "#NoTranslationNeeded":
            return None
        return re.sub(r"</?nobr>", "", value)

    by_grp = {c["grpid"]: c for c in cards}

    def face(card: dict) -> dict | None:
        name_pt = text(br, card.get("titleId"))
        if not name_pt:
            return None
        type_pt = text(br, card.get("cardTypeTextId")) or ""
        sub = text(br, card.get("subtypeTextId"))
        if sub:
            type_pt = f"{type_pt} — {sub}"
        lines = [arena_symbols(t) for a in card.get("abilities", []) if (t := text(br, a.get("TextId")))]
        return {
            "name_pt": name_pt,
            "type_pt": type_pt,
            "text_pt": "\n".join(join_keywords(lines)),
            "flavor_pt": text(br, card.get("flavorId")),
            "mana_cost": arena_cost(card.get("castingcost")),
        }

    result: dict[str, dict] = {}
    for card in sorted(cards, key=lambda c: c["grpid"]):  # grpid maior = texto mais novo
        name_en = text(en, card.get("titleId"))
        if not name_en or name_en.startswith("A-") or card.get("set") in DIGITAL_SETS:
            continue
        front = face(card)
        if not front:
            continue
        faces = [front]
        for linked in card.get("linkedFaces") or []:
            other = by_grp.get(linked)
            if other and other.get("titleId") != card.get("titleId") and (f := face(other)):
                f["name_en"] = text(en, other.get("titleId"))
                faces.append(f)
        front["name_en"] = name_en
        # O texto de ambientação (flavor) é de cada impressão: guardamos de qual veio.
        result[name_en] = {"faces": faces, "print": {"set": (card.get("set") or "").lower(), "number": str(card.get("collectorNumber") or "")}}
    log(f"Arena: {len(result)} cartas com texto PT-BR")
    return result


def load_printed_pt(offline: bool) -> dict[str, dict]:
    """Impressão em português mais recente de cada carta (Scryfall lang:pt)."""
    cache = CACHE / "scryfall_pt.jsonl"
    if not (offline and cache.exists()):
        url = "https://api.scryfall.com/cards/search?" + urllib.parse.urlencode(
            {"q": "lang:pt", "unique": "prints", "order": "released", "dir": "desc"}
        )
        with open(cache, "w") as fh:
            page = 0
            while url:
                data = get_json(url)
                for card in data["data"]:
                    fh.write(json.dumps(card, ensure_ascii=False) + "\n")
                url = data.get("next_page")
                page += 1
                if page % 25 == 0:
                    log(f"Scryfall PT: página {page}")
                time.sleep(0.1)  # Scryfall pede 50-100 ms entre chamadas
    best: dict[str, dict] = {}
    with open(cache) as fh:
        for line in fh:
            card = json.loads(line)
            oid = card.get("oracle_id") or (card.get("card_faces") or [{}])[0].get("oracle_id")
            if not oid:
                continue
            current = best.get(oid)
            score = (card.get("highres_image", False), card.get("released_at", ""))
            if current is None or score > current["_score"]:
                card["_score"] = score
                best[oid] = card
    log(f"Scryfall: {len(best)} cartas com impressão em português")
    return best


def printed_faces(card: dict) -> list[dict]:
    faces = card.get("card_faces") or [card]
    out = []
    for f in faces:
        out.append(
            {
                "name_en": f.get("name"),
                "name_pt": f.get("printed_name"),
                "type_pt": f.get("printed_type_line"),
                "text_pt": f.get("printed_text"),
                "flavor_pt": f.get("flavor_text"),
                "mana_cost": f.get("mana_cost"),
            }
        )
    return out


def load_oracle(offline: bool) -> list[dict]:
    meta = get_json("https://api.scryfall.com/bulk-data/oracle-cards")
    path = fetch(meta["jsonl_download_uri"], CACHE / "oracle.jsonl.gz", offline)
    with gzip.open(path, "rt") as fh:
        return [json.loads(line) for line in fh if line.strip()]


UNSUPPORTED_EFFECTS = {"showcase", "etched", "inverted", "fullart", "borderless", "textless", "colorshifted", "spree", "upsidedowndfc"}
UNSUPPORTED_TYPES = ("Planeswalker", "Saga", "Class", "Battle", "Case", "Room")


def frame_supported(card: dict) -> bool:
    """O motor do Proxinho reescreve a moldura moderna (2015+) de layout normal.

    Outras molduras entram por etapas (docs/roadmap.md). Quando a impressão não é
    suportada, o site mostra a imagem oficial em PT (se houver) ou avisa.
    """
    effects = set(card.get("frame_effects") or [])
    type_line = card.get("type_line", "")
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "normal"
        and card.get("border_color") in {"black", "white"}
        and not card.get("full_art")
        and not card.get("textless")
        and not effects & UNSUPPORTED_EFFECTS
        and not any(t in type_line for t in UNSUPPORTED_TYPES)
    )


def load_prints(offline: bool) -> list[dict]:
    """Todas as impressões em inglês no papel (Scryfall default cards)."""
    meta = get_json("https://api.scryfall.com/bulk-data/default-cards")
    path = fetch(meta["jsonl_download_uri"], CACHE / "default.jsonl.gz", offline)
    out = []
    with gzip.open(path, "rt") as fh:
        for line in fh:
            if not line.strip():
                continue
            c = json.loads(line)
            if c.get("lang") != "en" or c.get("digital") or c.get("oversized") or "paper" not in c.get("games", []):
                continue
            if c.get("layout") in {"art_series", "token", "double_faced_token", "emblem"}:
                continue
            oid = c.get("oracle_id") or (c.get("card_faces") or [{}])[0].get("oracle_id")
            face = (c.get("card_faces") or [c])[0]
            out.append(
                {
                    "id": c["id"],
                    "oracle_id": oid,
                    "set_code": c["set"],
                    "set_name": c["set_name"],
                    "number": c["collector_number"],
                    "released": c.get("released_at"),
                    "artist": c.get("artist"),
                    "frame": c.get("frame"),
                    "effects": ",".join(c.get("frame_effects") or []) or None,
                    "border": c.get("border_color"),
                    "layout": c.get("layout"),
                    "highres": bool(c.get("highres_image")),
                    "promo": bool(c.get("promo")),
                    "mana_cost": face.get("mana_cost") or c.get("mana_cost"),
                    "has_pt": face.get("power") is not None or c.get("power") is not None,
                    "two_sided": bool(c.get("card_faces") and not c.get("image_uris")),
                    "supported": frame_supported(c),
                }
            )
    log(f"impressões em inglês: {len(out)} ({sum(p['supported'] for p in out)} com moldura suportada)")
    return out


def build(offline: bool) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    arena = load_arena(offline)
    printed = load_printed_pt(offline)
    oracle = load_oracle(offline)

    rows = []
    stats = {"arena": 0, "impresso": 0, "sem": 0}
    for card in oracle:
        if "paper" not in card.get("games", []) or card.get("layout") in {"art_series", "token", "double_faced_token", "emblem"}:
            continue
        name = card["name"]
        front_name = name.split(" // ")[0]
        oid = card["oracle_id"] if "oracle_id" in card else card["card_faces"][0]["oracle_id"]
        a = arena.get(name) or arena.get(front_name)
        p = printed.get(oid)
        faces_en = card.get("card_faces") or [card]

        if a:
            source, faces, text_print = "arena", a["faces"], a["print"]
        elif p:
            source, faces = "impresso", printed_faces(p)
            text_print = {"set": p["set"], "number": p["collector_number"]}
        else:
            source, faces, text_print = None, [], None
        stats[source or "sem"] += 1

        # Nome em português: o impresso é o que a comunidade conhece (Liga Magic).
        name_pt = None
        if p:
            pf = printed_faces(p)
            if all(f["name_pt"] and f["name_pt"] != f["name_en"] for f in pf):
                name_pt = " // ".join(f["name_pt"] for f in pf)
        if not name_pt and a:
            name_pt = " // ".join(f["name_pt"] for f in a["faces"])
        aliases = {norm(x) for x in [name_pt or "", a and " // ".join(f["name_pt"] for f in a["faces"]) or ""] if x}

        rows.append(
            {
                "oracle_id": oid,
                "name_en": name,
                "name_pt": name_pt,
                "search_en": norm(name),
                "search_pt": " | ".join(sorted(aliases)) or None,
                "source": source,
                "text_print": text_print,
                "faces": [
                    {**f, "name_en": f.get("name_en") or faces_en[min(i, len(faces_en) - 1)].get("name")}
                    for i, f in enumerate(faces)
                ],
                "pt_print": (
                    {"id": p["id"], "set": p["set"], "number": p["collector_number"], "hires": p.get("highres_image", False)}
                    if p
                    else None
                ),
                "layout": card.get("layout"),
                "type_line": card.get("type_line"),
                "edhrec_rank": card.get("edhrec_rank"),
                "commander": card.get("legalities", {}).get("commander") == "legal",
            }
        )
    log(f"cartas: {len(rows)} | texto do Arena: {stats['arena']} | impresso: {stats['impresso']} | sem PT: {stats['sem']}")
    return rows


def sql_str(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return "'" + value.replace("'", "''") + "'"


PRINT_COLUMNS = ["id", "oracle_id", "set_code", "set_name", "number", "released", "artist", "frame", "effects", "border", "layout", "highres", "promo", "mana_cost", "has_pt", "two_sided", "supported"]

COLUMNS = ["oracle_id", "name_en", "name_pt", "search_en", "search_pt", "source", "text_print", "faces", "pt_print", "layout", "type_line", "edhrec_rank", "commander"]


def write_table(fh, table: str, columns: list[str], rows: list[dict]) -> None:
    fh.write(f"DELETE FROM {table};\n")
    for i in range(0, len(rows), 100):
        batch = rows[i : i + 100]
        values = ",\n".join("(" + ",".join(sql_str(r[c]) for c in columns) + ")" for r in batch)
        fh.write(f"INSERT INTO {table} ({','.join(columns)}) VALUES\n{values};\n")


def write(rows: list[dict], prints: list[dict]) -> None:
    with open(OUT / "cards.jsonl", "w") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    # D1 aceita arquivos SQL; lotes de 100 linhas por INSERT ficam rápidos.
    with open(OUT / "cards.sql", "w") as fh:
        write_table(fh, "cards", COLUMNS, rows)
        write_table(fh, "prints", PRINT_COLUMNS, prints)
        fh.write(f"INSERT OR REPLACE INTO meta (key, value) VALUES ('updated_at', {sql_str(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))});\n")
    log(f"escrito {OUT / 'cards.sql'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="reaproveita downloads em data/cache")
    args = parser.parse_args()
    rows = build(args.offline)
    known = {r["oracle_id"] for r in rows}
    prints = [p for p in load_prints(args.offline) if p["oracle_id"] in known]
    write(rows, prints)


if __name__ == "__main__":
    main()
