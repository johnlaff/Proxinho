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
from collections import Counter
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
    SOS). Nomes como "Cura++" (Final Fantasy) ficam como estão.

    E o ponto no meio da frase, antes de palavra minúscula, onde a pontuação é outra: depois
    do bônus não há nenhuma ("recebe +1/+1. por cada", Destino do Avatar), entre custos é
    vírgula ("{T}. sacrifique", Jan Jansen) e antes de "e depois" também ("use dobra de terra
    1. e depois", Agentes Dai Li). Ponto antes de minúscula em outro lugar (frase que começa
    com minúscula, siglas como "S.H.I.E.L.D.") fica: corrigir pede mudar letra, não pontuação."""
    text = re.sub(r"([+-](?:\d+|X))/\+\+(\d+|X)\b", r"\1/+\2", text)
    low = "a-záéíóúâêôãõçà"
    text = re.sub(rf"([+-](?:\d+|X)/[+-](?:\d+|X))\. (?=[{low}])", r"\1 ", text)
    text = re.sub(rf"(\{{o[^}}]+\}})\. (?=[{low}])", r"\1, ", text)
    return re.sub(r"(?<=\w)\. (?=e (?:depois|então) )", ", ", text)


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


_STATION_LEVEL = re.compile(r"STATIONLEVEL \[(\d+\+)\]")


def station_level(en_text: str | None) -> str | None:
    """O nível de um marcador de Posicionar (Station) do Arena ("STATIONLEVEL [9+] [3/4] [Flying]…" → "9+").

    Em PT o marcador é "#StationLevelInstrinsic_NoTranslation" e sai do texto; as habilidades
    que vêm depois dele, até o próximo marcador, são as do nível.
    """
    m = _STATION_LEVEL.match(en_text or "")
    return m.group(1) if m else None


def join_station(groups: list[tuple[str | None, list[str]]]) -> list[str]:
    """Junta as palavras-chave de cada nível de Posicionar à parte e marca o começo de cada nível
    como o Oracle ("9+ | Voar, iniciativa"). Sem isso, o "Posicionar" e as palavras-chave do
    nível viravam uma linha só ("Posicionar, voar, iniciativa", Nave-aríete Cuneilux)."""
    out: list[str] = []
    for level, lines in groups:
        joined = join_keywords(lines)
        if level is not None and joined:
            joined[0] = f"{level} | {joined[0]}"
        out += joined
    return out


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


# cartas do Arena cuja versão mais nova não tem flavor e ficaram com o da anterior
KEPT_FLAVOR: set[str] = set()
# o flavor de cada versão do Arena (não só da que dá o texto): {nome em inglês: [{print, en, pt}]}
ARENA_FLAVORS: dict[str, list[dict]] = {}


def keep_earlier_flavor(entry: dict, prev: dict | None) -> bool:
    """Versão nova do Arena sem flavor: fica com o flavor (e a impressão dele) da anterior.

    O texto de regras vem sempre da versão mais nova. O flavor é de uma impressão, e só sai
    nas artes com o mesmo flavor em inglês (`mark_text_flavor`), então a impressão de
    referência passa a ser a da versão que tem o flavor.
    """
    if not prev or len(prev["faces"]) != len(entry["faces"]):
        return False
    if any(f["flavor_pt"] for f in entry["faces"]) or not any(f["flavor_pt"] for f in prev["faces"]):
        return False
    for f, pf in zip(entry["faces"], prev["faces"]):
        f["flavor_pt"] = pf["flavor_pt"]
    entry["print"], entry["flavor_en"] = prev["print"], prev["flavor_en"]
    return True


def is_arena_marker(value: str) -> bool:
    """Texto interno do Arena, que não está na carta: os marcadores ("#NoTranslationNeeded",
    "#StationLevelInstrinsic_NoTranslation"…) e o modelo de nível das Classes ("CLASSLEVEL [3]
    […]", que repetia a habilidade do nível 3 na Classe: Ladino)."""
    return bool(re.fullmatch(r"#\S+", value)) or value.startswith("CLASSLEVEL ")


def load_arena(offline: bool) -> dict[str, dict]:
    """Devolve {nome em inglês: face(s) com texto em PT-BR} a partir do Arena."""
    cards = json.loads(fetch(UNTAPPED + "cards.json", CACHE / "arena_cards.json", offline).read_text())
    br = {i["id"]: i["text"] for i in json.loads(fetch(UNTAPPED + "loc_br.json", CACHE / "arena_loc_br.json", offline).read_text())}
    en = {i["id"]: i["text"] for i in json.loads(fetch(UNTAPPED + "loc_en.json", CACHE / "arena_loc_en.json", offline).read_text())}

    def text(table: dict[int, str], key: int | None) -> str | None:
        value = table.get(key) if key is not None else None
        if not value or is_arena_marker(value):
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
        # cada nível de Posicionar começa num marcador (ver station_level)
        groups: list[tuple[str | None, list[str]]] = [(None, [])]
        for a in card.get("abilities", []):
            if level := station_level(en.get(a.get("TextId"))):
                groups.append((level, []))
            elif (t := text(br, a.get("TextId"))) and not is_intrinsic_mana(type_en, sub_en, en.get(a.get("TextId"))):
                groups[-1][1].append(arena_symbols(t))
        return {
            "name_pt": name_pt,
            "type_pt": type_pt,
            "text_pt": clean_rules("\n".join(join_station(groups))),
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
        where = {"set": (card.get("set") or "").lower(), "number": str(card.get("collectorNumber") or "")}
        # cada versão guarda o próprio flavor: outra arte de papel com o mesmo flavor em inglês
        # leva o dele (Birds of Paradise BLC 81, a fala da Ms. Bumbleflower; o texto vem da LTC 235)
        if any(f["flavor_pt"] for f in faces):
            ARENA_FLAVORS.setdefault(name_en, []).append({"print": where, "en": flavor_en, "pt": tuple(f["flavor_pt"] for f in faces)})
        # a versão mais nova pode ser uma variante sem flavor (Itzquinth, LCI 331): o texto vem
        # dela, e o flavor (com a impressão dele) continua o da versão anterior
        entry = {"faces": faces, "print": where, "flavor_en": flavor_en}
        if keep_earlier_flavor(entry, result.get(name_en)):
            KEPT_FLAVOR.add(name_en)
        result[name_en] = entry
    log(f"Arena: {len(result)} cartas com texto PT-BR | flavor da versão anterior: {len(KEPT_FLAVOR)}")
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


# A imagem que o Scryfall não tem: no lugar dela, a carta em inglês com o selo "Localized Image
# Not Available" (9.819 das impressões em PT, quase todas de 1995 a 2001).
NO_IMAGE = {"placeholder", "missing"}


def real_image(card: dict) -> bool:
    return card.get("image_status") not in NO_IMAGE


def pick_printed(cards) -> dict[str, dict]:
    """
    Escolhe, por carta, a impressão em PT da imagem (com imagem de verdade, depois alta
    resolução, depois a mais nova) e guarda em `_text` a do texto: a mais nova. O texto das
    impressões antigas segue regras velhas ("Coloque em jogo uma ficha", "reserva de mana"),
    e a alta resolução quase sempre é de uma coleção antiga, escaneada. A impressão sem
    imagem ainda serve pelo nome impresso, mas não vira "imagem oficial em PT" (`real_image`).
    """
    best: dict[str, dict] = {}
    newest: dict[str, dict] = {}
    for card in cards:
        oid = card.get("oracle_id") or (card.get("card_faces") or [{}])[0].get("oracle_id")
        if not oid:
            continue
        score = (real_image(card), card.get("highres_image", False), card.get("released_at", ""))
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


# capítulo de Saga no Oracle: "I — …", "I, II — …"
_CHAPTER = re.compile(r"^((?:[IVX]+)(?:, [IVX]+)*) — (.+)$")


def saga_chapters(oracle_text: str | None, text_pt: str | None) -> str | None:
    """
    Texto de Saga com o número de cada capítulo na frente ("I — …", "I, II — …"), como na
    carta impressa: o motor põe cada capítulo na faixa dele (src/engine/saga.ts). O Arena traz
    um parágrafo por capítulo, sem o número, e repete o texto dos capítulos agrupados (o Long
    List of the Ents tem o mesmo parágrafo seis vezes); o número e os grupos vêm do Oracle, pela
    ordem (o travessão solto na frente de um capítulo sai). As linhas que não são capítulo
    ("Ler adiante", a palavra-chave das criaturas Saga) ficam onde o Oracle as põe. O lembrete
    do Oracle ("(As this Saga enters…)") não está no Arena e entra depois, pelo texto das Sagas
    impressas em PT (ver `top_reminder`). Devolve None quando as
    linhas não batem, ou quando os parágrafos de um mesmo grupo diferem.
    """
    en = [x.strip() for x in (oracle_text or "").split("\n") if x.strip() and not x.strip().startswith("(")]
    pt = [x.strip() for x in (text_pt or "").split("\n") if x.strip()]
    plan = [m.group(1) if (m := _CHAPTER.match(x)) else None for x in en]
    if not any(plan):
        return None
    sizes = [len(g.split(", ")) if g else 1 for g in plan]
    if len(pt) == sum(sizes):
        take = sizes
    elif len(pt) == len(plan):
        take = [1] * len(plan)
    else:
        return None
    out: list[str] = []
    j = 0
    for group, n in zip(plan, take):
        # alguns capítulos vêm do Arena com o travessão do número na frente ("— Procure…" no
        # Roads Go Ever, Ever On): sai só o travessão, o número já vem do Oracle
        part = [re.sub(r"^—\s*", "", x) if group else x for x in pt[j : j + n]]
        j += n
        if len(set(part)) != 1:
            return None
        out.append(f"{group} — {part[0]}" if group else part[0])
    return "\n".join(out)


# lembrete do alto das Sagas e das Classes no Oracle: "(As this Saga enters…)", "Read ahead (Choose…)",
# "(Gain the next level as a sorcery to add its ability.)"
_TOP_REMINDER = re.compile(r"^(?:Read ahead )?\(.+\)$")


def top_reminders(printed: dict[str, dict]) -> dict[str, str]:
    """
    O lembrete do alto das Sagas e das Classes em PT, pelo lembrete em inglês do Oracle, tirado
    das cartas impressas em português (o texto oficial: "(Conforme esta Saga entra e após sua
    etapa de compra, adicione um marcador de conhecimento. Sacrifique-a após III.)", "(Ganhe o
    próximo nível como um feitiço para adicionar sua habilidade.)"). O Arena não traz o lembrete
    nem a explicação do "Adiantar leitura", e sem eles o alto da carta ficava vazio (Urza's Saga,
    Book of Mazarbul, Classe: Mago). Fica o texto mais comum de cada lembrete em inglês; só
    lembrete idêntico ao de uma carta impressa, nunca montado.
    """
    votes: dict[str, dict[str, int]] = {}
    for card in printed.values():
        card = card.get("_text", card)
        for f in card.get("card_faces") or [card]:
            type_line = f.get("type_line") or card.get("type_line") or ""
            if "Saga" not in type_line and "Class" not in type_line:
                continue
            en = (f.get("oracle_text") or "").split("\n")[0].strip()
            pt = (clean_rules(fix_breaks(drop_level_marks(f.get("printed_text")))) or "").split("\n")[0].strip()
            if _TOP_REMINDER.match(en) and _TOP_REMINDER_PT.match(pt) and en.startswith("(") == pt.startswith("("):
                votes.setdefault(en, {})
                votes[en][pt] = votes[en].get(pt, 0) + 1
    return {en: max(c.items(), key=lambda kv: (kv[1], kv[0]))[0] for en, c in votes.items()}


# o lembrete em PT: a frase inteira entre parênteses, ou a palavra-chave e a explicação dela
_TOP_REMINDER_PT = re.compile(r"^[^()]*\([^()]+\)$")


def top_reminder(oracle_text: str | None, text_pt: str | None, reminders: dict[str, str]) -> str | None:
    """
    Põe no alto do texto do Arena o lembrete oficial em PT da primeira linha do Oracle (ver
    `top_reminders`), como na carta impressa: o "(Conforme esta Saga entra…)" vai antes dos
    capítulos (já numerados, ver `saga_chapters`), o "(Ganhe o próximo nível…)" antes da
    habilidade do nível 1 da Classe, e o "Adiantar leitura" sozinho ganha a explicação dele. Sem
    lembrete conhecido, o texto fica como está.
    """
    if text_pt is None:
        return None
    en = (oracle_text or "").split("\n")[0].strip()
    pt = reminders.get(en)
    if not pt:
        return text_pt
    lines = text_pt.split("\n")
    if en.startswith("("):
        return text_pt if lines[0].startswith("(") else "\n".join([pt, *lines])
    # "Read ahead": a palavra-chave do Arena tem de ser a mesma da carta impressa
    if lines[0].strip() == pt.split(" (")[0].strip():
        return "\n".join([pt, *lines[1:]])
    return text_pt


# lembrete entre parênteses no fim de uma linha do Oracle ("Amass Orcs 1. (Put a +1/+1 counter…)")
_LINE_REMINDER = re.compile(r"^([^()]*)\(([^()]+)\)$")
# números, P/R e símbolos: os dois idiomas têm de trazer os mesmos, no lembrete e no resto da linha
_REMINDER_MARKS = re.compile(r"\{[^}]+\}|[+-]?\d+(?:/[+-]?\d+)?")
# a terminologia atual em PT ("conjurar", "exilar") vem do Magic 2010: antes, "jogar" e "remova do jogo"
_REMINDER_SINCE = "2009-07-17"
# o lembrete fala da carta por "ela" ou "ele" conforme o tipo (a criatura, o artefato, a mágica)
_TYPE_GROUPS = (("Creature", "criatura"), ("Planeswalker", "planeswalker"), ("Battle", "batalha"), ("Land", "terreno"), ("Artifact", "artefato"), ("Enchantment", "encantamento"), ("Instant", "mágica"), ("Sorcery", "mágica"))


def type_group(type_line: str | None) -> str:
    """O grupo do tipo da face, pelo gênero da palavra em PT ("Artifact Creature" é criatura)."""
    types = (type_line or "").split("—")[0].split()
    return next((g for t, g in _TYPE_GROUPS if t in types), "outro")


def line_reminder(line: str) -> tuple[str, str] | None:
    """O começo da linha e o lembrete do fim dela, quando a linha tem um lembrete só, no fim."""
    m = _LINE_REMINDER.match(line.strip())
    return (m.group(1).strip(), m.group(2)) if m and m.group(1).strip() else None


def same_marks(a: str, b: str) -> bool:
    return sorted(_REMINDER_MARKS.findall(a)) == sorted(_REMINDER_MARKS.findall(b))


def ends_like(en: str, pt: str) -> bool:
    """
    O lembrete impresso termina como o do Oracle (com ponto final ou sem) e não começa com a
    letra repetida: o texto do Scryfall tem erros de digitação ("P Para triturar um card…",
    sem o ponto, no Inverted Iceberg de LCI), e um lembrete errado passava para as outras cartas.
    """
    period = lambda x: "." in x.rstrip()[-2:]  # noqa: E731
    return period(en) == period(pt) and not re.match(r"^(\w) \1\w", pt)


def _sentences(text: str) -> int:
    return len(re.findall(r"[.!?](?:\s|$)", re.sub(r'["“”]', "", text.strip())))


def says_all(en: str, pt: str) -> bool:
    """
    O lembrete impresso diz tudo o que o do Oracle diz: o Oracle muda o lembrete com o tempo e a
    carta impressa fica com o antigo. Com menos frases pode faltar uma regra ("It's also a
    Zombie." no arregimentar de WAR), e com quase o dobro do tamanho é outro texto (o atropelar
    dos Fractius da M14, que ia para as cartas com atropelar; o toque mortífero antigo, "Você
    pode dividir o dano de combate…"). A própria carta fica com o da impressão dela, que é o da
    carta física; só as outras deixam de recebê-lo (ver `reminder_texts`).
    """
    return _sentences(pt) >= _sentences(en) and len(pt) <= 1.85 * len(en)


def printed_reminders(oracle_text: str | None, printed_text: str | None) -> list[tuple[str, str]]:
    """
    Os pares (lembrete do Oracle, lembrete impresso em PT) de uma face, linha a linha: as duas
    têm o mesmo número de linhas, e em cada par as duas linhas acabam num lembrete só, com os
    mesmos números e símbolos no lembrete e no resto da linha. Lembrete igual ao do Oracle não é
    tradução: o Scryfall tem impressões em PT com linhas em inglês (Chimil, the Inner Sun, LCI
    249), e o lembrete em inglês ia para as outras cartas com a palavra (U.S.S. Discovery, TRK).
    """
    en = [x.strip() for x in (oracle_text or "").split("\n") if x.strip()]
    pt = [x.strip() for x in (clean_rules(fix_breaks(printed_text)) or "").split("\n") if x.strip()]
    if not en or len(en) != len(pt):
        return []
    pairs = []
    for e, p in zip(en, pt):
        a, b = line_reminder(e), line_reminder(p)
        if a and b and a[1] != b[1] and same_marks(a[0], b[0]) and same_marks(a[1], b[1]) and ends_like(a[1], b[1]):
            pairs.append((a[1], b[1]))
    return pairs


def reminder_texts(prints, oracle: dict[str, dict]) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    """
    Os lembretes de palavra-chave em PT, pelo lembrete em inglês do Oracle, tirados das
    impressões em português desde o Magic 2010 (todas, não só a mais nova de cada carta; ver
    `printed_reminders`). O Arena não traz os lembretes, e a carta física traz (o "Arregimentar
    Orcs 1." do Book of Mazarbul sem a explicação). Devolve dois mapas, lembrete em inglês →
    texto em PT: por grupo de tipo (`type_group`, porque o lembrete diz "ela" da criatura e
    "ele" do artefato; "*" junta todos) e por carta (`oracle_id`, o texto impresso da própria
    carta, que ganha dos outros). Em cada um fica a impressão mais nova. Só lembrete idêntico
    ao de uma carta impressa, nunca montado.
    """
    by_group: dict[str, dict[str, tuple[str, str]]] = {}
    by_card: dict[str, dict[str, tuple[str, str]]] = {}
    for card in prints:
        released = card.get("released_at") or ""
        if released < _REMINDER_SINCE:
            continue
        oid = card.get("oracle_id") or (card.get("card_faces") or [{}])[0].get("oracle_id")
        o = oracle.get(oid)
        if not o:
            continue
        faces, faces_en = card.get("card_faces") or [card], o.get("card_faces") or [o]
        if len(faces) != len(faces_en):
            continue
        for f, g in zip(faces, faces_en):
            group = type_group(g.get("type_line") or o.get("type_line"))
            for en, pt in printed_reminders(g.get("oracle_text"), f.get("printed_text")):
                # a própria carta fica com o que a impressão dela diz; as outras, só com o que diz tudo
                tables = [by_card.setdefault(oid, {})]
                if says_all(en, pt):
                    tables += [by_group.setdefault(group, {}), by_group.setdefault("*", {})]
                for table in tables:
                    if en not in table or (released, pt) > table[en]:
                        table[en] = (released, pt)
    flat = lambda tables: {k: {en: pt for en, (_, pt) in t.items()} for k, t in tables.items()}  # noqa: E731
    return flat(by_group), flat(by_card)


# As dicas das palavras-chave do Arena (o texto que o jogo mostra ao lado da carta), do banco da
# interface do Arena instalado do João (`Raw_ClientLocalization_*.mtga`, tabela Loc), com o ok
# dele em 20/11/2026 (ADR 0021). O banco fica fora do repositório: `--dicas` grava só as dicas
# em data/cache, e a cópia fica no KV do Proxinho (ver docs/operacao.md).
ARENA_HINTS = CACHE / "arena_dicas.json"
# dicas que dizem o mesmo que o lembrete em inglês, mas com a tradução errada no Arena: ficam de fora
HINT_SKIP: dict[str, str] = {
    "AbilityHanger/Keyword/Enweb_Body": 'sem o "virada" de "return a tapped creature"',
    "AbilityHanger/Keyword/Web-Slinging_Body": 'sem o "virada" de "return a tapped creature"',
    "AbilityHanger/Keyword/Mayhem_Body_Land": '"conjurar" para o terreno, que se joga ("play")',
}
# o lembrete fala da própria carta quando o resto da linha é ela ("This creature enters prepared.")
_SELF_PHRASE = r"this (?:creature|card|permanent|artifact|enchantment|land|spell|vehicle|spacecraft|planet|equipment|saga)"
# e não fala dela quando a linha cita outra coisa ("target creature", "equipped creature", a ficha)
_OTHER_THING = re.compile(r"\b(?:target|token|tokens|equipped|enchanted|another|other|that|those|each|all|a|an|the)\b", re.IGNORECASE)
# palavras, números, "+" e símbolos; a variável da dica é um nome entre chaves ("{chargeRequirement}")
_HINT_TOKEN = re.compile(r"\{[^}]+\}|[\w'’]+|\+")
_HINT_VAR = re.compile(r"^\{[a-z][A-Za-z]+\}$")
# variáveis de custo ("{abilityCost}", "{mana}") viram símbolos de mana; as outras, um número
_HINT_COST_VARS = {"{abilitycost}", "{mana}"}
# jeitos de a explicação falar da própria carta: trocar um pelo outro não muda o sentido
# ("Exile this creature" na carta e "Exile it" na dica do Warp; "his" e "its" no Power-up)
_HINT_SELF = {
    "it", "its", "this", "he", "his", "him", "she", "her",
    *(f"this {t}" for t in ("creature", "card", "permanent", "artifact", "enchantment", "land", "spell", "vehicle", "spacecraft", "planet")),
}
_SYMBOL = re.compile(r"^\{[^}]+\}$")


def extract_hints(mtga: Path) -> list[dict[str, str]]:
    """As dicas das palavras-chave (chave, inglês e português) do banco da interface do Arena."""
    import sqlite3

    con = sqlite3.connect(f"file:{mtga}?mode=ro", uri=True)
    try:
        rows = con.execute("SELECT Key, enUS, ptBR FROM Loc WHERE Key LIKE 'AbilityHanger/%' ORDER BY Key").fetchall()
    finally:
        con.close()
    return [{"key": k, "en": en, "pt": pt} for k, en, pt in rows if en and pt]


def load_hints() -> list[dict[str, str]]:
    if not ARENA_HINTS.exists():
        log(f"sem {ARENA_HINTS.name}: as explicações das palavras-chave nunca impressas em PT ficam de fora (ver docs/operacao.md)")
        return []
    return json.loads(ARENA_HINTS.read_text())


def refers_to_self(prefix: str, name: str) -> bool:
    """
    O "it" do lembrete é a própria carta: a linha é só a palavra-chave ("Wither", "Flying,
    wither", "Firebending 2") ou acaba com a carta fazendo algo ("This creature enters prepared.",
    "Tam becomes prepared.", "if this creature isn't prepared, it becomes prepared."). Sem isso o
    "it" pode ser outra coisa (a ficha do Stalactite Dagger, a criatura equipada do Aegis of the
    Legion), e a dica que fala "esta criatura" diria outra coisa que a carta.
    """
    text = prefix.strip().rstrip(".")
    parts = [p.strip() for p in text.split(",")]
    if all(re.fullmatch(r"[A-Za-z][\w'’-]*(?: [\w'’-]+){0,2}(?: \d+| X)?", p) for p in parts) and parts[0][:1].isupper() and not _OTHER_THING.search(text):
        return True
    names = {name, name.split(",")[0]}
    last = re.split(r"[.,;:—]\s*", text)[-1].strip()
    subject = re.match(rf"(?:{_SELF_PHRASE}|{'|'.join(map(re.escape, names))}|it)\b", last, re.IGNORECASE)
    if not subject:
        return False
    return subject.group(0).lower() != "it" or (bool(re.search(_SELF_PHRASE, text, re.IGNORECASE)) and not re.search(r"\b(?:target|token|equipped|enchanted|another|that)\b", text, re.IGNORECASE))


def hint_text(text: str) -> str:
    """Os símbolos do Arena na dica ("{o2}", e "o2" solto na do Cloak) como os do Oracle ("{2}")."""
    return re.sub(r"(?<![\w{])o(\d+|X)\b", r"{\1}", arena_symbols(text))


def _hint_words(text: str) -> list[str]:
    # "it's" é "it is", para "it's prepared" casar com "this is prepared" (Prepare, SOS)
    return [w for t in _HINT_TOKEN.findall(text) for w in (["it", "is"] if t.lower() in {"it's", "it’s"} else [t if t.startswith("{") else t.lower()])]


def _hint_fill_ordered(rem: list[str], hint: list[str], own: bool) -> dict[str, str] | None:
    """
    As variáveis da dica, alinhando as duas na mesma ordem: fora delas, só o jeito de falar da
    própria carta (`_HINT_SELF`) e a palavra "token" podem mudar ("create a 1/1 token copy" na
    carta, "create a 1/1 copy" na dica do Offspring: o que se cria é sempre uma ficha). O "it"
    da carta só vira "esta criatura" da dica quando é a própria carta (`own`, `refers_to_self`).
    """
    import difflib

    values: dict[str, str] = {}
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, rem, hint, autojunk=False).get_opcodes():
        a, b = rem[i1:i2], hint[j1:j2]
        if tag == "equal":
            continue
        if len(b) == 1 and _HINT_VAR.match(b[0]):
            cost = b[0].lower() in _HINT_COST_VARS
            if not a or not all(_SYMBOL.match(t) if cost else t.isdigit() for t in a) or (not cost and len(a) > 1):
                return None
            if values.setdefault(b[0], "".join(a)) != "".join(a):
                return None
        elif a and b and {" ".join(a), " ".join(b)} <= _HINT_SELF and (own or " ".join(a) not in {"it", "its"}):
            continue
        elif (not a and b == ["token"]) or (not b and a == ["token"]):
            continue
        else:
            return None
    return values


def _hint_fill_bag(rem: list[str], hint: list[str]) -> dict[str, str] | None:
    """
    As variáveis da dica com as mesmas palavras do lembrete em outra ordem ("Put charge
    counters on this Spacecraft equal to its power" contra "Put charge counters equal to its
    power on this Spacecraft" na carta): o que sobra do lembrete é um número só, de cada variável.
    """
    names = [t for t in hint if _HINT_VAR.match(t)]
    left = Counter(rem)
    left.subtract(t for t in hint if not _HINT_VAR.match(t))
    if any(n < 0 for n in left.values()):
        return None
    rest = [t for t, n in left.items() for _ in range(n)]
    if len(rest) != len(names) or not all(t.isdigit() for t in rest) or len(set(rest)) > 1:
        return None
    return {name: rest[0] for name in names}


def hint_reminder(reminder: str, en: str, pt: str, own: bool = False) -> str | None:
    """
    O lembrete em PT de um lembrete do Oracle, pela dica do Arena que diz o mesmo em inglês (ver
    `_hint_fill_ordered` e `_hint_fill_bag`): cada variável da dica ("{abilityCost}",
    "{chargeRequirement}") recebe o custo ou o número do lembrete, na dica em PT. Dica que
    começa por "To manifest dread," vale para o lembrete sem esse começo, e a dica em PT perde o
    "Para Manifestar Pavor," dela. A dica não tem o ponto final do lembrete: ele volta. Dica em
    PT igual à em inglês não está traduzida (DiscoverN). Sem dizer o mesmo, nada. O ")" a mais no
    fim da dica em PT do Ninjutsu ("virado e atacando.).") sai.
    """
    en, pt = hint_text(en), hint_text(pt)
    if pt.count(")") > pt.count("("):
        pt = re.sub(r"\)+\.?$", "", pt.rstrip())
    if pt.strip() == en.strip():
        return None
    rem = _hint_words(reminder)
    variants = [(en, pt)]
    lead_en, lead_pt = re.match(r"To [^,.]+, (\w)", en), re.match(r"Para [^,.]+, (\w)", pt)
    if lead_en and lead_pt:
        variants.append((lead_en.group(1).upper() + en[lead_en.end() :], lead_pt.group(1).upper() + pt[lead_pt.end() :]))
    for e, p in variants:
        hint = _hint_words(e)
        values = _hint_fill_ordered(rem, hint, own)
        if values is None:
            values = _hint_fill_bag(rem, hint)
        if values is None:
            continue
        for name, value in values.items():
            p = re.sub(re.escape(name), value, p, flags=re.IGNORECASE)
        if any(_HINT_VAR.match(t) for t in _HINT_TOKEN.findall(p)):
            continue
        if reminder.rstrip().endswith(".") and not p.rstrip().endswith("."):
            p = p.rstrip() + "."
        if same_marks(reminder, p):
            return p
    return None


def arena_reminders(oracle, hints: list[dict[str, str]], known: set[str], skip: dict[str, str] = HINT_SKIP) -> dict[str, dict[str, str]]:
    """
    Por carta (`oracle_id`), os lembretes do Oracle (em inglês) que ganham o texto em PT de uma
    dica do Arena (ver `hint_reminder`), só onde nenhuma carta impressa em PT traz o lembrete
    (`known`): o impresso ganha. Por carta porque o mesmo lembrete pode falar da própria carta
    numa e de outra coisa noutra (`refers_to_self`). A explicação do Posicionar nunca saiu
    impressa, e sem ela a faixa do alto das naves ficava com "Posicionar" sozinho, diferente da
    carta física. As dicas de `skip` têm a tradução errada no Arena e ficam de fora.
    """
    chosen = [(h, set(_hint_words(hint_text(h["en"])))) for h in hints if h["key"] not in skip]
    memo: dict[tuple[str, bool], str | None] = {}
    out: dict[str, dict[str, str]] = {}
    for card in oracle:
        oid = card.get("oracle_id") or (card.get("card_faces") or [{}])[0].get("oracle_id")
        for f in card.get("card_faces") or [card]:
            for line in (f.get("oracle_text") or "").split("\n"):
                found = line_reminder(line)
                if not found or found[1] in known:
                    continue
                key = (found[1], refers_to_self(found[0], f.get("name") or card.get("name", "")))
                if key not in memo:
                    words = set(_hint_words(found[1]))
                    # só as dicas com quase todas as palavras do lembrete passam pela comparação inteira
                    near = (h for h, hw in chosen if len(words & hw) >= 0.6 * max(len(words), len(hw)))
                    memo[key] = next((x for h in near if (x := hint_reminder(found[1], h["en"], h["pt"], key[1]))), None)
                if memo[key]:
                    out.setdefault(oid, {})[found[1]] = memo[key]
    return out


def face_reminders(oid: str, type_line: str | None, by_group: dict[str, dict[str, str]], by_card: dict[str, dict[str, str]]) -> dict[str, str]:
    """Os lembretes para uma face: o da própria carta, senão o do mesmo grupo de tipo, senão qualquer um."""
    return {**by_group.get("*", {}), **by_group.get(type_group(type_line), {}), **by_card.get(oid, {})}


def add_reminders(oracle_text: str | None, text_pt: str | None, reminders: dict[str, str]) -> str | None:
    """
    Põe no fim de cada linha do texto em PT o lembrete oficial da mesma linha do Oracle (ver
    `reminder_texts`), como na carta física: "I — Arregimentar Orcs 1. (Coloque um marcador
    +1/+1…)". As linhas têm de bater uma a uma, com os mesmos números e símbolos antes do
    lembrete; linha com mais de um lembrete, linha que já tem parênteses e lembrete que nunca
    saiu impresso em PT ficam como estão.
    """
    if text_pt is None:
        return None
    en = [x.strip() for x in (oracle_text or "").split("\n") if x.strip()]
    pt = text_pt.split("\n")
    if len(en) != len(pt):
        return text_pt
    out = []
    for e, p in zip(en, pt):
        found = line_reminder(e)
        pt_reminder = reminders.get(found[1]) if found and "(" not in p and same_marks(found[0], p) else None
        out.append(f"{p.rstrip()} ({pt_reminder})" if pt_reminder else p)
    return "\n".join(out)


# Parágrafo que começa com um nome e um travessão, com texto depois na mesma linha
# ("Landfall — Whenever…", "Aterragem — Toda vez…"). O custo de uma palavra-chave
# ("Ward—Pay 2 life") não tem espaço em volta do travessão no Oracle, e "Choose one —"
# não tem texto depois.
_ABILITY_WORD = re.compile(r"^([^—{}:•(\n]{1,40}) — \S")

_CHAPTER_PREFIX = re.compile(r"^(?:[IVX]+)(?:, [IVX]+)* — ")

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
    # (o número do capítulo da Saga não conta: o nome que vem depois dele é que é a palavra)
    en = [m.group(1) for x in (oracle_text or "").split("\n") if (m := _ABILITY_WORD.match(_CHAPTER_PREFIX.sub("", x.strip())))]
    if not en or not text_pt:
        return None
    pt = [i for i, x in enumerate(text_pt.split("\n")) if _ABILITY_WORD.match(_CHAPTER_PREFIX.sub("", x.strip()))]
    if len(pt) != len(en):
        return None
    out = [i for i, prefix in zip(pt, en) if italic_prefix(prefix, italic)]
    return out or None


def drop_level_marks(text: str | None) -> str | None:
    """Tira as linhas "//Level_2//" do texto impresso das Classes: marcação do Scryfall entre a
    barra de nível e a habilidade, que não está na carta."""
    if text is None:
        return None
    return "\n".join(x for x in text.split("\n") if not re.fullmatch(r"//Level_\d+//", x.strip()))


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
                "text_pt": clean_rules(fix_breaks(drop_level_marks(text))),
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


# Secret Lair com a moldura inteira desenhada à mão pelo artista: nome e texto escritos à mão,
# arte dentro da barra do nome e da caixa de texto. O Scryfall marca moldura 2015 sem efeito
# nenhum, e o motor apagava e escrevia nos lugares da M15 (Sol Ring, SLD 2132, saía borrado).
DRAWN_FRAME_ARTISTS = {"Ricardo Cavolo"}

# Secret Lair com adesivos e rabiscos à mão por cima da moldura e do texto (a série do Deadpool de
# 1º de abril de 2026, SLD IFIYW-1 a 10: o nome riscado com o novo escrito à mão, "Bolt" colado
# no texto, "Shroud" e "Zero" por cima das palavras, o Deadpool saindo da arte por cima do tipo e
# da caixa). O Scryfall marca moldura 2015 sem efeito, e o motor apagava a escrita e os desenhos
# junto com o inglês: sobrava um retângulo de papel no lugar do braço dele (Deadly Dispute).
DRAWN_OVER_NUMBERS = ("IFIYW-",)


def drawn_frame(card: dict) -> bool:
    """A moldura da impressão foi desenhada pelo artista (ver DRAWN_FRAME_ARTISTS) ou rabiscada por
    cima (ver DRAWN_OVER_NUMBERS). Do artista, só as de borda preta: a sem borda dele (Xanathar,
    SLD 1785) tem a moldura padrão, com a caixa translúcida."""
    if card.get("set") != "sld":
        return False
    if str(card.get("collector_number") or "").startswith(DRAWN_OVER_NUMBERS):
        return True
    return card.get("artist") in DRAWN_FRAME_ARTISTS and card.get("border_color") == "black"


def frame_supported(card: dict) -> bool:
    """O motor do Proxinho reescreve a moldura moderna (2015+) e a de 2003 a 2014 (ADR 0024),
    de layout normal.

    Outras molduras entram por etapas (docs/roadmap.md). Quando a impressão não é
    suportada, o site mostra a imagem oficial em PT (se houver) ou avisa.
    """
    effects = set(card.get("frame_effects") or [])
    type_line = card.get("type_line", "")
    return (
        (card.get("frame") == "2015" or frame2003_supported(card))
        and card.get("layout") == "normal"
        and card.get("border_color") in {"black", "white"}
        and not card.get("full_art")
        and not art_behind_box(card)
        and not card.get("textless")
        and not drawn_frame(card)
        and not effects & UNSUPPORTED_EFFECTS
        and not any(t in type_line for t in UNSUPPORTED_TYPES_NORMAL)
        # naves e planetas com "Posicionar" têm caixas de nível próprias (2+, 12+)
        and "Station" not in (card.get("keywords") or [])
    )


def frame2003_supported(card: dict) -> bool:
    """Moldura de 2003 a 2014 (ADR 0024): as barras e a caixa ficam quase onde estão na M15, e o
    motor muda só a caixa e a ponta das barras (`frame2003` em `m15Layout`). Só a moldura comum:
    com qualquer efeito (o céu estrelado de Theros, a lápide de Odyssey no canto da caixa, a faixa
    do milagre, as cores trocadas de Planar Chaos) o desenho muda, e os planeswalkers de 2003
    têm caixa própria. E duas coleções de promos (`SETS_2003_OFF`)."""
    return (
        card.get("frame") == "2003"
        and not card.get("frame_effects")
        and "Planeswalker" not in card.get("type_line", "")
        and card.get("watermark") in WATERMARKS_2003_OK
        and card.get("set") not in SETS_2003_OFF
    )


# Promos de 2003 com outro desenho, sem nada que o Scryfall marque: as de Champs and States (PCMP)
# têm a arte atrás do tipo e da caixa de texto, translúcida (o motor desistia das 11: Rakdos
# Guildmage, PCMP 3), e a única de 2003 da Secret Lair, a Viscera Seer espelhada (SLD VS), tem o
# nome, o tipo e o texto da direita para a esquerda (sobravam pedaços do inglês ao contrário).
SETS_2003_OFF = {"pcmp", "sld"}


# Marcas-d'água na moldura de 2003 (ADR 0024): por enquanto só sem nenhuma. As das guildas de Ravnica
# e das facções de Scars of Mirrodin são cinza-claras e sem cor, e o apagamento levava só os pedaços
# que as letras cruzavam: o resto ficava em cacos no papel (Darksteel Relic NPH 134, Peace Strider
# MBS 119). As das promos (FNM, DCI, Junior...) são logotipos grandes e brilhantes no meio da caixa,
# e ficavam manchas claras onde as letras os cruzavam (Elvish Visionary F10 6, Counterspell F05 11).
WATERMARKS_2003_OK = {None}


# efeitos que não mudam o desenho da moldura sem borda padrão: "inverted" (letra clara sobre a
# caixa escura) é o que a marca; coroa de lendária, brilho de encantamento e o círculo das Lições
# não tiram o texto do lugar
BORDERLESS_EFFECTS_OK = {"inverted", "legendary", "enchantment", "lesson"}


def borderless_supported(card: dict) -> bool:
    """Arte sem borda na moldura padrão (2019+): a arte vai até a beira e o texto fica numa caixa
    escura translúcida, nas mesmas posições da moldura comum (src/engine/borderless.ts, ADR 0012).

    Só as de efeito "inverted": as sem ele são molduras próprias (Invocações de Amonkhet, a Mythic
    Edition, várias da Secret Lair). O motor ainda confere a caixa na imagem e, se não achar os fios
    dela ou ela for clara ou de retícula grossa, a arte sai como está.

    A série Drácula de Innistrad: Voto Carmesim (VOW 329 a 345 e o Voldaren Estate, VOW 403) tem a
    barra de tipo uns 60 px mais baixa e a caixa mais curta: com as medidas da padrão, o português
    ficava por baixo da barra de tipo e o símbolo da coleção era apagado. Fica de fora.
    """
    effects = set(card.get("frame_effects") or [])
    type_line = card.get("type_line", "")
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "normal"
        and card.get("border_color") == "borderless"
        and "inverted" in effects
        and effects <= BORDERLESS_EFFECTS_OK
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and not any(t in type_line for t in UNSUPPORTED_TYPES)
        and "Station" not in (card.get("keywords") or [])
        and "draculaseries" not in (card.get("promo_types") or [])
    )


# efeitos que não mudam o desenho da Saga: coroa de lendária (DSK) e o brilho de encantamento
# das bordas (desde TDM)
SAGA_EFFECTS_OK = {"legendary", "enchantment"}


def saga_supported(card: dict) -> bool:
    """Saga na moldura de 2018 em diante: a coluna de texto à esquerda da arte, com uma faixa por
    capítulo (src/engine/saga.ts). O motor mede os fios entre as faixas na imagem e confere que
    batem com os capítulos do texto em PT; se não baterem, a arte sai como está.

    As criaturas Saga (as Invocações de Final Fantasy) têm outra moldura, com o lembrete na
    largura toda e a caixa de P/R embaixo, e ficam de fora, como as Sagas de duas faces, as sem
    borda e as de vitrine (showcase).
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "saga"
        and card.get("border_color") == "black"
        and effects <= SAGA_EFFECTS_OK
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and "Saga" in card.get("type_line", "")
        and "Creature" not in card.get("type_line", "")
    )


def adventure_supported(card: dict) -> bool:
    """Aventura na moldura de livro (Throne of Eldraine em diante; o Presságio de Tarkir:
    Dragonstorm tem as mesmas medidas): a criatura na página da direita, a aventura (nome, tipo
    e regras) na da esquerda (src/engine/adventure.ts). O motor confere a lombada e as barras
    da aventura na imagem; sem elas, a arte sai como está.

    Ficam de fora as de vitrine (showcase), arte estendida, sem borda e as promos com a arte
    atrás da caixa, que têm outro desenho.
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "adventure"
        and card.get("border_color") == "black"
        and effects <= SAGA_EFFECTS_OK
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and not art_behind_box(card)
        and len(card.get("card_faces") or []) == 2
    )


# efeitos que não mudam a caixa das naves: a coroa de lendária e a arte estendida (que já vem
# sem a explicação do "Station", com as faixas mais altas)
STATION_EFFECTS_OK = {"legendary", "extendedart"}


def station_supported(card: dict) -> bool:
    """Naves e planetas com Posicionar na moldura comum (Edge of Eternities em diante): a caixa
    translúcida com uma faixa por nível, o selo do nível à esquerda e o P/R na última
    (src/engine/station.ts). O motor confere os selos na imagem; com outro número de selos, a arte
    sai como está. Ficam de fora as sem borda e as de vitrine.
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "normal"
        and card.get("border_color") == "black"
        and "Station" in (card.get("keywords") or [])
        and effects <= STATION_EFFECTS_OK
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
    )


def class_supported(card: dict) -> bool:
    """Classe na moldura de Adventures in the Forgotten Realms em diante: a arte à esquerda e a
    coluna de texto à direita, com o lembrete no alto e uma barra por nível (src/engine/classCard.ts).
    O motor confere a coluna, o fio do lembrete e as barras na imagem; sem eles, ou com outro
    número de barras, a arte sai como está. Ficam de fora as sem borda (pôster e Secret Lair) e
    as promos com relevo das lojas (o "&" de D&D em alto-relevo atravessa a coluna: as barras que
    mudam de lugar levavam pedaços dele, e o resto ficava pela metade no papel apagado).
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "class"
        and "embossed" not in (card.get("promo_types") or [])
        and card.get("border_color") == "black"
        and effects <= SAGA_EFFECTS_OK
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and "Class" in card.get("type_line", "")
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
        and not drawn_frame(card)
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


def mark_print_flavors(rows: list[dict], prints: list[dict], versions: dict[str, list[dict]]) -> int:
    """O flavor em PT de cada arte que não leva o da impressão do texto: o da versão do Arena com
    o mesmo flavor em inglês (ou da mesma coleção e número, quando o Scryfall não tem o flavor).

    O Arena tem um flavor por versão da carta, e o texto em PT vem de uma só (`text_print`): as
    outras artes ficavam sem flavor mesmo com a tradução oficial no Arena (Birds of Paradise da
    BLC 81 sem a fala da Ms. Bumbleflower, porque o texto vem da LTC 235). Grava `flavor_pt` (um
    por face) só onde muda alguma coisa; na impressão do texto e nas com `text_flavor` o site já
    usa o da carta.
    """
    by_oid = {r["oracle_id"]: r for r in rows}
    n = 0
    for p in prints:
        p["flavor_pt"] = None
        row = by_oid.get(p["oracle_id"])
        # (fichas têm nomes iguais a cartas, "Adorned Pouncer" eternizado: o flavor do Arena é das cartas)
        tokens = {"token", "double_faced_token", "emblem"}
        if not row or p.get("text_flavor") or (p.get("layout") or "") in tokens or (row.get("layout") or "") in tokens:
            continue
        tp = row.get("text_print")
        if tp and (ARENA_SETS.get(tp["set"].lower(), tp["set"].lower()), str(tp["number"])) == (p["set_code"], p["number"]):
            continue
        name = row["name_en"]
        found = versions.get(name) or versions.get(name.split(" // ")[0])
        if not found:
            continue
        mine = p.get("_flavor") or ()
        for v in reversed(found):  # a versão mais nova primeiro
            same_print = (ARENA_SETS.get(v["print"]["set"], v["print"]["set"]), v["print"]["number"]) == (p["set_code"], p["number"])
            if (any(mine) and tuple(v["en"]) == tuple(mine)) or (same_print and not any(mine)):
                if len(v["pt"]) == len(mine) or not any(mine):
                    p["flavor_pt"] = list(v["pt"])
                    n += 1
                    break
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
        "supported": frame_supported(c)
        or borderless_supported(c)
        or token_supported(c)
        or saga_supported(c)
        or adventure_supported(c)
        or class_supported(c)
        or station_supported(c)
        or bool(sides and sides[0]["supported"]),
        "sides": sides,
        # nome de crossover no alto (o nome de jogo vai numa linha pequena abaixo da barra)
        "flavor_name": c.get("flavor_name") or face.get("flavor_name"),
        # indicador de cor das cartas de uma face só (nas de duas faces, em `sides`)
        "indicator": bool(c.get("color_indicator")),
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
# Sagas cujo texto do Arena não casa com os capítulos do Oracle
SAGA_MISMATCH: set[str] = set()


def build(offline: bool) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    arena = load_arena(offline)
    printed = load_printed_pt(offline)
    oracle = load_oracle(offline)
    ITALIC_WORDS.update(load_italic_words(offline))
    reminders = top_reminders(printed)
    log(f"lembretes do alto de Saga e Classe em PT (das impressas): {len(reminders)}")
    with open(CACHE / "scryfall_pt.jsonl") as fh:
        by_group, by_card = reminder_texts((json.loads(line) for line in fh), {c.get("oracle_id") or c["card_faces"][0]["oracle_id"]: c for c in oracle})
    log(f"lembretes de palavra-chave em PT (das impressas): {len(by_group.get('*', {}))}")
    # e os das dicas do Arena, onde nenhuma impressa traz o lembrete (o Posicionar, ADR 0021)
    hints = arena_reminders(oracle, load_hints(), set(by_group.get("*", {})))
    for oid, table in hints.items():
        for en, pt in table.items():
            # o texto impresso da própria carta ganha da dica
            by_card.setdefault(oid, {}).setdefault(en, pt)
    log(f"lembretes de palavra-chave em PT (das dicas do Arena): {len({en for t in hints.values() for en in t})}, em {len(hints)} cartas")
    added = 0

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

        # Saga: o número de cada capítulo na frente, para o motor casar capítulo e faixa (e o
        # lembrete do alto das Sagas e das Classes)
        if source == "arena":
            for i, f in enumerate(faces):
                en_face = faces_en[min(i, len(faces_en) - 1)]
                if "Saga" in en_face.get("type_line", ""):
                    text_pt = saga_chapters(en_face.get("oracle_text"), f.get("text_pt"))
                    if text_pt is None:
                        SAGA_MISMATCH.add(oid)
                    else:
                        f["text_pt"] = top_reminder(en_face.get("oracle_text"), text_pt, reminders)
                # Classe: o lembrete "(Ganhe o próximo nível…)" no alto, como na carta impressa
                elif "Class" in en_face.get("type_line", "") and f.get("text_pt") is not None:
                    f["text_pt"] = top_reminder(en_face.get("oracle_text"), f["text_pt"], reminders)
            # o lembrete de palavra-chave de cada linha, como na carta física ("Arregimentar Orcs 1. (Coloque…)")
            for i, f in enumerate(faces):
                en_face = faces_en[min(i, len(faces_en) - 1)]
                before = f.get("text_pt")
                f["text_pt"] = add_reminders(en_face.get("oracle_text"), before, face_reminders(oid, en_face.get("type_line"), by_group, by_card))
                added += f["text_pt"] != before

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
                # a carta em inglês com o selo "Localized Image Not Available" não é imagem em PT
                "pt_print": (
                    {"id": p["id"], "set": p["set"], "number": p["collector_number"], "hires": p.get("highres_image", False)}
                    if p and real_image(p)
                    else None
                ),
                "layout": card.get("layout"),
                "type_line": card.get("type_line"),
                "edhrec_rank": card.get("edhrec_rank"),
                "commander": card.get("legalities", {}).get("commander") == "legal",
            }
        )
    log(f"cartas: {len(rows)} | texto do Arena: {stats['arena']} | impresso: {stats['impresso']} | sem PT: {stats['sem']}")
    log(f"faces do Arena com lembrete de palavra-chave das impressas: {added}")
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


PRINT_COLUMNS = ["id", "oracle_id", "set_code", "set_name", "number", "released", "artist", "frame", "effects", "border", "layout", "highres", "promo", "mana_cost", "has_pt", "two_sided", "supported", "sides", "text_flavor", "flavor_name", "indicator", "flavor_pt"]

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
    parser.add_argument("--dicas", type=Path, metavar="MTGA", help="grava as dicas das palavras-chave do Raw_ClientLocalization_*.mtga em data/cache e sai")
    args = parser.parse_args()
    if args.dicas:
        CACHE.mkdir(parents=True, exist_ok=True)
        hints = extract_hints(args.dicas)
        ARENA_HINTS.write_text(json.dumps(hints, ensure_ascii=False, indent=0))
        log(f"{len(hints)} dicas do Arena em {ARENA_HINTS}")
        return
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
        if p["oracle_id"] in PW_MISMATCH or (p["oracle_id"] in SAGA_MISMATCH and p["layout"] == "saga"):
            p["supported"] = False
    log(f"planeswalkers com habilidades que não batem (saem como estão): {len(PW_MISMATCH)}")
    log(f"Sagas com capítulos que não batem (saem como estão): {len(SAGA_MISMATCH)}")
    log(f"artes com o flavor da impressão do texto em PT: {mark_text_flavor(rows, prints, FLAVORS)}")
    log(f"artes com o flavor de outra versão do Arena: {mark_print_flavors(rows, prints, ARENA_FLAVORS)}")
    write(rows, prints)


if __name__ == "__main__":
    main()
