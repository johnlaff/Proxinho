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
_TOKEN = re.compile(r"o(\([^)]+\)|\d+|Si|[A-Za-z])")
_SYMBOL_FIX = {"Si": "S"}


def arena_symbols(text: str) -> str:
    """{o2oU} vira {2}{U}. Dois defeitos do arquivo do Arena também são consertados:
    a chave escapada (Countervailing Winds: "\\\\{o1\\\\}") e a cor em minúscula
    (Aeromunculus: "{o2oGou}")."""

    def repl(match: re.Match[str]) -> str:
        inner = match.group(1)
        parts = _TOKEN.findall(inner)
        if not parts or "".join("o" + p for p in parts) != inner:
            return match.group(0)
        out = []
        for part in parts:
            part = part.strip("()")
            part = part if part == "Si" else part.upper()
            out.append("{" + _SYMBOL_FIX.get(part, part) + "}")
        return "".join(out)

    text = re.sub(r"\\+([{}])", "\\1", text)
    return re.sub(r"\{([^}]*)\}", repl, text)


# Marcas invisíveis de direção e de largura zero (U+200B a U+200F, U+2060, U+FEFF). O
# Arena tem "\u200e-2: Você pode conjurar…" (Chandra, Acolyte of Flame e Chandra, Flame's
# Catalyst): com a marca na frente, o parágrafo não começava com o custo, `pw_costs`
# punha o custo do Oracle de novo e a carta saía com "−2: -2: Você…". Não são letras.
_INVISIBLE = re.compile("[\u200b-\u200f\u2060\ufeff]")


def drop_invisible(text: str | None) -> str | None:
    """Tira as marcas invisíveis e as linhas que só tinham elas ("…de terreno.\n\u200e")."""
    if not text or not _INVISIBLE.search(text):
        return text
    lines = [_INVISIBLE.sub("", line) for line in text.split("\n") if line.strip() == "" or _INVISIBLE.sub("", line).strip()]
    return "\n".join(lines)


def fix_arena_typos(text: str) -> str:
    """Erros de digitação do arquivo do Arena que não mudam nada do texto oficial: o "+"
    repetido no bônus ("recebe +1/++1", Colorstorm Stallion; "+2/++2" no Delírio de
    SOS). Nomes como "Cura++" (Final Fantasy) ficam como estão."""
    return re.sub(r"([+-](?:\d+|X))/\+\+(\d+|X)\b", r"\1/+\2", text)


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


def cites_alt_name(text_pt: str, alt_names: list[str | None]) -> bool:
    """O texto cita o nome alternativo da carta (inteiro ou só antes da vírgula)?"""
    for name in alt_names:
        if not name:
            continue
        for part in {name.strip(), name.split(",")[0].strip()}:
            if part and part in text_pt:
                return True
    return False


BASIC_MANA = {"Plains": "W", "Island": "U", "Swamp": "B", "Mountain": "R", "Forest": "G"}


def is_intrinsic_mana(type_en: str | None, subtypes_en: str | None, ability_en: str | None) -> bool:
    """
    "{T}: Adicione {U}." de um terreno do tipo Ilha vem do próprio tipo: a carta impressa
    não traz essa linha (no máximo um lembrete), mas o Arena a lista como habilidade.
    Túmulo Aquoso e as Triomes saíam com duas ou três linhas a mais, fora de ordem. Só vale
    para terrenos: o "{T}: Adicione {G}." dos Elfos de Llanowar é habilidade de verdade.
    """
    m = re.fullmatch(r"\{oT\}: Add \{o([WUBRG])\}\.", ability_en or "")
    if not m or "Land" not in (type_en or "").split():
        return False
    return any(BASIC_MANA.get(w) == m.group(1) for w in (subtypes_en or "").split())


def load_arena(offline: bool) -> dict[str, dict]:
    """Devolve {nome em inglês: face(s) com texto em PT-BR} a partir do Arena."""
    cards = json.loads(fetch(UNTAPPED + "cards.json", CACHE / "arena_cards.json", offline).read_text())
    br = {i["id"]: i["text"] for i in json.loads(fetch(UNTAPPED + "loc_br.json", CACHE / "arena_loc_br.json", offline).read_text())}
    en = {i["id"]: i["text"] for i in json.loads(fetch(UNTAPPED + "loc_en.json", CACHE / "arena_loc_en.json", offline).read_text())}

    def text(table: dict[int, str], key: int | None) -> str | None:
        value = table.get(key) if key is not None else None
        # marcadores internos do Arena ("#NoTranslationNeeded", "#StationLevelInstrinsic_NoTranslation"…)
        if not value or re.fullmatch(r"#\S+", value):
            return None
        return fix_arena_typos(drop_invisible(re.sub(r"</?nobr>", "", value)))

    by_grp = {c["grpid"]: c for c in cards}

    def face(card: dict) -> dict | None:
        name_pt = text(br, card.get("titleId"))
        if not name_pt:
            return None
        type_pt = text(br, card.get("cardTypeTextId")) or ""
        sub = text(br, card.get("subtypeTextId"))
        if sub:
            type_pt = f"{type_pt} — {sub}"
        type_en, sub_en = en.get(card.get("cardTypeTextId")), en.get(card.get("subtypeTextId"))
        lines = [
            arena_symbols(t)
            for a in card.get("abilities", [])
            if (t := text(br, a.get("TextId"))) and not is_intrinsic_mana(type_en, sub_en, en.get(a.get("TextId")))
        ]
        return {
            "name_pt": name_pt,
            "type_pt": type_pt,
            "text_pt": clean_rules("\n".join(join_keywords(lines))),
            "flavor_pt": fix_breaks(text(br, card.get("flavorId")), flavor=True),
            "_flavor_en": text(en, card.get("flavorId")),
            "mana_cost": arena_cost(card.get("castingcost")),
        }

    result: dict[str, dict] = {}
    # grpid maior = texto mais novo; as versões com nome alternativo vêm antes, para a
    # impressão normal sempre ganhar quando existe
    for card in sorted(cards, key=lambda c: (not c.get("altTitleId"), c["grpid"])):
        name_en = text(en, card.get("titleId"))
        if not name_en or name_en.startswith("A-") or card.get("set") in DIGITAL_SETS:
            continue
        # fichas têm nomes que coincidem com cartas ("Adorned Pouncer" eternizado): ficam em load_arena_tokens
        if card.get("isToken"):
            continue
        front = face(card)
        if not front:
            continue
        if card.get("altTitleId"):
            # Versão com nome alternativo (Universes Beyond, Godzilla, Drácula): o texto
            # cita o outro nome ("Quando Keenser entrar…", no Rishkar). Só entra quando
            # não há impressão normal e o texto não cita o outro nome.
            if cites_alt_name(front["text_pt"], [text(en, card.get("altTitleId")), text(br, card.get("altTitleId"))]):
                continue
            front["flavor_pt"] = None
        faces = [front]
        for linked in card.get("linkedFaces") or []:
            other = by_grp.get(linked)
            if other and other.get("titleId") != card.get("titleId") and (f := face(other)):
                f["name_en"] = text(en, other.get("titleId"))
                faces.append(f)
        front["name_en"] = name_en
        # O texto de ambientação (flavor) é de cada impressão: guardamos de qual veio e o
        # flavor em inglês do próprio Arena, para achar as artes de papel com o mesmo flavor
        # (nas coleções digitais, como Kaladesh Remastered, o Scryfall não tem o flavor)
        flavor_en = tuple(flavor_key(f.pop("_flavor_en", None) if f["flavor_pt"] else None) for f in faces)
        for f in faces:
            f.pop("_flavor_en", None)
        result[name_en] = {
            "faces": faces,
            "print": {"set": (card.get("set") or "").lower(), "number": str(card.get("collectorNumber") or "")},
            "flavor_en": flavor_en,
        }
    log(f"Arena: {len(result)} cartas com texto PT-BR")
    return result


def token_key(name: str, power: object, toughness: object, text: str, type_line: str | None) -> tuple[str, str, str, str, str]:
    """
    Chave para casar uma ficha do Arena com a do Scryfall: nome, P/R, texto sem lembretes e
    os tipos. Sem os tipos, a Barreira 0/4 artefato (THB) levava o tipo da Barreira 0/4 que
    não é artefato (MSH, mais nova no Arena): "Criatura Ficha", sem o "Artefato".
    """
    types = " ".join(sorted(w for w in (type_line or "").split("—")[0].lower().split() if w != "token"))
    t = re.sub(r"</?nobr>", "", text or "")
    t = re.sub(r"\{o([^}]*)\}", lambda m: "{" + m.group(1) + "}", t).lower()
    t = re.sub(r"\([^)]*\)", "", t)  # texto de lembrete
    t = t.replace("enters the battlefield", "enters")
    t = re.sub(r"this (creature|artifact|enchantment|permanent)", "this token", t)
    t = re.sub(r"[^a-z0-9{}+/*]", "", t)
    return (name.lower(), str(power), str(toughness), t, types)


def token_face_key(face: dict) -> tuple:
    """Chave de uma ficha do Scryfall (ou de uma face de ficha de duas faces) com as cores:
    o Zumbi preto da ficha de duas faces não é o Zumbi encantamento, nem o Vampiro branco o
    Vampiro branco e preto."""
    key = token_key(face.get("name", ""), face.get("power"), face.get("toughness"), face.get("oracle_text") or "", face.get("type_line"))
    return (*key, "".join(face.get("colors") or []))


def load_arena_tokens() -> dict[tuple, dict]:
    """Fichas do Arena com texto em PT-BR, pela chave de `token_key` (usa o cache de load_arena)."""
    cards = json.loads((CACHE / "arena_cards.json").read_text())
    br = {i["id"]: i["text"] for i in json.loads((CACHE / "arena_loc_br.json").read_text())}
    en = {i["id"]: i["text"] for i in json.loads((CACHE / "arena_loc_en.json").read_text())}

    def text(table: dict[int, str], key: int | None) -> str | None:
        value = table.get(key) if key is not None else None
        if not value or re.fullmatch(r"#\S+", value):
            return None
        return re.sub(r"</?nobr>", "", value)

    out: dict[tuple, dict] = {}
    for card in sorted(cards, key=lambda c: c["grpid"]):  # grpid maior = texto mais novo
        if not card.get("isToken"):
            continue
        name_en, name_pt = text(en, card.get("titleId")), text(br, card.get("titleId"))
        if not name_en or not name_pt:
            continue
        abilities = card.get("abilities", [])
        en_text = "".join(text(en, a.get("TextId")) or "" for a in abilities)
        pt_lines = [arena_symbols(t) for a in abilities if (t := text(br, a.get("TextId")))]
        type_pt = text(br, card.get("cardTypeTextId"))
        if not type_pt or type_pt == "NONE":
            continue  # "O Monarca" e afins não são fichas de verdade
        # algumas fichas do Arena vêm sem "Token" no tipo ("Creature", "Legendary Creature"). O
        # próprio Arena escreve "Token Legendary Creature" como "Criatura Lendária Ficha": "Ficha" no fim.
        if "Ficha" not in type_pt:
            type_pt = f"{type_pt} Ficha"
        sub = text(br, card.get("subtypeTextId"))
        out[token_key(name_en, card.get("power"), card.get("toughness"), en_text, text(en, card.get("cardTypeTextId")))] = {
            "name_en": name_en,
            "name_pt": name_pt,
            "type_pt": f"{type_pt} — {sub}" if sub else type_pt,
            "text_pt": clean_rules("\n".join(join_keywords(pt_lines))),
            "flavor_pt": None,
            "mana_cost": None,
            "print": {"set": (card.get("set") or "").lower(), "number": str(card.get("collectorNumber") or "")},
        }
    log(f"Arena: {len(out)} fichas com texto PT-BR")
    return out


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
    with open(cache) as fh:
        best = pick_printed(json.loads(line) for line in fh)
    log(f"Scryfall: {len(best)} cartas com impressão em português")
    return best


def pick_printed(cards) -> dict[str, dict]:
    """
    Escolhe, por carta, a impressão em PT da imagem (alta resolução primeiro, depois a
    mais nova) e guarda em `_text` a do texto: a mais nova. O texto das impressões
    antigas segue regras velhas ("Coloque em jogo uma ficha", "reserva de mana"), e a
    alta resolução quase sempre é de uma coleção antiga, escaneada.
    """
    best: dict[str, dict] = {}
    newest: dict[str, dict] = {}
    for card in cards:
        oid = card.get("oracle_id") or (card.get("card_faces") or [{}])[0].get("oracle_id")
        if not oid:
            continue
        score = (card.get("highres_image", False), card.get("released_at", ""))
        if oid not in best or score > best[oid]["_score"]:
            card["_score"] = score
            best[oid] = card
        faces = card.get("card_faces") or [card]
        text_score = (all(f.get("printed_type_line") for f in faces), card.get("released_at", ""), card.get("highres_image", False))
        if oid not in newest or text_score > newest[oid][0]:
            newest[oid] = (text_score, card)
    for oid, card in best.items():
        card["_text"] = newest[oid][1]
    return best


_LOWER = "a-zà-öø-ÿ"
_UPPER = "A-ZÀ-ÖØ-Þ"


_REPEATED = re.compile(rf"(?<![\w{_LOWER}{_UPPER}])([{_LOWER}]{{2,}}) \1(?![\w{_LOWER}{_UPPER}])")


def drop_repeated_words(text: str | None) -> str | None:
    """
    Palavra repetida no texto de regras ("Toda vez que que", "As criaturas criaturas não
    ficha", "use use dobra de terra"): erro de digitação, umas 15 vezes no Arena e 2 no
    Scryfall. Só minúsculas (nomes como "Jeong Jeong" ficam) e só nas regras: no flavor
    a repetição pode ser de propósito ("existem os mortos e existem os mortos mortos").
    """
    if not text:
        return text
    return _REPEATED.sub(r"\1", text)


_GLUED = re.compile(r"(?<=[a-zà-úç])((?:\{[^}]+\})+)(:?)")


def fix_glued_symbols(text: str | None) -> str | None:
    """
    Palavra colada num símbolo de mana. Se os símbolos fecham com ":", é o custo de uma
    habilidade ativada que perdeu a quebra de linha no texto impresso do Scryfall
    ("Ímpeto{T}: Adicione", Beastcaller Savant; "Vigilância{R}{W}:", Truefire Paladin) e
    ela volta. Senão, é o espaço que o Arena perdeu ("Adicione{B}{B}{B}{B}", o emblema da
    Liliana of the Dark Realms; "pague{X}", Spectral Denial). Só pontuação, nunca palavras.
    """
    if not text:
        return text
    return _GLUED.sub(lambda m: ("\n" if m.group(2) else " ") + m.group(1) + m.group(2), text)


_GLUED_COMMA = re.compile(rf"(?<=[{_LOWER}{_UPPER}]),(?=[{_LOWER}{_UPPER}])")


def glue_comma(text: str) -> str:
    """Vírgula colada na palavra seguinte ("no seu turno,anexe até", Sokka, Swordmaster e
    Barret, Avalanche Leader; "à frente,o terror", flavor do Disciple of Grace): falta o
    espaço depois dela. Entre letras só; "1,5" e "{2},{T}" ficam."""
    return _GLUED_COMMA.sub(", ", text)


def fix_spacing(text: str | None) -> str | None:
    """
    Espaço antes de vírgula ou ponto ("Zumbi preta 2/2 .", Juramento de Liliana; "que você
    controla ,em vez de", Épico de Herança) e pontuação dobrada ("{X},, {T}", Lira
    Hipnotizante; "Primoc de Elo Mental..", com dois pontos e não três). Uns 20 casos, quase
    todos do Arena. As reticências ("Arremessar...") ficam. Só pontuação, nunca palavras.
    """
    if not text:
        return text
    text = re.sub(r",{2,}", ",", text)
    text = glue_comma(text)
    text = re.sub(r"(?<!\.)\.\.(?!\.)", ".", text)
    # vírgula grudada na palavra seguinte: o espaço vai para depois dela
    text = re.sub(r"(?<=\S) +,(?=[^\s\d,])", ", ", text)
    return re.sub(r"(?<=\S) +([.,])(?=\s|$|[)\"”])", r"\1", text)


def clean_rules(text: str | None) -> str | None:
    """Consertos de digitação e pontuação do texto de regras, nas duas fontes."""
    return balance_parens(drop_repeated_words(fix_glued_symbols(fix_spacing(text))))


def balance_parens(text: str | None) -> str | None:
    """
    Parênteses do lembrete que faltam no texto em PT (14 cartas no Scryfall, 5 no Arena).
    O lembrete é o que sai em itálico, e um parêntese a menos deixava o lembrete em
    letra comum com um ")" solto (Dismantling Blow, MH1: "Reforçar {2}{U} Você pode
    pagar….)") ou sem o fecho ("Voar (Esta criatura só pode ser bloqueada…").

    - quebra de linha dentro de um lembrete que fecha depois vira espaço (Fangs of
      Kalonia: o lembrete da Sobrecarga é um parágrafo só);
    - ")" sem "(": o "(" volta no começo da frase dele, depois do último ") " ou ". "
      ou do custo da palavra-chave ("} " e maiúscula);
    - "(" sem ")": o ")" volta no fim da linha.
    É conserto de pontuação: as palavras continuam as do texto oficial.
    """
    if not text or ("(" not in text and ")" not in text):
        return text
    out = []
    depth = 0
    for i, ch in enumerate(text):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == "\n" and depth > 0 and ")" in text[i:].split("(")[0]:
            out.append(" ")
            continue
        out.append(ch)
    lines = []
    for line in "".join(out).split("\n"):
        # aspas e fecho repetidos no fim (Fangs of Kalonia: "…criatura".) ".)")
        line = re.sub(r'(["”]\.\))\s*["”]\.\)$', r"\1", line)
        depth = 0
        i = 0
        while i < len(line):
            if line[i] == "(":
                depth += 1
            elif line[i] == ")":
                if depth == 0:
                    starts = [m.end() for m in re.finditer(rf"[).] |\}} (?=[{_UPPER}])", line[:i])]
                    at = starts[-1] if starts else 0
                    line = line[:at] + "(" + line[at:]
                    i += 2
                    continue
                depth -= 1
            i += 1
        lines.append(line + ")" * depth)
    return "\n".join(lines)


def fix_breaks(text: str | None, flavor: bool = False) -> str | None:
    """
    Quebras de linha e espaços que faltam no texto impresso do Scryfall (coleções de
    2015 e 2016, sobretudo): "virada.Quando…", "mana.{3}{W}, {T}…", a palavra-chave
    colada na frase seguinte ("VoarAterragem", "Encantar criaturaA criatura") e, no
    flavor, a assinatura colada nas aspas ("…diferente."— Mina) e o espaço que some
    na troca de itálico ("SantoTraft", "deWirewood").

    Três minúsculas seguidas de maiúscula nunca são nome: os nomes com maiúscula no
    meio têm uma ou duas antes dela (McCoy, DePietro, MacArthur).
    """
    if not text:
        return text
    text = drop_invisible(text)
    run_on = rf"(?<=[{_LOWER}]{{3}})(?=[{_UPPER}])"
    if flavor:
        # só antes da assinatura ("— Mina", "—Os Ensinamentos"): o travessão no meio da
        # frase ("“A Queimadura”—outrora uma região…") fica
        text = glue_comma(re.sub(rf'(["”]) ?(?=— |—[{_UPPER}])', "\\1\n", text))
        text = re.sub(rf"(?<![^\s\"“(—])([{_LOWER}]{{2}})(?=[{_UPPER}])", "\\1 ", text)
        return re.sub(run_on, " ", text)
    text = re.sub(r"([.)])(?=[{A-ZÀ-Ú•])", "\\1\n", text)
    return re.sub(run_on, "\n", text)


_COST = re.compile(r"^\s*\[?([+−–-]?(?:\d+|X))\]?\s*:\s*")


def pw_costs(oracle_text: str | None, text_pt: str | None) -> str | None:
    """
    Texto de planeswalker com um parágrafo por habilidade e o custo de lealdade na
    frente de cada uma ("+1: Use vidência 2."), como na carta impressa. O Arena traz as
    habilidades sem o custo; ele vem da linha correspondente do Oracle em inglês. Com
    o custo, o motor sabe quais parágrafos são estáticos e se ficam em cima ou embaixo
    dos escudos. Devolve None quando o número de parágrafos não bate com o Oracle.
    """
    en = [x for x in (oracle_text or "").split("\n") if x.strip()]
    pt_text = re.sub(r'([.”"])\s*(?=[+−–-](?:\d+|X):)', "\\1\n", text_pt or "")
    pt = [x.strip() for x in pt_text.split("\n") if x.strip()]
    if len(en) != len(pt):
        return None
    out = []
    for e, t in zip(en, pt):
        cost = _COST.match(e)
        out.append(f"{cost.group(1)}: {t}" if cost and not _COST.match(t) else t)
    return "\n".join(out)


# Parágrafo que começa com um nome e um travessão, com texto depois na mesma linha
# ("Landfall — Whenever…", "Aterragem — Toda vez…"). O custo de uma palavra-chave
# ("Ward—Pay 2 life") não tem espaço em volta do travessão no Oracle, e "Choose one —"
# não tem texto depois.
_ABILITY_WORD = re.compile(r"^([^—{}:•(\n]{1,40}) — \S")

# Palavras de habilidade e de ambientação (minúsculas), que a carta impressa traz em
# itálico. Vêm dos catálogos do Scryfall (ver `load_italic_words`).
ITALIC_WORDS: set[str] = set()


def load_italic_words(offline: bool) -> set[str]:
    """Palavras de habilidade ("Landfall") e de ambientação ("Lightning Breath") do Scryfall."""
    words: set[str] = set()
    for name in ("ability-words", "flavor-words"):
        path = fetch(f"https://api.scryfall.com/catalog/{name}", CACHE / f"catalog_{name}.json", offline)
        words |= {w.lower() for w in json.loads(path.read_text())["data"]}
    return words


def italic_prefix(prefix: str, italic: set[str]) -> bool:
    """O nome antes do travessão é palavra de habilidade? "Descend 4" conta como "Descend"."""
    p = prefix.strip().lower()
    return p in italic or re.sub(r" \d+$", "", p) in italic


def ability_word_lines(oracle_text: str | None, text_pt: str | None, italic: set[str] | None = None) -> list[int] | None:
    """
    Linhas do texto em PT (índices de `text_pt.split("\n")`) que começam com uma palavra de
    habilidade, que a carta impressa traz em itálico ("*Aterragem* — Toda vez…"). O texto
    em PT não diz o que é palavra de habilidade e o que é custo de palavra-chave ("Salva-
    guarda — Pague 2 pontos de vida"); o Oracle diz, pelos espaços em volta do travessão.
    E nem todo nome com travessão é palavra de habilidade: "Max speed —" (Zahur, DFT),
    "Exhaust —" e "Boast —" são palavras-chave, em tipo comum, como os capítulos das
    sagas ("I, II —"). Só entra o nome que está nos catálogos de palavras de habilidade e
    de ambientação (`italic`). As linhas com travessão dos dois lados casam pela ordem: só
    vale quando o número delas bate; senão, nenhuma.
    """
    italic = ITALIC_WORDS if italic is None else italic
    en = [m.group(1) for x in (oracle_text or "").split("\n") if (m := _ABILITY_WORD.match(x.strip()))]
    if not en or not text_pt:
        return None
    pt = [i for i, x in enumerate(text_pt.split("\n")) if _ABILITY_WORD.match(x.strip())]
    if len(pt) != len(en):
        return None
    out = [i for i, prefix in zip(pt, en) if italic_prefix(prefix, italic)]
    return out or None


def printed_faces(card: dict) -> list[dict]:
    """Faces com o texto em PT da impressão mais nova (ver `pick_printed`)."""
    card = card.get("_text", card)
    faces = card.get("card_faces") or [card]
    out = []
    for f in faces:
        text = f.get("printed_text")
        # criatura sem habilidades (Great-Horn Krushok): o Scryfall não manda o texto,
        # que é vazio mesmo. Com o tipo em PT, é tradução; antes ficava `None` e a carta
        # saía em inglês, como se não houvesse texto oficial
        if text is None and f.get("printed_type_line") and f.get("oracle_text") == "":
            text = ""
        out.append(
            {
                "name_en": f.get("name"),
                "name_pt": f.get("printed_name"),
                # impressões antigas separam o subtipo com hífen: é o travessão da carta
                "type_pt": re.sub(r" - ", " — ", f["printed_type_line"]) if f.get("printed_type_line") else None,
                "text_pt": clean_rules(fix_breaks(text)),
                "flavor_pt": fix_breaks(f.get("flavor_text"), flavor=True),
                "mana_cost": f.get("mana_cost"),
            }
        )
    return out


def printed_has_text(card: dict) -> bool:
    """A impressão em PT traz tipo ou texto (algumas do Scryfall vêm só com a imagem)."""
    return any(f["text_pt"] or f["type_pt"] for f in printed_faces(card))


def load_oracle(offline: bool) -> list[dict]:
    meta = get_json("https://api.scryfall.com/bulk-data/oracle-cards")
    path = fetch(meta["jsonl_download_uri"], CACHE / "oracle.jsonl.gz", offline)
    with gzip.open(path, "rt") as fh:
        return [json.loads(line) for line in fh if line.strip()]


UNSUPPORTED_EFFECTS = {"showcase", "etched", "inverted", "fullart", "borderless", "textless", "colorshifted", "spree", "upsidedowndfc"}
UNSUPPORTED_TYPES = ("Planeswalker", "Saga", "Class", "Battle", "Case", "Room")
# planeswalkers de layout normal já são reescritos (src/engine/planeswalker.ts)
UNSUPPORTED_TYPES_NORMAL = tuple(t for t in UNSUPPORTED_TYPES if t != "Planeswalker")


def art_behind_box(card: dict) -> bool:
    """Promos de Game Day de 2014 a 2022: a arte passa por trás da linha de tipo e da
    caixa de texto, que é translúcida, mas o Scryfall não as marca como `full_art`. O
    motor apagava retângulos de papel que ali não existem. As do Wizards Play Network
    (2022) têm a moldura comum e ficam."""
    promos = set(card.get("promo_types") or [])
    return "gameday" in promos and "wizardsplaynetwork" not in promos


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
        and not art_behind_box(card)
        and not card.get("textless")
        and not effects & UNSUPPORTED_EFFECTS
        and not any(t in type_line for t in UNSUPPORTED_TYPES_NORMAL)
        # naves e planetas com "Estacionar" têm caixas de nível próprias (2+, 12+)
        and "Station" not in (card.get("keywords") or [])
    )


DFC_LAYOUTS = {"transform", "modal_dfc"}
# molduras de duas faces com desenho próprio (bússola de Ixalan, planeswalker de Magic Origins…)
UNSUPPORTED_DFC_EFFECTS = UNSUPPORTED_EFFECTS | {"compasslanddfc", "originpwdfc", "fandfc", "convertdfc"}


def face_supported(card: dict, face: dict) -> bool:
    """Uma face de carta de duas faces (transformar ou modal) na moldura 2015."""
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") in DFC_LAYOUTS
        and card.get("border_color") in {"black", "white"}
        and not card.get("full_art")
        and not art_behind_box(card)
        and not card.get("textless")
        and not effects & UNSUPPORTED_DFC_EFFECTS
        and not any(t in face.get("type_line", "") for t in UNSUPPORTED_TYPES)
    )


def sides_of(card: dict) -> list[dict] | None:
    """Dados de cada face de uma impressão de duas faces (para o motor da carta)."""
    faces = card.get("card_faces")
    if card.get("layout") not in DFC_LAYOUTS or not faces or card.get("image_uris"):
        return None
    out = []
    for f in faces:
        has_pt = f.get("power") is not None
        out.append(
            {
                "mana_cost": f.get("mana_cost") or None,
                "has_pt": has_pt,
                "pt": f"{f['power']}/{f['toughness']}" if has_pt else None,
                "indicator": bool(f.get("color_indicator")),
                "supported": face_supported(card, f),
            }
        )
    return out


# efeitos de moldura que não mudam o lugar do texto nas fichas (só a textura)
TOKEN_EFFECTS_OK = {"legendary", "enchantment", "inverted", "fullart", "snow"}


def token_supported(card: dict) -> bool:
    """Ficha ou emblema nas molduras de 2003 e 2015: nome no alto e linha de tipo de altura variável.

    O motor acha a linha de tipo na própria imagem (src/engine/token.ts); se não achar, a ficha sai
    como está. Arte sem bordas e fichas sem texto impresso ("textless") ficam de fora.
    """
    return (
        card.get("frame") in ({"2015"} if card.get("layout") == "emblem" else {"2003", "2015"})  # emblema de 2003 tem outro desenho
        and card.get("layout") in {"token", "emblem", "double_faced_token"}
        and card.get("border_color") == "black"
        and not card.get("textless")
        and set(card.get("frame_effects") or []) <= TOKEN_EFFECTS_OK
    )


# Fichas e emblemas encontrados em load_prints: {oracle_id: impressão de referência}
TOKENS: dict[str, dict] = {}
# Fichas e emblemas que cada carta cria: {oracle_id da carta: {id da impressão}}
TOKEN_PARTS: dict[str, set[str]] = {}
# Fichas de duas faces: {id da impressão: [oracle_id da ficha de cada face]}
DFT_FACES: dict[str, list[str]] = {}
# Flavor em inglês de toda impressão em inglês, digitais incluídas: {(coleção, número): flavor de cada face}
FLAVORS: dict[tuple[str, str], tuple[str, ...]] = {}


def flavor_key(text: str | None) -> str:
    """Flavor comparável entre impressões: aspas, travessões e espaços de um tipo só."""
    if not text:
        return ""
    # o Scryfall marca o trecho em letra comum dentro do itálico com *…* ("the *Dragon's
    # Smile*", na Kari Zev); o Arena, com <i>…</i> ou sem marca nenhuma
    s = re.sub(r"</?i>|\*", "", text)
    s = s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    s = re.sub(r"\s*[—–]\s*", "—", s)
    return re.sub(r"\s+", " ", s).strip()


def print_flavor(card: dict) -> tuple[str, ...]:
    """O flavor em inglês de cada face da impressão (vazio onde não há)."""
    faces = card.get("card_faces") or [card]
    values = [f.get("flavor_text") for f in faces]
    if not any(values) and card.get("flavor_text"):
        values = [card["flavor_text"]]
    return tuple(flavor_key(v) for v in values)


# coleções com outro código no Arena (Dominaria é "DAR" lá e "dom" no Scryfall)
ARENA_SETS = {"dar": "dom"}


def mark_text_flavor(rows: list[dict], prints: list[dict], flavors: dict[tuple[str, str], tuple[str, ...]]) -> int:
    """Marca as impressões com o mesmo flavor em inglês da impressão de onde veio o texto em PT.

    O flavor em PT é de uma impressão (`text_print`). Outra arte da carta com o mesmo
    flavor em inglês (a promo de arte estendida do Spock, Logical Choice) leva o mesmo
    flavor em PT; uma com outro flavor, ou sem flavor, não leva nenhum.
    """
    ref: dict[str, set[tuple[str, ...]]] = {}
    for r in rows:
        # o flavor em inglês da impressão em inglês de mesma coleção e número e, no texto do
        # Arena, o do próprio Arena (nas coleções digitais o Scryfall não tem flavor)
        tp = r.get("text_print")
        refs = {r.pop("_flavor_ref", None)}
        if tp:
            refs.add(flavors.get((ARENA_SETS.get(tp["set"].lower(), tp["set"].lower()), str(tp["number"]))))
        refs = {f for f in refs if f and any(f)}
        if refs:
            ref[r["oracle_id"]] = refs
    n = 0
    for p in prints:
        p["text_flavor"] = p.get("_flavor") in ref.get(p["oracle_id"], ())
        n += p["text_flavor"]
    return n


def is_token_type(type_line: str | None) -> bool:
    """Fichas de verdade e emblemas; "Copy", "The Monarch", "Boss" e afins são cartas de apoio."""
    t = type_line or ""
    return t.startswith("Token ") or t == "Emblem" or t.startswith("Emblem — ")


def print_row(c: dict, oid: str, face: dict, sides: list[dict] | None, pid: str | None = None) -> dict:
    return {
        "id": pid or c["id"],
        "oracle_id": oid,
        "set_code": c["set"],
        "set_name": c["set_name"],
        "number": c["collector_number"],
        "released": c.get("released_at"),
        "artist": face.get("artist") or c.get("artist"),
        "frame": c.get("frame"),
        "effects": ",".join(c.get("frame_effects") or []) or None,
        "border": c.get("border_color"),
        "layout": c.get("layout"),
        "highres": bool(c.get("highres_image")),
        "promo": bool(c.get("promo")),
        "mana_cost": face.get("mana_cost") or c.get("mana_cost"),
        "has_pt": face.get("power") is not None or c.get("power") is not None,
        "two_sided": bool(c.get("card_faces") and not c.get("image_uris")) and c.get("layout") != "double_faced_token",
        "supported": frame_supported(c) or token_supported(c) or bool(sides and sides[0]["supported"]),
        "sides": sides,
    }


def dft_prints(dfts: list[dict]) -> list[dict]:
    """Cada face de uma ficha de duas faces vira uma arte da ficha de uma face só equivalente.

    A face de trás tem id "<id>#1": o site entende e baixa a imagem do verso (src/engine/types.ts).
    """
    by_key = {token_face_key(t): oid for oid, t in TOKENS.items()}
    out = []
    for c in dfts:
        oids = []
        for i, f in enumerate(c.get("card_faces") or []):
            oid = by_key.get(token_face_key(f))
            oids.append(oid)
            if oid:
                row = print_row(c, oid, f, None, c["id"] if i == 0 else f"{c['id']}#1")
                row["_flavor"] = (flavor_key(f.get("flavor_text")),)
                out.append(row)
        DFT_FACES[c["id"]] = [o for o in oids if o]
    log(f"fichas de duas faces: {len(dfts)} | faces casadas com fichas de uma face: {len(out)}")
    return out


def load_prints(offline: bool) -> list[dict]:
    """Todas as impressões em inglês no papel (Scryfall default cards), fichas incluídas."""
    meta = get_json("https://api.scryfall.com/bulk-data/default-cards")
    path = fetch(meta["jsonl_download_uri"], CACHE / "default.jsonl.gz", offline)
    out = []
    dfts: list[dict] = []
    with gzip.open(path, "rt") as fh:
        for line in fh:
            if not line.strip():
                continue
            c = json.loads(line)
            if c.get("lang") == "en":
                FLAVORS[(c["set"], c["collector_number"])] = print_flavor(c)
            if c.get("lang") != "en" or c.get("digital") or c.get("oversized") or "paper" not in c.get("games", []):
                continue
            if c.get("layout") == "art_series":
                continue
            if c.get("layout") == "double_faced_token":
                # só as de duas fichas de verdade ("Vampire // Treasure"); as de apoio ficam de fora
                if all(is_token_type(f.get("type_line")) for f in c.get("card_faces") or [{}]):
                    dfts.append(c)
                continue
            oid = c.get("oracle_id") or (c.get("card_faces") or [{}])[0].get("oracle_id")
            if c.get("layout") in {"token", "emblem"}:
                if not is_token_type(c.get("type_line")):
                    continue
                # a mais recente vira a referência de nome, tipo, texto e P/R da ficha
                if oid and (oid not in TOKENS or (c.get("released_at") or "") > (TOKENS[oid].get("released_at") or "")):
                    TOKENS[oid] = c
            else:
                for part in c.get("all_parts") or []:
                    # emblemas aparecem como "combo_piece", pelo tipo
                    if part.get("component") == "token" or (part["id"] != c["id"] and part.get("type_line", "").startswith("Emblem")):
                        TOKEN_PARTS.setdefault(oid, set()).add(part["id"])
            face = (c.get("card_faces") or [c])[0]
            row = print_row(c, oid, face, sides_of(c))
            row["_flavor"] = print_flavor(c)
            out.append(row)
    out += dft_prints(dfts)
    log(f"impressões em inglês: {len(out)} ({sum(p['supported'] for p in out)} com moldura suportada)")
    return out


# planeswalkers cujo texto em PT tem outro número de habilidades que o inglês
PW_MISMATCH: set[str] = set()


def build(offline: bool) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    arena = load_arena(offline)
    printed = load_printed_pt(offline)
    oracle = load_oracle(offline)
    ITALIC_WORDS.update(load_italic_words(offline))

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
        # (algumas impressões em PT do Scryfall vêm só com a imagem, sem nome, tipo nem
        # texto: aí não há tradução, e a carta não pode passar por "impresso")
        elif p and printed_has_text(p):
            source, faces = "impresso", printed_faces(p)
            text_print = {"set": p["_text"]["set"], "number": p["_text"]["collector_number"]}
        else:
            source, faces, text_print = None, [], None
        stats[source or "sem"] += 1
        # planeswalker: o motor casa cada parágrafo em PT com uma faixa da carta
        if "Planeswalker" in card.get("type_line", "") and card.get("layout") == "normal" and faces:
            text_pt = pw_costs(card.get("oracle_text"), faces[0].get("text_pt"))
            if text_pt is None:
                PW_MISMATCH.add(oid)
            else:
                faces[0]["text_pt"] = text_pt

        for i, f in enumerate(faces):
            aw = ability_word_lines(faces_en[min(i, len(faces_en) - 1)].get("oracle_text"), f.get("text_pt"))
            if aw:
                f["ability_words"] = aw

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
                "search_en": " | ".join(sorted({norm(name), norm(front_name)})),
                "search_pt": " | ".join(sorted(aliases)) or None,
                "source": source,
                "text_print": text_print,
                "_flavor_ref": a["flavor_en"] if source == "arena" else None,
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


EMBLEM_TEXT = (
    # o emblema fecha a linha
    re.compile(r'emblema com:? [“"](.+)[”"]\.?\s*$'),
    # depois do emblema vem outra frase ("… lute contra a criatura alvo." Depois, coloque…, Kiora)
    re.compile(r'emblema com:? [“"]([^“”"]+)[”"]\.?\s+(?=[A-ZÀ-Ú])'),
    # as aspas nunca fecham (Jaya Ballard, no texto impresso)
    re.compile(r'emblema com:? [“"]([^“”"]+)$'),
)


def emblem_text(line: str) -> str | None:
    """O texto entre aspas de "Você recebe um emblema com "…"" numa linha de texto em PT."""
    for rx in EMBLEM_TEXT:
        if m := rx.search(line):
            return m.group(1)
    return None


def emblem_face(t: dict, cards: dict[str, dict], print_oracle: dict[str, str]) -> dict | None:
    """Emblema em PT a partir do planeswalker (ou carta) que o cria, nunca por tradução.

    O texto do emblema é o trecho entre aspas de "Você recebe um emblema com "…"" no texto
    oficial da carta de origem; o nome na faixa é o nome dela, como no emblema impresso.
    """
    for part in t.get("all_parts") or []:
        src = cards.get(print_oracle.get(part["id"], ""))
        if not src or not src.get("name_pt"):
            continue
        for f in src["faces"]:
            found = [e for line in (f.get("text_pt") or "").split("\n") if (e := emblem_text(line))]
            if len(found) != 1:
                continue
            sub = (f.get("type_pt") or "").partition(" — ")[2]
            # emblema com duas habilidades: "…" e "…" vira uma por linha; o ponto final fica fora das aspas no PT
            lines = [x.strip() for x in re.split(r'[”"] e [“"]', found[0])]
            text_pt = "\n".join(x if x[-1:] in '.!?"”’' else f"{x}." for x in lines)
            return {
                "source": src.get("source"),
                "name_en": t["name"],
                "name_pt": f["name_pt"],
                "type_pt": f"Emblema — {sub}" if " — " in t.get("type_line", "") and sub else "Emblema",
                "text_pt": text_pt,
                "flavor_pt": None,
                "mana_cost": None,
            }
    return None


def token_rows(cards: list[dict], print_oracle: dict[str, str]) -> list[dict]:
    """Uma linha em `cards` para cada ficha ou emblema, com o texto em PT quando existe."""
    arena = load_arena_tokens()
    by_oid = {c["oracle_id"]: c for c in cards}
    rows = []
    matched = 0
    for oid, t in TOKENS.items():
        if t.get("layout") == "emblem":
            e = emblem_face(t, by_oid, print_oracle)
            a = {**e, "print": None} if e else None
        else:
            a = arena.get(token_key(t["name"], t.get("power"), t.get("toughness"), t.get("oracle_text") or "", t.get("type_line")))
        matched += bool(a)
        face = (
            {k: v for k, v in a.items() if k not in ("print", "source")}
            if a
            else {"name_en": t["name"], "name_pt": None, "type_pt": None, "text_pt": None, "flavor_pt": None, "mana_cost": None}
        )
        # para a pessoa distinguir fichas de mesmo nome (Espírito 1/1 branco, Espírito 1/1 incolor…)
        face["pt"] = f"{t['power']}/{t['toughness']}" if t.get("power") is not None else None
        face["colors"] = "".join(t.get("colors") or [])
        aw = ability_word_lines(t.get("oracle_text"), face.get("text_pt"))
        if aw:
            face["ability_words"] = aw
        rows.append(
            {
                "oracle_id": oid,
                "name_en": t["name"],
                # emblema: "Emblema — Chandra, Tocha da Rebeldia" na lista e na busca
                "name_pt": (f"Emblema — {a['name_pt']}" if t.get("layout") == "emblem" else a["name_pt"]) if a else None,
                "search_en": norm(t["name"]),
                "search_pt": norm(f"emblema {a['name_pt']}" if t.get("layout") == "emblem" else a["name_pt"]) if a else None,
                "source": a.get("source", "arena") if a else None,
                "text_print": a["print"] if a else None,
                "faces": [face],
                "pt_print": None,
                "layout": "token",
                "type_line": t.get("type_line"),
                "edhrec_rank": None,
                "commander": False,
                "tokens": None,
            }
        )
    n_emb = sum(1 for t in TOKENS.values() if t.get("layout") == "emblem")
    log(f"fichas e emblemas: {len(rows)} (emblemas: {n_emb}) | com texto em PT: {matched}")
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


PRINT_COLUMNS = ["id", "oracle_id", "set_code", "set_name", "number", "released", "artist", "frame", "effects", "border", "layout", "highres", "promo", "mana_cost", "has_pt", "two_sided", "supported", "sides", "text_flavor"]

COLUMNS = ["oracle_id", "name_en", "name_pt", "search_en", "search_pt", "source", "text_print", "faces", "pt_print", "layout", "type_line", "edhrec_rank", "commander", "tokens"]


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
    all_prints = load_prints(args.offline)
    # fichas que cada carta cria, pelo oracle_id da ficha
    print_oracle = {p["id"]: p["oracle_id"] for p in all_prints}
    token_oids = set(TOKENS)
    tokens = token_rows(rows, print_oracle)
    for r in rows:
        ids: set[str] = set()
        for i in TOKEN_PARTS.get(r["oracle_id"], ()):
            if i in DFT_FACES:
                ids.update(DFT_FACES[i])  # ficha de duas faces: as duas fichas
            elif print_oracle.get(i) in token_oids:
                ids.add(print_oracle[i])
        r["tokens"] = sorted(ids) or None
    rows += tokens
    known = {r["oracle_id"] for r in rows}
    prints = [p for p in all_prints if p["oracle_id"] in known]
    for p in prints:
        if p["oracle_id"] in PW_MISMATCH:
            p["supported"] = False
    log(f"planeswalkers com habilidades que não batem (saem como estão): {len(PW_MISMATCH)}")
    log(f"artes com o flavor da impressão do texto em PT: {mark_text_flavor(rows, prints, FLAVORS)}")
    write(rows, prints)


if __name__ == "__main__":
    main()
