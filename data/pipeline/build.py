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


def arena_name(name: str | None) -> str | None:
    """
    O nome de uma carta do Arena com o separador do Scryfall. As divididas com Consequência
    (Amonkhet Remastered, Hour of Devastation) e a Crime // Punishment de OTP vêm com " /// "
    ("Dusk /// Dawn"): a carta não casava pelo nome, casava pela primeira metade, e a segunda
    ficava com o nome e os dois textos da carta inteira ("Anoitecer // Anoitecer /// Alvorecer").
    """
    return re.sub(r" /{3} ", " // ", name) if name else name


def half_names(faces: list[dict]) -> list[dict]:
    """
    Nas divididas do Arena a carta inteira vem antes das metades (ver `en_face_of`), e o nome de
    uma metade pode vir errado: o da carta inteira ("Burburinho // Agitação" na Hustle, MKM 249,
    que saía inteiro na barra da metade da esquerda) ou outra palavra ("turno" e "A Queima" no
    Turn // Burn, que é Transformar // Queimar; "Armados" no Armed // Dangerous). O nome da carta
    inteira é o da carta impressa: cada metade fica com a parte dela.
    """
    if len(faces) < 3 or " // " not in (faces[0].get("name_en") or ""):
        return faces
    parts = (faces[0].get("name_pt") or "").split(" // ")
    if len(parts) == len(faces) - 1:
        for f, part in zip(faces[1:], parts):
            f["name_pt"] = part
    return faces


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


_LEVELER_MARK = re.compile(r"LEVEL \[(\d+(?:-\d+|\+))\] \[(\d+/\d+)\]")


def leveler_level(en_text: str | None) -> list[str] | None:
    """As linhas de um nível de Subir de Nível (Level up) num marcador do Arena ("LEVEL [3-7] [4/4]
    [Protection from instants]" → ["NÍVEL 3-7", "4/4"]), como no Oracle e na carta impressa em PT.

    O marcador em PT ("NÍVEL [3-7] [4/4] [Proteção contra…]") passava por palavra-chave e se juntava
    às habilidades de antes e de depois ("Proteção contra mágicas instantâneas, nÍVEL [8+]…",
    Hexdrinker). As habilidades que vêm depois dele, até o próximo marcador, são as do nível.
    """
    m = _LEVELER_MARK.match(en_text or "")
    return [f"NÍVEL {m.group(1)}", m.group(2)] if m else None


def join_station(groups: list[tuple[str | None, list[str]]] | list[tuple[str | None, list[str], list[str]]]) -> list[str]:
    """Junta as palavras-chave de cada nível de Posicionar à parte e marca o começo de cada nível
    como o Oracle ("9+ | Voar, iniciativa"). Sem isso, o "Posicionar" e as palavras-chave do
    nível viravam uma linha só ("Posicionar, voar, iniciativa", Nave-aríete Cuneilux). Os níveis
    de Subir de Nível vêm com as linhas do selo e do P/R na frente, fora da junção (ver
    `leveler_level`)."""
    out: list[str] = []
    for level, lines, *header in groups:
        joined = join_keywords(lines)
        if level is not None and joined:
            joined[0] = f"{level} | {joined[0]}"
        out += (header[0] if header else []) + joined
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
        name_pt = arena_name(text(br, card.get("titleId")))
        if not name_pt:
            return None
        type_pt = text(br, card.get("cardTypeTextId")) or ""
        sub = text(br, card.get("subtypeTextId"))
        if sub:
            type_pt = f"{type_pt} — {sub}"
        type_en, sub_en = en.get(card.get("cardTypeTextId")), en.get(card.get("subtypeTextId"))
        # cada nível de Posicionar começa num marcador (ver station_level)
        groups: list[tuple[str | None, list[str], list[str]]] = [(None, [], [])]
        for a in card.get("abilities", []):
            if level := station_level(en.get(a.get("TextId"))):
                groups.append((level, [], []))
            elif header := leveler_level(en.get(a.get("TextId"))):
                groups.append((None, [], header))
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
        name_en = arena_name(text(en, card.get("titleId")))
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
                f["name_en"] = arena_name(text(en, other.get("titleId")))
                faces.append(f)
        front["name_en"] = name_en
        half_names(faces)
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


# o que a impressão em PT traz escrito, nos campos do Scryfall
TRANSCRIBED = ("printed_name", "printed_type_line", "printed_text", "flavor_text")


def load_transcribed() -> dict[str, dict]:
    """As impressões em PT transcritas da imagem oficial, por "coleção/número" (ADR 0026)."""
    return json.loads((TRANSLATION_DIR / "transcritas.json").read_text())


def transcribe(card: dict, table: dict[str, dict]) -> dict:
    """
    A impressão em PT que o Scryfall tem só na imagem, sem tipo nem texto (as 86 de Dragon's
    Maze), com o que a carta traz escrito, transcrito da imagem em `data/traducao/transcritas.json`
    (ADR 0026). A transcrição vale também para o nome, que o Scryfall às vezes tem errado ("Mao
    do Bico de Bronze" no Moa do Bico de Bronze). A entrada só vale para a carta de mesmo nome
    naquela coleção e número e deixa de valer quando o Scryfall trouxer o tipo ou o texto.
    """
    t = table.get(f"{card.get('set')}/{card.get('collector_number')}")
    if t and t["name"] == card.get("name") and "face_names" in t:
        return transcribe_face_names(card, t["face_names"])
    if not t or t["name"] != card.get("name") or card.get("card_faces") or card.get("printed_type_line") or card.get("printed_text") is not None:
        return card
    return {**card, **{k: t[k] if k in t else card.get(k) for k in TRANSCRIBED}, "_transcribed": f"{card['set']}/{card['collector_number']}"}


def transcribe_face_names(card: dict, names: list[str]) -> dict:
    """
    O nome em PT de cada metade de uma carta dividida, transcrito da imagem, quando o Scryfall põe
    o nome em inglês no lugar ("Rough" e "Tumble" na Confusão // Bagunça de TSR, com o texto em
    PT dizendo "Confusão causa 2 pontos de dano"). Só troca a metade que está com o nome em
    inglês (ou sem nome) e deixa de valer quando o Scryfall trouxer o nome em PT.
    """
    faces = card.get("card_faces") or []
    if len(faces) != len(names):
        return card
    # o nome em inglês da metade, ou o da carta inteira em cada metade (Saciar // Exagerar, NCC 46)
    fixed = [
        {**f, "printed_name": n} if f.get("printed_name") in (None, f.get("name"), card.get("name")) else f
        for f, n in zip(faces, names)
    ]
    if fixed == faces:
        return card
    return {
        **card,
        "card_faces": fixed,
        "printed_name": " // ".join(f["printed_name"] for f in fixed),
        "_transcribed": f"{card['set']}/{card['collector_number']}",
    }


# As divididas de Invasion em PT no Scryfall têm o nome de cada metade na outra ("Bateria" no
# Assault, "Sofrimento" no Pain, "Decrescer" no Wax, que dá +2/+2): a reimpressão de Time Spiral
# (TSB 106, com a imagem em PT) tem "Assalto" no Assault. A carta saía com o nome de uma metade
# sobre o texto da outra.
SWAPPED_HALF_NAMES = {"inv/292", "inv/293", "inv/294", "inv/295", "inv/296"}


def swap_half_names(card: dict) -> dict:
    """Destroca o nome das metades das divididas de `SWAPPED_HALF_NAMES`."""
    faces = card.get("card_faces") or []
    if f"{card.get('set')}/{card.get('collector_number')}" not in SWAPPED_HALF_NAMES or len(faces) != 2:
        return card
    names = [f.get("printed_name") for f in faces][::-1]
    fixed = [{**f, "printed_name": n} for f, n in zip(faces, names)]
    return {**card, "card_faces": fixed, "printed_name": " // ".join(n or "" for n in names) if all(names) else card.get("printed_name")}


def fix_ring_a(card: dict) -> dict:
    """
    O "å" no nome impresso em PT é o "â" trocado: o Scryfall tem "Låmpada de Aladin" nas duas
    impressões de Aladdin's Lamp da Quarta Edição, e o nome saía assim na carta. O português não
    tem "å"; ele só fica quando o nome em inglês também o tem.
    """
    def fixed(f: dict, en: str | None) -> str | None:
        n = f.get("printed_name")
        return n.replace("å", "â").replace("Å", "Â") if n and "å" not in (en or "").lower() else n

    faces = card.get("card_faces") or []
    out = {**card, "printed_name": fixed(card, card.get("name"))}
    if faces:
        out["card_faces"] = [{**f, "printed_name": fixed(f, f.get("name"))} for f in faces]
    return out if out != card else card


def read_printed_pt(table: dict[str, dict]):
    """As impressões em PT do cache do Scryfall, com as transcritas completadas (`transcribe`)."""
    with open(CACHE / "scryfall_pt.jsonl") as fh:
        for line in fh:
            yield fix_ring_a(swap_half_names(transcribe(json.loads(line), table)))


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
    table = load_transcribed()
    best = pick_printed(read_printed_pt(table))
    used = {c["_text"].get("_transcribed") for c in best.values()} - {None}
    log(f"Scryfall: {len(best)} cartas com impressão em português ({len(used)} com o texto transcrito da imagem)")
    if stale := sorted(set(table) - used):
        log(f"AVISO: {len(stale)} entradas de data/traducao/transcritas.json não valem mais (ex.: {stale[0]}): o Scryfall já traz o texto ou a carta mudou de número")
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


def pw_faces(card: dict, faces: list[dict], oid: str) -> None:
    """O custo de lealdade na frente de cada habilidade da face planeswalker de uma carta de
    transformar (ADR 0050), como em `pw_costs`. Quando os parágrafos não batem com o Oracle da
    face, a carta entra em `PW_FACE_MISMATCH` e a face sai como está."""
    for i, f in enumerate(faces):
        en_face = en_face_of(card, faces, i)
        if "Planeswalker" not in (en_face.get("type_line") or "") or f.get("text_pt") is None:
            continue
        text_pt = pw_costs(en_face.get("oracle_text"), f["text_pt"])
        if text_pt is None:
            PW_FACE_MISMATCH.add(oid)
        else:
            f["text_pt"] = text_pt


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
    linhas não batem, ou quando os parágrafos de um mesmo grupo diferem. As opções "•" depois de
    um capítulo ("I, II — Choose one —", Life of Toshiro Umezawa) são dele: o Arena repete o
    capítulo inteiro, com elas, uma vez por número do grupo.
    """
    en = [x.strip() for x in (oracle_text or "").split("\n") if x.strip() and not x.strip().startswith("(")]
    pt = [x.strip() for x in (text_pt or "").split("\n") if x.strip()]
    # cada capítulo com as opções "•" logo abaixo dele; o que não é capítulo, uma linha só
    blocks: list[tuple[str | None, int]] = []
    for x in en:
        m = _CHAPTER.match(x)
        if m:
            blocks.append((m.group(1), 1))
        elif x.startswith("•") and blocks and blocks[-1][0]:
            blocks[-1] = (blocks[-1][0], blocks[-1][1] + 1)
        else:
            blocks.append((None, 1))
    if not any(g for g, _ in blocks):
        return None
    times = [len(g.split(", ")) if g else 1 for g, _ in blocks]
    if len(pt) == sum(t * n for t, (_, n) in zip(times, blocks)):
        repeat = times
    elif len(pt) == sum(n for _, n in blocks):
        repeat = [1] * len(blocks)
    else:
        return None
    out: list[str] = []
    j = 0
    for (group, n), t in zip(blocks, repeat):
        # alguns capítulos vêm do Arena com o travessão do número na frente ("— Procure…" no
        # Roads Go Ever, Ever On): sai só o travessão, o número já vem do Oracle
        copies = []
        for _ in range(t):
            lines = pt[j : j + n]
            j += n
            if group:
                lines = [re.sub(r"^—\s*", "", lines[0]), *lines[1:]]
            copies.append(tuple(lines))
        if len(set(copies)) != 1:
            return None
        first = copies[0]
        out.append(f"{group} — {first[0]}" if group else first[0])
        out.extend(first[1:])
    return "\n".join(out)


# lembrete do alto das Sagas, das Classes e das batalhas no Oracle: "(As this Saga enters…)", "Read
# ahead (Choose…)", "(Gain the next level as a sorcery to add its ability.)", "(As a Siege enters…)"
_TOP_REMINDER = re.compile(r"^(?:Read ahead )?\(.+\)$")
TOP_REMINDER_TYPES = ("Saga", "Class", "Battle")


def top_reminders(printed: dict[str, dict]) -> dict[str, str]:
    """
    O lembrete do alto das Sagas, das Classes e das batalhas em PT, pelo lembrete em inglês do
    Oracle, tirado das cartas impressas em português (o texto oficial: "(Conforme esta Saga entra
    e após sua etapa de compra, adicione um marcador de conhecimento. Sacrifique-a após III.)",
    "(Ganhe o próximo nível como um feitiço para adicionar sua habilidade.)", "(Conforme um Cerco
    entrar no campo de batalha, escolha um oponente para protegê-lo. …)"). O Arena não traz o
    lembrete nem a explicação do "Adiantar leitura", e sem eles o alto da carta ficava vazio
    (Urza's Saga, Book of Mazarbul, Classe: Mago, Invasion of Zendikar). Fica o texto mais comum
    de cada lembrete em inglês; só lembrete idêntico ao de uma carta impressa, nunca montado.
    """
    votes: dict[str, dict[str, int]] = {}
    for card in printed.values():
        card = card.get("_text", card)
        for f in card.get("card_faces") or [card]:
            type_line = f.get("type_line") or card.get("type_line") or ""
            if not any(t in type_line for t in TOP_REMINDER_TYPES):
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
    habilidade do nível 1 da Classe, o "(Conforme um Cerco entrar…)" antes do texto da batalha (e
    antes do "Lampejo" da Invasion of Innistrad, como no Oracle e na reimpressão de INR), e o
    "Adiantar leitura" sozinho ganha a explicação dele. Sem lembrete conhecido, o texto fica como
    está (a Invasion of Alara, de texto comprido, não traz o lembrete nem no Oracle).
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
# Número por extenso no lembrete do Oracle ("Mobilize 2 (… create two tapped and attacking …)",
# "Empower Jace 6. (Put six loyalty counters …)") onde a dica tem a variável: em PT ele sai por
# extenso também, como nas cartas impressas ("crie duas fichas"). "Um" e "dois" concordam com a
# palavra seguinte na dica em PT.
_NUMBER_WORDS = {w: n for n, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve".split()) if n}
_PT_NUMBERS = {3: "três", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove", 10: "dez", 11: "onze", 12: "doze"}
_PT_FEMININE = re.compile(r"^(?:fichas?|criaturas?|vez|vezes|mágicas?|cores?|cópias?|habilidades?|cartas?|vidas?)$", re.IGNORECASE)


def pt_number(n: int, after: str) -> str:
    """O número `n` por extenso em PT, concordando com a palavra seguinte (`after`) no 1 e no 2."""
    if n in (1, 2):
        fem = bool(_PT_FEMININE.match(after))
        return ("uma" if fem else "um") if n == 1 else ("duas" if fem else "dois")
    return _PT_NUMBERS[n]


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
            # (o número por extenso vale "#2", e vira "duas" ou "dois" na dica em PT; nunca no
            # bônus, "+2/+2", que a carta sempre escreve em algarismos)
            if not cost and len(a) == 1 and a[0] in _NUMBER_WORDS and (i1 == 0 or rem[i1 - 1] != "+"):
                a = [f"#{_NUMBER_WORDS[a[0]]}"]
            elif not a or not all(_SYMBOL.match(t) if cost else t.isdigit() for t in a) or (not cost and len(a) > 1):
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
            if value.startswith("#"):
                n = int(value[1:])
                p = re.sub(re.escape(name) + r"(\s+)([\w-]+)", lambda m, n=n: pt_number(n, m.group(2)) + m.group(1) + m.group(2), p, flags=re.IGNORECASE)
                value = pt_number(n, "")
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


# linha do Oracle só com uma palavra-chave, sem custo nem lembrete ("Flash", "First strike")
_BARE_KEYWORD = re.compile(r"^[A-Z][a-z]+(?: [a-z]+){0,2}$")


def join_keyword_lines(en: list[str]) -> list[str]:
    """
    Junta numa linha só as linhas seguidas do Oracle que são só uma palavra-chave: o Arena as junta
    ("Flash\nFlying" é "Lampejo, voar" no Dirge Bat, IKO 84), e as linhas deixavam de bater uma a
    uma com o texto em PT, e a carta ficava sem o lembrete da Mutação que a física traz.
    """
    out: list[str] = []
    bare = False
    for line in en:
        if bare and _BARE_KEYWORD.match(line):
            out[-1] = f"{out[-1]}, {line.lower()}"
        else:
            out.append(line)
            bare = bool(_BARE_KEYWORD.match(line))
    return out


# Palavra-chave com custo ("Mutate {3}{G} (If you cast…)") cujo nome falta no texto em PT, que começa
# direto pelo custo: "{3}{G}" no Arena e "{3}{G} (Se você conjurar…)" no Scryfall, no Glowstone
# Recluse (IKO 156) e no Sawtusk Demolisher (C20 64), com "Mutação" na carta impressa.
COST_KEYWORDS_PT = {"Mutate": "Mutação"}
_COST_KEYWORD = re.compile(r"^([A-Z][a-z]+) ((?:\{[^}]+\})+) \(")


def restore_cost_keyword(oracle_text: str | None, text_pt: str | None) -> str | None:
    """Põe o nome da palavra-chave (ver `COST_KEYWORDS_PT`) na frente da linha em PT que é só o custo dela, com o lembrete ou sem."""
    if not text_pt:
        return text_pt
    costs = {m.group(2): COST_KEYWORDS_PT[m.group(1)] for line in (oracle_text or "").split("\n") if (m := _COST_KEYWORD.match(line.strip())) and m.group(1) in COST_KEYWORDS_PT}
    out = []
    for line in text_pt.split("\n"):
        cost = re.match(r"^((?:\{[^}]+\})+)(?: \(|$)", line)
        out.append(f"{costs[cost.group(1)]} {line}" if cost and cost.group(1) in costs else line)
    return "\n".join(out)


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
        en = join_keyword_lines(en)
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
    for i, f in enumerate(faces):
        text = f.get("printed_text")
        # nas reimpressões de RVR o Scryfall põe o nome inteiro em cada metade ("Fortalecer //
        # Formar" no Assure e no Assemble), e o nome da carta saía repetido: cada metade fica
        # com a parte dela
        name_pt = f.get("printed_name")
        if name_pt and " // " in name_pt and " // " not in (f.get("name") or "") and len(name_pt.split(" // ")) == len(faces):
            name_pt = name_pt.split(" // ")[i]
        # o texto da primeira metade do Assault // Battery de TSB traz, depois de uma linha "//",
        # a segunda metade inteira (nome, custo, tipo e texto): fica só o da metade
        if text and len(faces) > 1:
            text = re.split(r"\n//\n", text)[0]
        # criatura sem habilidades (Great-Horn Krushok): o Scryfall não manda o texto,
        # que é vazio mesmo. Com o tipo em PT, é tradução; antes ficava `None` e a carta
        # saía em inglês, como se não houvesse texto oficial
        if text is None and f.get("printed_type_line") and f.get("oracle_text") == "":
            text = ""
        out.append(
            {
                "name_en": f.get("name"),
                "name_pt": name_pt,
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


# (a aba do "+" das cartas com Série, Spree, de OTJ fica fora da barra do nome, que é a da M15:
# entram, conferidas nas 33 impressões)
UNSUPPORTED_EFFECTS = {"showcase", "etched", "inverted", "fullart", "borderless", "textless", "colorshifted", "upsidedowndfc"}
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
    """O motor do Proxinho reescreve a moldura moderna (2015+), a de 2003 a 2014 (ADR 0024), a
    antiga, de 1997 a 2003 e das reimpressões retrô (ADR 0031), e a de 1993 a 1996 (ADR 0039), de
    layout normal.

    Outras molduras entram por etapas (docs/roadmap.md). Quando a impressão não é
    suportada, o site mostra a imagem oficial em PT (se houver) ou avisa.
    """
    effects = set(card.get("frame_effects") or [])
    type_line = card.get("type_line", "")
    return (
        (card.get("frame") == "2015" or frame2003_supported(card) or frame1997_supported(card) or frame1993_supported(card))
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
    motor muda só a caixa e a ponta das barras (`frame2003` em `m15Layout`). A comum e a do céu
    estrelado de Theros (`enchantment`, nas criaturas encantamento de THS, BNG e JOU: as estrelas
    ficam só na moldura em volta, e as barras e a caixa são as mesmas, conferido em 34 cartas).
    Com outro efeito (a lápide de Odyssey no começo do nome, a faixa do milagre, as cores trocadas
    de Planar Chaos) o desenho muda, e os planeswalkers de 2003 têm caixa própria. A marca-d'água
    entra quando é lisa (`WATERMARKS_2003_OK`: as das guildas, das facções, o símbolo da coleção);
    os logotipos das promos, não. E duas coleções de promos ficam de fora (`SETS_2003_OFF`)."""
    return (
        card.get("frame") == "2003"
        and set(card.get("frame_effects") or []) <= {"enchantment"}
        and "Planeswalker" not in card.get("type_line", "")
        and card.get("watermark") in WATERMARKS_2003_OK
        and card.get("set") not in SETS_2003_OFF
    )


def frame1997_supported(card: dict) -> bool:
    """Moldura antiga (ADR 0031): de Mirage a Scourge, das edições básicas de 5ª a 7ª, de Portal e
    das reimpressões retrô (TSR, MH2, DMR, BRO, RVR...). O nome e o tipo são letras brancas com
    sombra sobre a moldura texturizada, que a rede neural apaga; a caixa é de papel. Só a comum:
    sem efeito, salvo a lápide de Odyssey a Scourge, antes do nome (fica como está, e o nome em PT
    começa onde começava o inglês, depois dela), sem marca-d'água (os logotipos das promos e o
    "wotc" das reimpressões de 30 anos, no meio da caixa), sem planeswalker (as retrô de MH3 têm
    caixa própria) e fora das coleções com o desenho refeito (`SETS_1997_OFF`)."""
    return (
        card.get("frame") == "1997"
        and set(card.get("frame_effects") or []) <= {"tombstone"}
        and "Planeswalker" not in card.get("type_line", "")
        and not card.get("watermark")
        and card.get("set") not in SETS_1997_OFF
    )


def frame1993_supported(card: dict) -> bool:
    """Moldura de 1993 (ADR 0039): de Alpha a Alliances, das edições básicas de Beta a 4ª, das
    Collectors' Editions, de Chronicles, Summer Magic e das promos da época. Como na antiga, o nome
    e o tipo ficam sobre a moldura texturizada (claros com sombra ou gravados) e saem pela rede
    neural; a caixa é de papel. Só a comum: sem efeito nem marca-d'água (nenhuma de 1993 tem) e
    fora das promos com outro desenho (`SETS_1993_OFF`)."""
    return (
        card.get("frame") == "1993"
        and not card.get("frame_effects")
        and not card.get("watermark")
        and card.get("set") not in SETS_1993_OFF
    )


# Promos de 1993 com outro desenho, sem nada que o Scryfall marque: o Nalathni Dragon da DragonCon
# de 1994 (PDRC 1) tem uma linha "DragonCon 1994" a mais no pé da caixa, com o texto em letra menor,
# e as duas cartas de comemoração (PCEL: o 1996 World Champion e o Shichifukujin Dragon) têm a caixa
# e o nome desenhados de outro jeito.
SETS_1993_OFF = {"pdrc", "pcel"}


# Coleções da moldura antiga com o desenho refeito, sem nada que o Scryfall marque: a Secret Lair
# escreve o nome e o tipo à mão ou em outras letras ("CREATURE - Goblin" em versalete, SLD 2517).
SETS_1997_OFF = {"sld"}


# Promos de 2003 com outro desenho, sem nada que o Scryfall marque: as de Champs and States (PCMP)
# têm a arte atrás do tipo e da caixa de texto, translúcida (o motor desistia das 11: Rakdos
# Guildmage, PCMP 3), e a única de 2003 da Secret Lair, a Viscera Seer espelhada (SLD VS), tem o
# nome, o tipo e o texto da direita para a esquerda (sobravam pedaços do inglês ao contrário).
SETS_2003_OFF = {"pcmp", "sld"}


# Marcas-d'água na moldura de 2003 (ADR 0024): o motor apaga só as letras e a rede neural refaz a
# marca por baixo delas (`keepMark` em `render.ts`). Entram as marcas lisas, de um tom só: as das
# guildas de Ravnica, das facções de Scars of Mirrodin, da Conspiracy, das cores (colorpie), o
# símbolo da coleção (set), o planeswalker das promos da Wizards (wotc), o DCI e o WPN, conferidas
# em 60 cartas. Ficam de fora os logotipos grandes das promos, com letras e contorno: FNM, Arena,
# Pro Tour, Grand Prix, "Magic" e os de aniversário, Hero's Path e os foils holográficos das
# Junior e Super Series; a rede neural os refazia em borrões, e o "FNM" branco de contorno escuro
# deixava pedaços do inglês (Terror, F03 8). Sem marca, a carta entra como antes.
WATERMARKS_2003_OK = {
    None,
    "azorius",
    "boros",
    "dimir",
    "golgari",
    "gruul",
    "izzet",
    "orzhov",
    "rakdos",
    "selesnya",
    "simic",
    "mirran",
    "phyrexian",
    "conspiracy",
    "colorpie",
    "set",
    "wotc",
    "dci",
    "wpn",
}


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

    As criaturas Saga (as Invocações de Final Fantasy) têm outra moldura, com o lembrete numa
    faixa larga no alto, a coluna dos capítulos mais curta e uma caixa embaixo, com a palavra-chave
    ou o flavor e a caixa de P/R (`SUMMON` em saga.ts, ADR 0042): entram também, e o motor confere
    a moldura delas na imagem. Ficam de fora as Sagas de duas faces, as sem borda e as de vitrine
    (showcase).
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


def prepare_supported(card: dict) -> bool:
    """Preparar (Secrets of Strixhaven, Reality Fracture): a caixa dividida por um fio, a criatura
    à esquerda e a mágica (nome, tipo e regras) à direita (src/engine/prepare.ts, ADR 0032). O
    motor confere o fio e as barras da mágica na imagem; sem eles, a arte sai como está.

    Ficam de fora as de moldura de 2003 e as de arte inteira (a Ancestral Recall de SOS, a
    Bloodline Recollector de FRA), que têm outro desenho; a arte estendida tem a mesma caixa.
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "prepare"
        and card.get("border_color") == "black"
        and effects <= SAGA_EFFECTS_OK | {"extendedart"}
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and not art_behind_box(card)
        and len(card.get("card_faces") or []) == 2
    )


def room_supported(card: dict) -> bool:
    """Salas (Cômodos) de Duskmourn: a carta dividida impressa deitada, com a barra do nome e o
    custo de cada metade no alto, a linha de tipo das duas e a faixa do lembrete no meio (as duas
    translúcidas, de letra branca) e uma caixa de papel por metade embaixo (src/engine/room.ts,
    ADR 0033). O motor confere as barras, as faixas e as caixas na imagem; sem elas, a arte sai
    como está. Só as de borda preta: as sem borda (Booster Fun) têm outro desenho."""
    faces = card.get("card_faces") or []
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "split"
        and card.get("border_color") == "black"
        and not card.get("frame_effects")
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and len(faces) == 2
        and all(is_room(f.get("type_line")) for f in faces)
    )


# divididas de 2015 com outro desenho: as de Commander 2016 (Trial // Error, Order // Chaos) têm
# as metades mais altas e a linha do copyright no pé da carta deitada, e as cartas de teste dos
# Mystery Boosters e do Unknown Event (Start // Fire, Bind // Liberate) têm a moldura de rascunho
SPLIT_SETS_OFF = {"c16", "cmb1", "cmb2", "mb2", "unk"}


def split_frame_ok(card: dict) -> bool:
    """A moldura das divididas que o motor reescreve: a de 2015 (ADR 0034), a de 2003 (ADR 0037,
    as de Dissension, Planar Chaos e Dragon's Maze e as reimpressões) e a antiga (ADR 0038, as de
    Invasion e Apocalypse e as reimpressões de The List e de Time Spiral), de borda preta, sem
    efeito de moldura e fora das coleções de `SPLIT_SETS_OFF`. Na de 2003 a marca-d'água de cada
    metade (das guildas) sai com o texto, como nas de 2015; o logotipo da Friday Night Magic (as
    promos de 2006), não: fica de fora, como nas cartas de 2003 (`WATERMARKS_2003_OK`). Na antiga,
    como nas cartas de pé dela, nenhuma marca-d'água e nada de `SETS_1997_OFF`; as douradas do
    Campeonato Mundial (WC01, WC02) ficam de fora pela borda."""
    faces = card.get("card_faces") or []
    frame = card.get("frame")
    return (
        (
            frame == "2015"
            or (frame == "2003" and all(f.get("watermark") in WATERMARKS_2003_OK for f in faces))
            or (frame == "1997" and not any(f.get("watermark") for f in faces) and card.get("set") not in SETS_1997_OFF)
        )
        and card.get("layout") == "split"
        and card.get("border_color") == "black"
        and not card.get("frame_effects")
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and card.get("set") not in SPLIT_SETS_OFF
        and len(faces) == 2
    )


def split_supported(card: dict) -> bool:
    """Cartas divididas de 2015 (Guilds of Ravnica, Ravnica Allegiance, Murders at Karlov Manor e
    as reimpressões na moldura atual): duas cartas pequenas da M15 lado a lado na carta deitada,
    cada uma com a barra do nome, a barra de tipo e a caixa (src/engine/split.ts, ADR 0034); as
    da moldura de 2003, pelo mesmo caminho com as medidas delas (ADR 0037); e as da antiga, com o
    nome e o tipo em letras brancas pela rede neural (ADR 0038). O motor confere as
    barras e as caixas na imagem; sem elas, a arte sai como está. Ficam de fora as Salas
    (room_supported), a Consequência e o Fundir, que têm outro desenho, e as de borda branca,
    prateada e sem borda."""
    faces = card.get("card_faces") or []
    keywords = set(card.get("keywords") or [])
    return (
        split_frame_ok(card)
        and not any(is_room(f.get("type_line")) for f in faces)
        and not keywords & {"Aftermath", "Fuse"}
    )


def aftermath_supported(card: dict) -> bool:
    """Consequência na moldura atual (Amonkhet, Hour of Devastation e as reimpressões): a metade de
    cima de pé, como uma M15 mais baixa, e a da Consequência deitada embaixo (src/engine/aftermath.ts,
    ADR 0035). O motor confere as barras e as caixas das duas metades na imagem; sem elas, a arte
    sai como está. Ficam de fora as de vitrine e as sem borda."""
    faces = card.get("card_faces") or []
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "split"
        and card.get("border_color") == "black"
        and not card.get("frame_effects")
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and len(faces) == 2
        and "Aftermath" in (card.get("keywords") or [])
    )


def fuse_supported(card: dict) -> bool:
    """Cartas com Fundir na moldura atual (as reimpressões de Dragon's Maze nos decks de Commander,
    em Commander Legends e nos Guild Kits, e as de Doctor Who, Fallout e das Tartarugas Ninja): a
    dividida de 2015 (split_supported) com a caixa mais curta e a faixa do Fundir no pé, de uma
    metade à outra (src/engine/split.ts, ADR 0036). E as de Dragon's Maze, na moldura de 2003,
    com a faixa mais alta e o lembrete alinhado à esquerda (ADR 0037)."""
    return split_frame_ok(card) and "Fuse" in (card.get("keywords") or [])


FUSE_EN = "You may cast one or both halves of this card from your hand."


def without_fuse(text: str | None) -> str | None:
    """O texto de uma metade sem a linha do Fundir ("Fundir", sozinho no Arena, ou com o lembrete),
    que vai na faixa do pé da carta e não na caixa."""
    if text is None:
        return None
    return "\n".join(x for x in text.split("\n") if not re.fullmatch(r"Fundir(\s*\(.*\))?", x.strip()))


def add_fuse_reminders(rows: list[dict], oracle, by_group: dict[str, dict[str, str]]) -> int:
    """
    O Fundir de cada carta, na faixa do pé (`reminder_pt`), com o lembrete oficial das impressas
    em PT (Wear // Tear de DMC e CMR), e sem a linha dele no texto das metades. Sem o lembrete
    oficial, nada muda (e a carta sai na original).
    """
    pt = by_group.get("*", {}).get(FUSE_EN)
    if not pt:
        return 0
    fused = {c.get("oracle_id") for c in oracle if c.get("layout") == "split" and "Fuse" in (c.get("keywords") or [])}
    done = 0
    for r in rows:
        if r["oracle_id"] not in fused or not r["faces"]:
            continue
        for f in r["faces"]:
            f["text_pt"] = without_fuse(f.get("text_pt"))
            f["reminder_pt"] = f"Fundir ({pt})"
        done += 1
    return done


def is_room(type_line: str | None) -> bool:
    return "Room" in (type_line or "").split("—")[-1].split()


# O lembrete das Salas, impresso na faixa entre a linha de tipo e as caixas (e no fim do texto de
# cada metade no Oracle). Nunca saiu impresso em PT: vem da dica do Arena (ADR 0021).
ROOM_HINT = "AbilityHanger/Keyword/Room_Body"


def room_reminder(oracle_text: str | None, hints: list[dict[str, str]]) -> str | None:
    """O lembrete das Salas em PT, entre parênteses, quando o do Oracle é o da dica palavra por palavra."""
    hint = next((h for h in hints if h["key"] == ROOM_HINT), None)
    if not hint:
        return None
    for line in (oracle_text or "").split("\n"):
        m = re.fullmatch(r"\((.+)\)", line.strip())
        if m and m.group(1).strip() == hint["en"].strip():
            return f"({hint['pt'].strip()})"
    return None


def without_room_reminder(oracle_text: str | None) -> str | None:
    """O texto de uma metade de Sala sem a linha do lembrete delas (que vai na faixa do meio, não na caixa)."""
    if oracle_text is None:
        return None
    return "\n".join(x for x in oracle_text.split("\n") if not re.fullmatch(r"\(You may cast either half\..*\)", x.strip()))


def en_face_of(card: dict, faces: list[dict], i: int) -> dict:
    """
    A face em inglês (do Oracle) da face `i` em PT. Nas cartas divididas o Arena traz antes das
    metades a carta inteira ("Armário // Porão Esquecido", com os dois textos): ela casa com a
    carta, e cada metade com a dela (casadas pela posição, a primeira metade ia com o texto da
    segunda). Nas Salas, sem a linha do lembrete delas, que vai na faixa do meio da carta e não
    está no texto em PT de cada metade (com ela, as linhas nunca batiam).
    """
    faces_en = card.get("card_faces") or [card]
    whole = len(faces) == len(faces_en) + 1 and " // " in (faces[0].get("name_en") or "")
    f = (card if i == 0 else faces_en[i - 1]) if whole else faces_en[min(i, len(faces_en) - 1)]
    if card.get("layout") == "split" and is_room(f.get("type_line")):
        return {**f, "oracle_text": without_room_reminder(f.get("oracle_text"))}
    return f


def arena_entry(arena: dict[str, dict], name: str) -> dict | None:
    """
    A carta do Arena de um nome do Oracle: pelo nome inteiro ou, nas de duas faces e nas
    Aventuras, pelo da primeira face. Uma dividida do Arena só vale com o mesmo nome inteiro: a
    Start // Fire (carta de teste dos Mystery Boosters) casava pela primeira metade com a Start //
    Finish e saía com o texto da Finish na segunda.
    """
    if name in arena:
        return arena[name]
    a = arena.get(name.split(" // ")[0])
    if a and any(" // " in (f.get("name_en") or "") and f.get("name_en") != name for f in a["faces"]):
        return None
    return a


def arena_name_pt(faces: list[dict]) -> str:
    """O nome em PT das faces do Arena: o da carta inteira, quando ela vem antes das metades (cartas divididas)."""
    if len(faces) > 1 and " // " in (faces[0].get("name_en") or ""):
        return faces[0]["name_pt"]
    return " // ".join(f["name_pt"] for f in faces)


def own_faces(card: dict, faces: list[dict]) -> list[dict]:
    """As faces do Arena que são da carta. Nas de fundir o Arena liga à carta as outras partes e a
    carta fundida: a Bruna ficava com a face da Brisela, e o nome do Fang saía "Fang, l’Cie
    Destemida // Ragnarok, Salvação Divina"."""
    return faces[:1] if card.get("layout") == "meld" else faces


MELD_REMINDER_EN = re.compile(r"^\(Melds with .+\.\)$")
MELD_REMINDER_PT = re.compile(r"^\(Funde-se com .+\.\)$")


def add_meld_data(rows: list[dict], oracle, printed: dict[str, dict]) -> tuple[int, int]:
    """
    A frente das cartas de fundir (ADR 0043): o P/R da carta fundida, que ela imprime no pé da caixa
    ("9/10" na Bruna, `meld_pt`), e o lembrete "(Funde-se com Gisela, a Lâmina Partida.)", que o
    Arena não tem, das impressas em PT (nunca montado: sem impressa, a carta fica sem ele).
    Devolve quantas ganharam o P/R e quantas o lembrete.
    """
    by_name = {c["name"]: c for c in oracle}
    by_oid = {c.get("oracle_id"): c for c in oracle}
    pts = reminders = 0
    for r in rows:
        card = by_oid.get(r["oracle_id"])
        if not card or card.get("layout") != "meld" or not r["faces"] or is_meld_result(card):
            continue
        face = r["faces"][0]
        result = next((by_name.get(x.get("name")) for x in card.get("all_parts") or [] if x.get("component") == "meld_result"), None)
        if result and result.get("power") is not None:
            face["meld_pt"] = f"{result['power']}/{result['toughness']}"
            pts += 1
        lines = (face.get("text_pt") or "").split("\n")
        if not any(MELD_REMINDER_EN.match(x.strip()) for x in (card.get("oracle_text") or "").split("\n")):
            continue
        if face.get("text_pt") is None or any(MELD_REMINDER_PT.match(x.strip()) for x in lines):
            continue
        p = printed.get(r["oracle_id"])
        pt = [x.strip() for x in ((printed_faces(p)[0].get("text_pt") or "") if p else "").split("\n") if MELD_REMINDER_PT.match(x.strip())]
        if pt:
            face["text_pt"] = face["text_pt"] + "\n" + pt[0]
            reminders += 1
    return pts, reminders


def add_room_reminders(rows: list[dict], oracle, hints: list[dict[str, str]]) -> int:
    """Põe o lembrete das Salas em PT (`reminder_pt`) em cada face delas, também nas de tradução não oficial."""
    by_oid = {c.get("oracle_id") or c["card_faces"][0]["oracle_id"]: c for c in oracle}
    done = 0
    for r in rows:
        card = by_oid.get(r["oracle_id"])
        faces_en = (card or {}).get("card_faces") or []
        if not r["faces"] or r["layout"] != "split" or not faces_en or not all(is_room(f.get("type_line")) for f in faces_en):
            continue
        pt = room_reminder(faces_en[0].get("oracle_text"), hints)
        if pt:
            for f in r["faces"]:
                f["reminder_pt"] = pt
            done += 1
    return done


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


def mutate_supported(card: dict) -> bool:
    """Criaturas com Mutação (Ikoria e as reimpressões de Commander) na moldura comum: a caixa partida
    pelo fio da faixa translúcida da Mutação, no alto, com a arte atrás (src/engine/mutate.ts). O
    motor confere o fio na imagem; sem ele, a arte sai como está. Ficam de fora as de vitrine e as
    sem borda (as de Godzilla), com a caixa de outro desenho.
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "mutate"
        and card.get("border_color") == "black"
        and effects <= {"legendary"}
        and not card.get("full_art")
        and not card.get("textless")
        and not art_behind_box(card)
        and not drawn_frame(card)
    )


def leveler_supported(card: dict) -> bool:
    """Criaturas com Subir de Nível (Level up) na moldura de 2003 (Rise of the Eldrazi, as Duel Decks
    e Commander 2013) e na atual (Duel Decks, Commander, Modern Horizons): a caixa em três faixas
    fixas, cada uma com a sua caixa de P/R, e os selos dos níveis (src/engine/leveler.ts). O motor
    confere as faixas e as caixas de P/R na imagem; sem elas, a arte sai como está. Ficam de fora
    as sem borda e as de vitrine, as cartas de teste (MB2), de outro desenho, e as com marca-d'água
    (as promos de ROE): o apagamento de cada faixa levava a marca junto, em cacos.
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") in {"2003", "2015"}
        and card.get("layout") == "leveler"
        and card.get("border_color") == "black"
        and effects <= {"legendary"}
        and not card.get("full_art")
        and not card.get("textless")
        and not art_behind_box(card)
        and not drawn_frame(card)
        and not card.get("watermark")
        and "playtest" not in (card.get("promo_types") or [])
    )


# efeitos que não mudam a frente das cartas de fundir: a coroa de lendária, o ícone da lua e
# do Eldrazi de Eldritch Moon (no lugar do círculo das outras) e a arte estendida
MELD_EFFECTS_OK = {"legendary", "mooneldrazidfc", "extendedart"}


def is_meld_result(card: dict) -> bool:
    """A carta fundida (Brisela, Chittering Host): a impressão dela é a junção dos versos das duas partes."""
    return any(p.get("component") == "meld_result" and p.get("name") == card.get("name") for p in card.get("all_parts") or [])


def meld_supported(card: dict) -> bool:
    """A frente das cartas de fundir (Eldritch Moon, The Brothers' War, Final Fantasy e as
    reimpressões; ADR 0043): a moldura da carta comum, com o ícone à esquerda do nome, como nas de
    duas faces, e o P/R da carta fundida no pé da caixa, como o do verso nas de transformar. A carta
    fundida (as duas metades juntas) fica de fora, como as sem borda e as de vitrine.
    """
    effects = set(card.get("frame_effects") or [])
    return (
        card.get("frame") == "2015"
        and card.get("layout") == "meld"
        and card.get("border_color") == "black"
        and effects <= MELD_EFFECTS_OK
        and not is_meld_result(card)
        and not card.get("full_art")
        and not card.get("textless")
        and not art_behind_box(card)
        and not drawn_frame(card)
    )


def flip_supported(card: dict) -> bool:
    """As cartas viradas de Kamigawa (Champions, Betrayers e Saviors of Kamigawa e as reimpressões,
    na moldura de 2003 e na atual; ADR 0044): a metade de cima de pé, acima da arte, e a virada de
    cabeça para baixo, abaixo dela, cada uma com a barra do nome, a caixa e a barra de tipo
    (src/engine/flip.ts). O motor confere as barras de tipo e as caixas de P/R na imagem. Ficam de
    fora as fichas de Papel de Wilds of Eldraine (o layout delas também é "flip") e a de Unhinged,
    de borda prateada."""
    return (
        card.get("layout") == "flip"
        and card.get("frame") in {"2003", "2015"}
        and card.get("border_color") in {"black", "white"}
        and not card.get("frame_effects")
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and not card.get("type_line", "").startswith("Token")
        and len(card.get("card_faces") or []) == 2
    )


def prototype_supported(card: dict) -> bool:
    """As criaturas com Protótipo (The Brothers' War e Modern Horizons 3, ADR 0045): a caixa da carta
    comum partida em duas, com a faixa do protótipo no alto (o lembrete à esquerda, a aba do custo e
    a caixa de P/R dele à direita) e o papel de sempre embaixo (src/engine/prototype.ts). O motor
    confere a faixa, o fio dela e as abas na imagem. A arte estendida tem a mesma caixa."""
    return (
        card.get("layout") == "prototype"
        and card.get("frame") == "2015"
        and card.get("border_color") == "black"
        and set(card.get("frame_effects") or []) <= {"extendedart"}
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
    )


def case_supported(card: dict) -> bool:
    """Os Casos de Murders at Karlov Manor (ADR 0046): a coluna da Classe sem as barras, com a
    habilidade, "To solve" e "Solved" separados por dois fios finos (src/engine/caseCard.ts). O
    motor confere a coluna, os dois fios e a barra de tipo no pé na imagem; sem eles, a arte sai
    como está. Só a moldura de papel de borda preta sem efeito (as de MKM, MKC e as promos de PMKM;
    a Case of the Lost Witness, MBC 62, com o céu estrelado na moldura, fica de fora)."""
    return (
        card.get("layout") == "case"
        and card.get("frame") == "2015"
        and card.get("border_color") == "black"
        and not card.get("frame_effects")
        and not card.get("full_art")
        and not card.get("textless")
        and not drawn_frame(card)
        and "Case" in card.get("type_line", "")
    )


# a linha do Protótipo no Oracle ("Prototype {1}{W}{W} — 3/3 (You may cast…)") e o lembrete das impressas em PT
PROTOTYPE_EN = re.compile(r"^Prototype ((?:\{[^}]+\})+) — \d+/\d+ \(")
PROTOTYPE_PT = re.compile(r"^Protótipo \(.+\)$")


def prototype_reminders(printed: dict[str, dict]) -> tuple[dict[str, str], str | None]:
    """
    O lembrete do Protótipo em PT de cada carta impressa ("Protótipo (Você pode conjurar esta mágica
    com custo de mana, cor e tamanho diferentes. …)"), na linha do texto impresso entre o custo e o
    P/R do protótipo, e o da impressa mais nova, para as que não têm impressa em PT. Nunca montado.
    """
    by_card: dict[str, str] = {}
    newest = ("", None)
    for oid, p in printed.items():
        text = p.get("_text", p)
        if text.get("layout") != "prototype":
            continue
        line = next((x.strip() for x in (printed_faces(p)[0].get("text_pt") or "").split("\n") if PROTOTYPE_PT.match(x.strip())), None)
        if line:
            by_card[oid] = line
            newest = max(newest, (text.get("released_at") or "", line), key=lambda t: t[0])
    return by_card, newest[1]


def prototype_cost(oracle_text: str | None) -> str | None:
    """O custo do protótipo, da linha dele no Oracle ("{1}{W}{W}"): o motor acha a aba dele pelo número de símbolos."""
    return next((m.group(1) for line in (oracle_text or "").split("\n") if (m := PROTOTYPE_EN.match(line.strip()))), None)


def prototype_text(text_pt: str | None, reminder: str | None) -> str | None:
    """
    O texto do Arena com o Protótipo no alto, como na carta impressa: o Arena junta a palavra-chave
    às da primeira linha, sem o custo nem o lembrete ("Protótipo, voar"), e a carta imprime o
    lembrete sozinho na faixa do alto, com o custo e o P/R nas abas, e o resto no papel ("Voar").
    O lembrete vem das impressas em PT (`prototype_reminders`); sem ele, fica só a palavra. Sem o
    Protótipo na frente, `None`: o texto não bate com a moldura.
    """
    if not text_pt:
        return None
    lines = text_pt.split("\n")
    m = re.match(r"^Protótipo(?:, (.+))?$", lines[0].strip())
    if not m:
        return None
    rest = [m.group(1)[:1].upper() + m.group(1)[1:]] if m.group(1) else []
    return "\n".join([reminder or "Protótipo", *rest, *lines[1:]])


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
# molduras de duas faces com desenho próprio (o verso da bússola de Ixalan, a conversão dos
# Transformers). O ícone do planeswalker de Magic Origins fica no lugar do sol (ADR 0050)
UNSUPPORTED_DFC_EFFECTS = UNSUPPORTED_EFFECTS | {"compasslanddfc", "convertdfc"}
# a face planeswalker das cartas de transformar (ADR 0050): o sol e a lua, o ícone de Magic Origins
PW_DFC_EFFECTS_OK = {"sunmoondfc", "originpwdfc", "legendary"}
# o leque de Kamigawa: Neon Dynasty é só o ícone das de duas faces (ADR 0047)
DFC_SAGA_EFFECTS_OK = SAGA_EFFECTS_OK | {"fandfc"}
# As promos de pré-estreia de Kamigawa: Neon Dynasty (PNEO, foil) têm a imagem lavada na
# digitalização: na Saga, o degrau dos fios entre os capítulos tem 1 tom, e o motor não os acha (as
# nove saíam na original); no verso, as letras brancas da barra clara da The Restoration of Eiganjo
# (PNEO 34s) ficavam por baixo do português. As duas faces saem como estão; as da coleção, não.
DFC_SAGA_SETS_OFF = {"pneo"}
# A frente das batalhas (ADR 0048): a coroa do verso lendário e o fundo do verso encantamento
# (Invasion of Theros; a Invasion of Innistrad de INR) ficam no verso e não mudam a frente
BATTLE_EFFECTS_OK = {"legendary", "enchantment"}


def face_supported(card: dict, face: dict) -> bool:
    """Uma face de carta de duas faces (transformar ou modal) na moldura 2015, ou de transformar na
    de 2003 (Innistrad e Dark Ascension, ADR 0049).

    A face que é Saga (as de Kamigawa: Neon Dynasty e de Avatar na frente, as dos pretores de March
    of the Machine, a do Huatli e as Invocações de Final Fantasy no verso) tem a moldura da Saga,
    com o ícone das de duas faces e, na frente, o P/R do verso no pé da coluna (ADR 0047): entra
    como as Sagas de uma face, de borda preta, sem a arte estendida e sem as de vitrine. A frente
    das batalhas (ADR 0048) é impressa deitada e tem moldura própria (src/engine/battle.ts). A face
    planeswalker (ADR 0050) tem a caixa do planeswalker, com o ícone e o indicador de cor.
    """
    effects = set(card.get("frame_effects") or [])
    if card.get("set") in DFC_SAGA_SETS_OFF:
        return False
    # as de Innistrad e Dark Ascension na moldura de 2003 (ADR 0049): o sol e a lua à esquerda do
    # nome, o verso com as barras escuras e a letra branca, e na frente o P/R do verso numa ponta
    # da caixa. Fora o Garruk Relentless, planeswalker (a caixa de 2003 deles não é reescrita)
    if card.get("frame") == "2003":
        return (
            card.get("layout") == "transform"
            and card.get("border_color") == "black"
            and effects <= {"sunmoondfc"}
            and not card.get("full_art")
            and not card.get("textless")
            and card.get("watermark") in WATERMARKS_2003_OK
            and card.get("set") not in SETS_2003_OFF
            and not any(t in face.get("type_line", "") for t in UNSUPPORTED_TYPES)
        )
    # a frente das batalhas, impressa deitada (ADR 0048): só a de borda preta, sem as cartas de teste
    if "Battle" in face.get("type_line", ""):
        return (
            card.get("frame") == "2015"
            and card.get("layout") == "transform"
            and card.get("border_color") == "black"
            and effects <= BATTLE_EFFECTS_OK
            and not card.get("full_art")
            and not card.get("textless")
            and not drawn_frame(card)
            and "playtest" not in (card.get("promo_types") or [])
        )
    # a face planeswalker das de transformar (ADR 0050): a caixa do planeswalker, com o ícone das de
    # duas faces à esquerda do nome (ou à direita, no verso sem custo) e o indicador de cor. Só a de
    # borda preta, sem as de vitrine e as "inverted" (Comic-Con de 2015) e sem as cartas de teste
    if "Planeswalker" in face.get("type_line", ""):
        return (
            card.get("frame") == "2015"
            and card.get("layout") == "transform"
            and card.get("border_color") == "black"
            and effects <= PW_DFC_EFFECTS_OK
            and not card.get("full_art")
            and not card.get("textless")
            and not drawn_frame(card)
            and "playtest" not in (card.get("promo_types") or [])
        )
    if "Saga" in face.get("type_line", ""):
        return (
            card.get("frame") == "2015"
            and card.get("layout") == "transform"
            and card.get("border_color") == "black"
            and effects <= DFC_SAGA_EFFECTS_OK
            and not card.get("full_art")
            and not card.get("textless")
            and not drawn_frame(card)
        )
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


# As faces que são Saga nas cartas de duas faces: {id da impressão: [face]} (ver `SAGA_MISMATCH`)
SAGA_SIDES: dict[str, list[int]] = {}
# e as que são planeswalker (ver `PW_FACE_MISMATCH`)
PW_SIDES: dict[str, list[int]] = {}


def sides_of(card: dict) -> list[dict] | None:
    """Dados de cada face de uma impressão de duas faces (para o motor da carta)."""
    faces = card.get("card_faces")
    if card.get("layout") not in DFC_LAYOUTS or not faces or card.get("image_uris"):
        return None
    out = []
    for i, f in enumerate(faces):
        if "Saga" in f.get("type_line", ""):
            SAGA_SIDES.setdefault(card["id"], []).append(i)
        if "Planeswalker" in f.get("type_line", ""):
            PW_SIDES.setdefault(card["id"], []).append(i)
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
        or prepare_supported(c)
        or room_supported(c)
        or split_supported(c)
        or aftermath_supported(c)
        or fuse_supported(c)
        or class_supported(c)
        or station_supported(c)
        or mutate_supported(c)
        or leveler_supported(c)
        or meld_supported(c)
        or flip_supported(c)
        or prototype_supported(c)
        or case_supported(c)
        or bool(sides and sides[0]["supported"]),
        "sides": sides,
        # nome de crossover no alto (o nome de jogo vai numa linha pequena abaixo da barra)
        "flavor_name": c.get("flavor_name") or face.get("flavor_name"),
        # indicador de cor das cartas de uma face só (nas de duas faces, em `sides`)
        "indicator": bool(c.get("color_indicator")),
        # marca-d'água: na moldura de 2003 ela fica, e só as letras saem de cima dela (ADR 0024)
        "watermark": c.get("watermark"),
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
# a face planeswalker de uma carta de transformar com as habilidades que não batem: só ela sai como está
PW_FACE_MISMATCH: set[str] = set()
# Sagas cujo texto do Arena não casa com os capítulos do Oracle
SAGA_MISMATCH: set[str] = set()


# --- Tradução não oficial (ADR 0025) -------------------------------------------------------
# A carta que não tem texto oficial em PT (nem no Arena, nem impresso) é montada linha a linha:
# a linha do Oracle que já saiu igual em outra carta oficial leva o texto dela (o do Arena na
# frente, que segue o padrão de hoje); a que só muda nos números e símbolos leva o molde dela; e
# o resto vem de `data/traducao/linhas.json`, traduzido no padrão do Arena e marcado como não
# oficial. Basta uma linha sem tradução para a carta seguir em inglês.
TRANSLATION_DIR = ROOT / "traducao"
_ANY_REMINDER = re.compile(r"\s*\([^()]*\)")
_MOLD_MARK = re.compile(r"\{[^}]+\}|[+-]?\d+(?:/[+-]?\d+)?")


def line_key(line: str, names: list[str | None], pt: bool = False) -> str:
    """
    A linha do Oracle sem o lembrete e com o nome da carta trocado por "~" (o nome mais comprido
    primeiro). No inglês, depois de "a" ou "an" o nome é o de um tipo, não a carta: "becomes a
    Coward" no Coward // Killer fica, para sair "Covarde" e não o nome da carta. No PT (`pt`) o "a"
    é preposição ("causado a Leão Fulgente") e o nome sempre sai.
    """
    s = _ANY_REMINDER.sub("", line).strip()
    article = "" if pt else r"(?<!\ba )(?<!\ban )"
    for n in sorted({n for n in names if n}, key=len, reverse=True):
        s = re.sub(article + re.escape(n), "~", s)
    return s


def mold(line: str) -> str:
    """
    O molde da linha: os números e símbolos viram "#". O plural vai junto ("1 life" é "1 ponto de
    vida", "3 life" é "3 pontos de vida"): o molde de uma linha só serve a outra com o mesmo 1 nos
    mesmos lugares.
    """
    marks = _MOLD_MARK.findall(line)
    plural = "".join("1" if re.fullmatch(r"[+-]?1", m) else "n" for m in marks if not m.startswith("{") and "/" not in m)
    return _MOLD_MARK.sub("#", line) + "|" + plural


def fill_mold(line: str, pt_mold: str) -> str:
    """Põe no molde em PT os números e símbolos da linha em inglês, na mesma ordem."""
    marks = iter(_MOLD_MARK.findall(line))
    return re.sub("#", lambda _: next(marks), pt_mold.split("|")[0])


# termos que o PT deixou depois do Magic 2010: o "custo de mana convertido" virou "valor de mana"
# (2021) e o "a sua reserva de mana" saiu do "Adicione {G}" (2019)
_OUTDATED_PT = re.compile(r"custo de mana convertido|reserva de mana")


def official_lines(rows: list[dict], oracle: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """
    As linhas oficiais, do inglês do Oracle para o PT (sem lembrete, nome como "~"), e os moldes
    delas. Só casa as faces com o mesmo número de linhas nos dois idiomas; de cada linha fica o
    texto mais comum do Arena, senão o das impressas. As impressas antes do Magic 2010 ficam de
    fora (`_old_text`): com elas, a tradução não oficial saía com "Quando ~ entrar em jogo" e
    "Toda vez que você jogar uma mágica" (Budoka Pupil, BOK 122). E as linhas com um termo que
    saiu depois (`_OUTDATED_PT`) também: "custo de mana convertido" no Ramosian Captain.
    """
    votes: dict[str, Counter] = {}
    arena: dict[str, Counter] = {}
    for r in rows:
        card = oracle.get(r["oracle_id"])
        if not r["source"] or r["source"] == "nao-oficial" or r.get("_old_text") or not card:
            continue
        faces_en = card.get("card_faces") or [card]
        if len(faces_en) != len(r["faces"]):
            continue
        for e, p in zip(faces_en, r["faces"]):
            en = [x for x in (line_key(x, [e.get("name"), card["name"]]) for x in (e.get("oracle_text") or "").split("\n")) if x]
            pt = [x for x in (line_key(x, [p.get("name_pt"), r.get("name_pt")], pt=True) for x in (p.get("text_pt") or "").split("\n")) if x]
            if len(en) != len(pt) or not en:
                continue
            for a, b in zip(en, pt):
                if _OUTDATED_PT.search(b):
                    continue
                votes.setdefault(a, Counter())[b] += 1
                if r["source"] == "arena":
                    arena.setdefault(a, Counter())[b] += 1
    best = {a: max((arena.get(a) or c).items(), key=lambda kv: (kv[1], kv[0]))[0] for a, c in votes.items()}
    molds: dict[str, str] = {}
    for a, b in sorted(best.items()):
        if _MOLD_MARK.findall(a) == _MOLD_MARK.findall(b):
            molds.setdefault(mold(a), mold(b))
    return best, molds


def official_types(rows: list[dict], oracle: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """
    A linha de tipo em PT: a parte antes do travessão inteira ("Legendary Artifact Creature" →
    "Criatura Artefato Lendária") e cada subtipo, das faces oficiais com o mesmo número de
    subtipos nos dois idiomas (o do Arena na frente). O PT nem sempre segue a ordem do inglês
    ("Elder Dragon" é "Dragão Ancião", "Zubera Spirit" é "Espírito Zubera"): casar palavra por
    palavra dava "Dragão" ao "Elder". Em cada linha, o subtipo mais comum fica primeiro com o nome
    dele e os outros dividem o que sobra, na ordem. A sequência inteira de dois ou mais subtipos
    também entra (com a chave em inglês), para `translate_type` seguir a ordem oficial, quando ela
    sai mais vezes que a ordem do inglês (o Arena na frente, como nas linhas): "Human Spellshaper"
    sai das duas maneiras nas impressas e fica "Humano Magimodelador".
    """
    heads: dict[str, Counter] = {}
    whole: dict[str, Counter] = {}
    arena: dict[str, Counter] = {}
    pairs: list[tuple[list[str], list[str], int]] = []
    for r in rows:
        card = oracle.get(r["oracle_id"])
        if not r["source"] or r["source"] == "nao-oficial" or not card:
            continue
        faces_en = card.get("card_faces") or [card]
        if len(faces_en) != len(r["faces"]):
            continue
        weight = 2 if r["source"] == "arena" else 1
        for e, p in zip(faces_en, r["faces"]):
            te, tp = e.get("type_line"), p.get("type_pt")
            if not te or not tp:
                continue
            he, _, se = te.partition(" — ")
            hp, _, sp = tp.partition(" — ")
            heads.setdefault(he, Counter())[hp] += weight
            se_words, sp_words = se.split(), sp.split()
            if se_words and len(se_words) == len(sp_words):
                pairs.append((se_words, sp_words, weight))
                if len(se_words) > 1:
                    whole.setdefault(se, Counter())[sp] += 1
                    if r["source"] == "arena":
                        arena.setdefault(se, Counter())[sp] += 1
    pick = lambda c: max(c.items(), key=lambda kv: (kv[1], kv[0]))[0]  # noqa: E731
    first: dict[str, Counter] = {}
    for se_words, sp_words, weight in pairs:
        for a, b in zip(se_words, sp_words):
            first.setdefault(a, Counter())[b] += weight
    top = {a: pick(c) for a, c in first.items()}
    total = {a: sum(c.values()) for a, c in first.items()}
    subs: dict[str, Counter] = {}
    for se_words, sp_words, weight in pairs:
        left, rest = list(sp_words), []
        for i in sorted(range(len(se_words)), key=lambda i: -total[se_words[i]]):
            if top[se_words[i]] in left:
                left.remove(top[se_words[i]])
                subs.setdefault(se_words[i], Counter())[top[se_words[i]]] += weight
            else:
                rest.append(i)
        for i, b in zip(sorted(rest), left):
            subs.setdefault(se_words[i], Counter())[b] += weight
    words = {a: pick(c) for a, c in subs.items()}
    order: dict[str, str] = {}
    for se, c in whole.items():
        votes = arena.get(se) or c
        seq, en_order = pick(votes), " ".join(words[a] for a in se.split())
        if seq != en_order and votes[seq] > votes.get(en_order, 0):
            order[se] = seq
    return {h: pick(c) for h, c in heads.items()}, {**words, **order}


def translate_type(type_line: str | None, heads: dict[str, str], subs: dict[str, str], extra: dict[str, str]) -> str | None:
    """
    A linha de tipo em PT pelo que já saiu oficial, mais os subtipos de `data/traducao/tipos.json`
    (os de várias palavras, como "Time Lord", primeiro). O tipo de planeswalker é nome próprio e
    fica como está. None quando falta alguma parte.
    """
    if not type_line:
        return None
    he, _, se = type_line.partition(" — ")
    head = heads.get(he)
    if not head:
        return None
    if not se:
        return head
    rest, words = se, []
    while rest:
        multi = next((k for k in sorted(extra, key=len, reverse=True) if " " in k and (rest == k or rest.startswith(k + " "))), None)
        word = multi or rest.split(" ")[0]
        rest = rest[len(word) :].strip()
        pt = extra.get(word) or subs.get(word) or (word if "Planeswalker" in he else None)
        if not pt:
            return None
        words.append(pt)
    # a ordem oficial da sequência inteira, quando ela tem as mesmas palavras ("Dragão Ancião")
    seq = subs.get(se) if " " in se else None
    if seq and sorted(seq.split()) == sorted(" ".join(words).split()):
        return f"{head} — {seq}"
    return f"{head} — {' '.join(words)}"


def subtype_mismatches(lines: dict[str, str], subs: dict[str, str], extra: dict[str, str]) -> list[tuple[str, str, str]]:
    """
    As linhas traduzidas que citam um subtipo sem o nome oficial dele em PT: "Wall" é "Barreira"
    nas cartas oficiais, e "Muralha" no texto deixava o texto diferente da linha de tipo. Devolve
    (linha em inglês, subtipo, nome oficial). Fica de fora o subtipo dentro de um nome próprio:
    colado por hífen ("Ghost-Spider"), depois de outra palavra com maiúscula no meio da frase
    ("Nathan Drake") ou de "The" ("The Beast"), antes de outra palavra com maiúscula ("Bear
    Witness") ou de "of" ("Eye of Chaos"). O plural em PT muda o fim da palavra ("Cão", "Cães";
    "Boneco Cabeçudo", "Bonecos Cabeçudos"): basta o começo da primeira, sem acento.
    """
    def plain(s: str) -> str:
        return norm(s).replace(" ", "")

    names = {**subs, **extra}
    found = []
    for en, pt in lines.items():
        pt_plain = plain(pt)
        for sub, sub_pt in names.items():
            if " " in sub or len(sub) < 3 or not sub[0].isupper() or plain(sub) == plain(sub_pt):
                continue
            for m in re.finditer(rf"(?<![\w-])(?:non-)?{re.escape(sub)}(?:e?s)?(?![\w-])", en):
                before = en[: m.start()].rstrip()
                prev = before.split(" ")[-1] if before else ""
                inside = bool(prev) and prev[0].isupper() and prev[-1].isalpha() and not re.search(r"(^|[.:—•])\s*\S+$", before)
                if inside or prev == "The" or re.match(r" (of |[A-Z]\w)", en[m.end() :]):
                    continue
                stem = plain(re.split(r"[ -]", sub_pt)[0])
                if stem[: -2 if len(stem) > 4 else -1] not in pt_plain:
                    found.append((en, sub, sub_pt))
                break
    return found


def load_unofficial() -> tuple[dict[str, str], dict[str, str]]:
    """As linhas e os subtipos traduzidos (não oficiais), em `data/traducao/`."""
    lines = json.loads((TRANSLATION_DIR / "linhas.json").read_text())
    types = json.loads((TRANSLATION_DIR / "tipos.json").read_text())
    return lines, types


def unofficial_faces(
    card: dict,
    names_pt: list[str | None],
    best: dict[str, str],
    molds: dict[str, str],
    lines: dict[str, str],
    heads: dict[str, str],
    subs: dict[str, str],
    types: dict[str, str],
    count: Counter | None = None,
) -> list[dict] | None:
    """
    As faces em PT de uma carta sem texto oficial (ver o começo desta parte): cada linha do Oracle
    pela linha oficial igual, pelo molde ou pela tradução; o tipo por `translate_type`. O nome fica
    o impresso em PT, se houver (`names_pt`), senão o em inglês. Sem lembrete (entra depois, pelo
    texto oficial, em `add_reminders`) e sem flavor. None quando falta uma linha ou o tipo.
    `count` conta de onde veio cada linha ("oficial", "molde", "traduzida").
    """
    faces, used = [], Counter()
    for i, e in enumerate(card.get("card_faces") or [card]):
        name = (names_pt[i] if i < len(names_pt) else None) or e.get("name")
        type_pt = translate_type(e.get("type_line"), heads, subs, types)
        if type_pt is None:
            return None
        out = []
        for raw in (e.get("oracle_text") or "").split("\n"):
            key = line_key(raw, [e.get("name"), card["name"]])
            if not key:
                continue  # lembrete sozinho na linha (o do alto das Sagas entra em `top_reminder`)
            if key in best:
                pt, used["oficial"] = best[key], used["oficial"] + 1
            elif mold(key) in molds:
                pt, used["molde"] = fill_mold(key, molds[mold(key)]), used["molde"] + 1
            elif key in lines:
                pt, used["traduzida"] = lines[key], used["traduzida"] + 1
            else:
                return None
            out.append(pt.replace("~", name))
        faces.append({"name_en": e.get("name"), "name_pt": name, "type_pt": type_pt, "text_pt": "\n".join(out), "flavor_pt": None, "mana_cost": e.get("mana_cost")})
    if count is not None:
        count.update(used)
    return faces


def add_unofficial(rows: list[dict], oracle: list[dict], reminders: dict[str, str], by_group: dict, by_card: dict) -> int:
    """
    Dá a tradução não oficial (`unofficial_faces`) às cartas sem texto oficial em PT, com o mesmo
    acabamento das do Arena: o custo de lealdade dos planeswalkers, o lembrete do alto das Sagas e
    das Classes, o lembrete oficial de cada palavra-chave e as palavras de habilidade em itálico. O
    nome da carta fica o impresso em PT, senão o em inglês. Devolve quantas ganharam a tradução.
    """
    by_oid = {c.get("oracle_id") or c["card_faces"][0]["oracle_id"]: c for c in oracle}
    best, molds = official_lines(rows, by_oid)
    heads, subs = official_types(rows, by_oid)
    lines, types = load_unofficial()
    done, used = 0, Counter()
    for r in rows:
        if r["source"] is not None:
            continue
        card, oid = by_oid[r["oracle_id"]], r["oracle_id"]
        faces = unofficial_faces(card, r["name_pt"].split(" // ") if r["name_pt"] else [], best, molds, lines, heads, subs, types, used)
        if not faces:
            continue
        if "Planeswalker" in card.get("type_line", "") and card.get("layout") == "normal":
            text_pt = pw_costs(card.get("oracle_text"), faces[0]["text_pt"])
            if text_pt is None:
                PW_MISMATCH.add(oid)
            else:
                faces[0]["text_pt"] = text_pt
        if card.get("layout") == "transform":
            pw_faces(card, faces, oid)
        for i, f in enumerate(faces):
            e = en_face_of(card, faces, i)
            if any(t in (e.get("type_line") or "") for t in TOP_REMINDER_TYPES):
                f["text_pt"] = top_reminder(e.get("oracle_text"), f["text_pt"], reminders)
            f["text_pt"] = add_reminders(e.get("oracle_text"), f["text_pt"], face_reminders(oid, e.get("type_line"), by_group, by_card))
            aw = ability_word_lines(e.get("oracle_text"), f["text_pt"])
            if aw:
                f["ability_words"] = aw
        r.update(source="nao-oficial", faces=faces, name_pt=r["name_pt"] or " // ".join(f["name_pt"] for f in faces))
        done += 1
    log(f"tradução não oficial, de onde vêm as linhas: {used['oficial']} iguais a uma oficial, {used['molde']} pelo molde de uma oficial, {used['traduzida']} traduzidas")
    wrong = subtype_mismatches(lines, subs, types)
    if wrong:
        log(f"AVISO: {len(wrong)} linhas de data/traducao/linhas.json sem o nome oficial do subtipo (ex.: {wrong[0][1]} é {wrong[0][2]}): rode data/pipeline/faltam.py")
    return done


def build(offline: bool) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    arena = load_arena(offline)
    printed = load_printed_pt(offline)
    oracle = load_oracle(offline)
    ITALIC_WORDS.update(load_italic_words(offline))
    reminders = top_reminders(printed)
    log(f"lembretes do alto de Saga, Classe e batalha em PT (das impressas): {len(reminders)}")
    by_group, by_card = reminder_texts(read_printed_pt(load_transcribed()), {c.get("oracle_id") or c["card_faces"][0]["oracle_id"]: c for c in oracle})
    log(f"lembretes de palavra-chave em PT (das impressas): {len(by_group.get('*', {}))}")
    # e os das dicas do Arena, onde nenhuma impressa traz o lembrete (o Posicionar, ADR 0021)
    raw_hints = load_hints()
    hints = arena_reminders(oracle, raw_hints, set(by_group.get("*", {})))
    for oid, table in hints.items():
        for en, pt in table.items():
            # o texto impresso da própria carta ganha da dica
            by_card.setdefault(oid, {}).setdefault(en, pt)
    log(f"lembretes de palavra-chave em PT (das dicas do Arena): {len({en for t in hints.values() for en in t})}, em {len(hints)} cartas")
    proto_by_card, proto_newest = prototype_reminders(printed)
    log(f"lembretes do Protótipo em PT (das impressas): {len(proto_by_card)} cartas")
    added = 0

    rows = []
    stats = {"arena": 0, "impresso": 0, "sem": 0}
    for card in oracle:
        if "paper" not in card.get("games", []) or card.get("layout") in {"art_series", "token", "double_faced_token", "emblem"}:
            continue
        name = card["name"]
        front_name = name.split(" // ")[0]
        oid = card["oracle_id"] if "oracle_id" in card else card["card_faces"][0]["oracle_id"]
        a = arena_entry(arena, name)
        p = printed.get(oid)

        if a:
            source, faces, text_print = "arena", own_faces(card, a["faces"]), a["print"]
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
        # (e a face planeswalker das de transformar, ADR 0050)
        if card.get("layout") == "transform":
            pw_faces(card, faces, oid)

        # o nome da palavra-chave que falta na frente do custo dela (ver `restore_cost_keyword`)
        for i, f in enumerate(faces):
            if f.get("text_pt"):
                f["text_pt"] = restore_cost_keyword(en_face_of(card, faces, i).get("oracle_text"), f["text_pt"])

        # Protótipo: o lembrete na faixa do alto da caixa e o resto no papel, como na carta impressa
        # (antes dos lembretes de palavra-chave: "Afinidade por artefatos" sozinha na linha ganha o dela)
        if source == "arena" and card.get("layout") == "prototype" and faces:
            text_pt = prototype_text(faces[0].get("text_pt"), proto_by_card.get(oid, proto_newest))
            cost = prototype_cost(card.get("oracle_text"))
            if text_pt is not None and cost:
                faces[0]["text_pt"] = text_pt
                faces[0]["prototype_cost"] = cost

        # Saga: o número de cada capítulo na frente, para o motor casar capítulo e faixa (e o
        # lembrete do alto das Sagas, das Classes e das batalhas)
        if source == "arena":
            for i, f in enumerate(faces):
                en_face = en_face_of(card, faces, i)
                if "Saga" in en_face.get("type_line", ""):
                    text_pt = saga_chapters(en_face.get("oracle_text"), f.get("text_pt"))
                    if text_pt is None:
                        SAGA_MISMATCH.add(oid)
                    else:
                        f["text_pt"] = top_reminder(en_face.get("oracle_text"), text_pt, reminders)
                # Classe e batalha: o lembrete "(Ganhe o próximo nível…)" e o "(Conforme um Cerco
                # entrar…)" no alto, como na carta impressa
                elif any(t in en_face.get("type_line", "") for t in ("Class", "Battle")) and f.get("text_pt") is not None:
                    f["text_pt"] = top_reminder(en_face.get("oracle_text"), f["text_pt"], reminders)
            # o lembrete de palavra-chave de cada linha, como na carta física ("Arregimentar Orcs 1. (Coloque…)")
            for i, f in enumerate(faces):
                en_face = en_face_of(card, faces, i)
                before = f.get("text_pt")
                f["text_pt"] = add_reminders(en_face.get("oracle_text"), before, face_reminders(oid, en_face.get("type_line"), by_group, by_card))
                added += f["text_pt"] != before

        for i, f in enumerate(faces):
            aw = ability_word_lines(en_face_of(card, faces, i).get("oracle_text"), f.get("text_pt"))
            if aw:
                f["ability_words"] = aw

        # Nome em português: o impresso é o que a comunidade conhece (Liga Magic).
        name_pt = None
        if p:
            pf = printed_faces(p)
            if all(f["name_pt"] and f["name_pt"] != f["name_en"] for f in pf):
                name_pt = " // ".join(f["name_pt"] for f in pf)
        if not name_pt and a:
            name_pt = arena_name_pt(own_faces(card, a["faces"]))
        aliases = {norm(x) for x in [name_pt or "", a and arena_name_pt(own_faces(card, a["faces"])) or ""] if x}

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
                # o texto impresso antes do Magic 2010 segue a terminologia velha ("entra em jogo",
                # "jogar uma mágica"): vale para a carta, nunca de molde para a tradução não oficial
                # (fica no cards.jsonl, que o `faltam.py` lê; o banco só leva as `COLUMNS`)
                "_old_text": source == "impresso" and p["_text"].get("released_at", "") < _REMINDER_SINCE,
                "faces": [
                    {**f, "name_en": f.get("name_en") or en_face_of(card, faces, i).get("name")}
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
    unofficial = add_unofficial(rows, oracle, reminders, by_group, by_card)
    # o lembrete das Salas, na faixa do meio (da dica do Arena, também nas de tradução não oficial)
    log(f"Salas com o lembrete em PT: {add_room_reminders(rows, oracle, raw_hints)}")
    # o Fundir, na faixa do pé (o lembrete oficial das impressas em PT)
    log(f"cartas com Fundir, com o lembrete em PT: {add_fuse_reminders(rows, oracle, by_group)}")
    # a frente das cartas de fundir: o P/R da carta fundida e o lembrete das impressas em PT
    melded, meld_reminders = add_meld_data(rows, oracle, printed)
    log(f"cartas de fundir: {melded} com o P/R da carta fundida, {meld_reminders} com o lembrete em PT")
    log(
        f"cartas: {len(rows)} | texto do Arena: {stats['arena']} | impresso: {stats['impresso']} | "
        f"tradução não oficial: {unofficial} | sem PT: {stats['sem'] - unofficial}"
    )
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
    """Emblema em PT a partir do planeswalker (ou carta) que o cria, nunca traduzido à parte.

    O texto do emblema é o trecho entre aspas de "Você recebe um emblema com "…"" no texto
    da carta de origem; o nome na faixa é o nome dela, como no emblema impresso. A origem do
    texto também vem dela: o emblema de um planeswalker com a tradução não oficial (ADR 0025)
    sai marcado como não oficial.
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


PRINT_COLUMNS = ["id", "oracle_id", "set_code", "set_name", "number", "released", "artist", "frame", "effects", "border", "layout", "highres", "promo", "mana_cost", "has_pt", "two_sided", "supported", "sides", "text_flavor", "flavor_name", "indicator", "flavor_pt", "watermark"]

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
        # (a face Saga de uma carta de duas faces com os capítulos que não batem: só ela sai como está;
        # e a face planeswalker com as habilidades que não batem, também)
        for bad, by_print in ((SAGA_MISMATCH, SAGA_SIDES), (PW_FACE_MISMATCH, PW_SIDES)):
            if p["oracle_id"] in bad and p.get("sides"):
                for i in by_print.get(p["id"], ()):
                    p["sides"][i]["supported"] = False
                if p["layout"] == "transform":
                    p["supported"] = p["sides"][0]["supported"]
    log(f"planeswalkers com habilidades que não batem (saem como estão): {len(PW_MISMATCH)}")
    log(f"Sagas com capítulos que não batem (saem como estão): {len(SAGA_MISMATCH)}")
    log(f"faces planeswalker de cartas de transformar que não batem (saem como estão): {len(PW_FACE_MISMATCH)}")
    log(f"artes com o flavor da impressão do texto em PT: {mark_text_flavor(rows, prints, FLAVORS)}")
    log(f"artes com o flavor de outra versão do Arena: {mark_print_flavors(rows, prints, ARENA_FLAVORS)}")
    write(rows, prints)


if __name__ == "__main__":
    main()
