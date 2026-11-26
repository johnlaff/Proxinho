"""Testes do pipeline de dados: python3 -m unittest discover -s data/pipeline."""

import re
import unittest
from unittest import mock

import build
import faltam
from build import add_meld_data, is_meld_result, meld_supported, own_faces, join_keyword_lines, leveler_level, leveler_supported, mutate_supported, restore_cost_keyword, FUSE_EN, add_fuse_reminders, fuse_supported, without_fuse, aftermath_supported, split_supported, swap_half_names, fix_ring_a, add_room_reminders, arena_entry, arena_name, arena_name_pt, half_names, en_face_of, room_reminder, room_supported, without_room_reminder, emblem_face, subtype_mismatches, line_key, mold, fill_mold, official_lines, official_types, translate_type, unofficial_faces, add_unofficial, says_all, ability_word_lines, arena_reminders, extract_hints, hint_reminder, refers_to_self, join_station, station_level, station_supported, adventure_supported, prepare_supported, class_supported, drop_level_marks, is_arena_marker, arena_symbols, balance_parens, borderless_supported, cites_alt_name, clean_rules, drop_invisible, drop_repeated_words, emblem_text, fix_glued_symbols, fix_arena_typos, fix_breaks, fix_spacing, flavor_key, frame_supported, is_intrinsic_mana, keep_earlier_flavor, mark_print_flavors, mark_text_flavor, print_flavor, pick_printed, print_row, real_image, printed_faces, printed_has_text, pw_costs, add_reminders, face_reminders, reminder_texts, saga_chapters, saga_supported, top_reminder, top_reminders, token_face_key, token_key, transcribe, type_group


class CitesAltName(unittest.TestCase):
    def test_texto_com_o_nome_alternativo(self) -> None:
        # Rishkar no Arena (Star Trek): "Quando Keenser entrar…"
        self.assertTrue(cites_alt_name("Quando Keenser entrar, coloque um marcador", ["Keenser", None]))

    def test_so_a_parte_antes_da_virgula(self) -> None:
        self.assertTrue(cites_alt_name("Toda vez que Zidane Tribal causar dano", ["Zidane Tribal, Thief Prince"]))

    def test_texto_sem_o_nome(self) -> None:
        self.assertFalse(cites_alt_name("Quando esta criatura entrar, compre um card.", ["Keenser", "Keenser"]))

    def test_sem_nome_alternativo(self) -> None:
        self.assertFalse(cites_alt_name("qualquer texto", [None, ""]))


class Transcribe(unittest.TestCase):
    """As impressões em PT que o Scryfall tem só na imagem, transcritas da imagem (ADR 0026)."""

    def setUp(self) -> None:
        self.table = {
            "dgm/60": {
                "name": "Bronzebeak Moa",
                "oracle_text": "Whenever another creature you control enters, this creature gets +3/+3 until end of turn.",
                "printed_name": "Moa do Bico de Bronze",
                "printed_type_line": "Criatura — Ave",
                "printed_text": "Toda vez que outra criatura entra no campo de batalha sob seu controle, Moa do Bico de Bronze recebe +3/+3 até o final do turno.",
                "flavor_text": "Elas lutam pelo seu lar com mais lealdade do que qualquer recruta.",
            },
            "phpr/2": {"name": "Sewers of Estark", "printed_name": "Esgotos de Estark"},
        }

    def card(self, **kw) -> dict:
        # o Scryfall tem só a imagem, e o nome errado
        return {"set": "dgm", "collector_number": "60", "name": "Bronzebeak Moa", "lang": "pt", "printed_name": "Mao do Bico de Bronze", "printed_text": None, **kw}

    def test_a_impressao_so_com_a_imagem_ganha_o_texto_transcrito(self) -> None:
        c = transcribe(self.card(), self.table)
        self.assertTrue(printed_has_text(c))
        face = printed_faces(c)[0]
        self.assertEqual(face["name_pt"], "Moa do Bico de Bronze")
        self.assertEqual(face["type_pt"], "Criatura — Ave")
        self.assertTrue(face["text_pt"].startswith("Toda vez que outra criatura"))
        self.assertEqual(face["flavor_pt"], "Elas lutam pelo seu lar com mais lealdade do que qualquer recruta.")
        self.assertEqual(c["_transcribed"], "dgm/60")

    def test_o_texto_do_scryfall_ganha(self) -> None:
        for kw in ({"printed_type_line": "Criatura — Ave"}, {"printed_text": "Voar"}):
            c = self.card(**kw)
            self.assertIs(transcribe(c, self.table), c)

    def test_so_a_carta_de_mesmo_nome_no_numero(self) -> None:
        c = self.card(name="Boros Mastiff")
        self.assertIs(transcribe(c, self.table), c)
        c = self.card(collector_number="61")
        self.assertIs(transcribe(c, self.table), c)

    def test_so_o_nome(self) -> None:
        # Sewers of Estark (PHPR 2): o texto da carta é das regras de 1995 ("baixe antes da
        # defesa ter sido escolhida"); fica só o nome, e a carta segue com a tradução não oficial
        c = transcribe({"set": "phpr", "collector_number": "2", "name": "Sewers of Estark", "printed_text": None}, self.table)
        self.assertEqual(printed_faces(c)[0]["name_pt"], "Esgotos de Estark")
        self.assertFalse(printed_has_text(c))

    def test_nomes_das_metades_que_o_scryfall_tem_em_ingles(self) -> None:
        # Confusão // Bagunça (TSR 186): o Scryfall tem o texto em PT e os nomes em inglês
        table = {"tsr/186": {"name": "Rough // Tumble", "face_names": ["Confusão", "Bagunça"]}}
        faces = [
            {"name": "Rough", "printed_name": "Rough", "printed_text": "Confusão causa 2 pontos de dano a cada criatura sem voar."},
            {"name": "Tumble", "printed_name": "Tumble", "printed_text": "Bagunça causa 6 pontos de dano a cada criatura com voar."},
        ]
        card = {"set": "tsr", "collector_number": "186", "name": "Rough // Tumble", "card_faces": faces}
        c = transcribe(card, table)
        self.assertEqual([f["name_pt"] for f in printed_faces(c)], ["Confusão", "Bagunça"])
        self.assertEqual(c["_transcribed"], "tsr/186")
        # com o nome em PT no Scryfall, fica o dele
        named = {**card, "card_faces": [{**f, "printed_name": n} for f, n in zip(faces, ["Confusão", "Bagunça"])]}
        self.assertIs(transcribe(named, table), named)
        # o nome inteiro da carta em inglês em cada metade (Saciar // Exagerar, NCC 46)
        whole = {**card, "card_faces": [{**f, "printed_name": "Rough // Tumble"} for f in faces]}
        self.assertEqual([f["name_pt"] for f in printed_faces(transcribe(whole, table))], ["Confusão", "Bagunça"])
        # outra carta no número, nada muda
        other = {**card, "name": "Boom // Bust"}
        self.assertIs(transcribe(other, table), other)

    def test_transcritas_com_os_mesmos_numeros_e_simbolos_do_oracle(self) -> None:
        mark = re.compile(r"\{[^}]+\}|[+-]?\d+/[+-]?\d+|[+-]?\d+|\bX\b")
        table = build.load_transcribed()
        self.assertGreater(len(table), 80)
        for key, t in table.items():
            self.assertRegex(key, r"^[a-z0-9]+/[0-9a-z]+$")
            if "face_names" in t:
                # só os nomes das metades de uma carta dividida (ver transcribe_face_names)
                self.assertEqual(set(t), {"name", "face_names"}, key)
                self.assertEqual(len(t["face_names"]), len(t["name"].split(" // ")), key)
                continue
            self.assertTrue(t["name"] and t["printed_name"], key)
            self.assertLessEqual(set(t), {"name", "oracle_text", "printed_name", "printed_type_line", "printed_text", "flavor_text"}, key)
            if "printed_text" not in t:
                continue
            self.assertEqual(sorted(mark.findall(t["oracle_text"])), sorted(mark.findall(t["printed_text"])), key)
            self.assertTrue(t["printed_type_line"][0].isupper() and "  " not in t["printed_text"], key)
            self.assertTrue(all(x.strip() == x and x for x in t["printed_text"].split("\n")) or t["printed_text"] == "", key)


class PickPrinted(unittest.TestCase):
    """Selesnya Guildmage: a de 2005 (RAV) é a única em alta, mas tem texto velho."""

    def cards(self) -> list[dict]:
        base = {"oracle_id": "o1", "printed_name": "Mago da Guilda Selesnya", "name": "Selesnya Guildmage"}
        return [
            {**base, "set": "rav", "collector_number": "1", "released_at": "2005-10-07", "highres_image": True,
             "printed_type_line": "Criatura - Mago Elfo", "printed_text": "Coloque em jogo uma ficha"},
            {**base, "set": "rvr", "collector_number": "2", "released_at": "2024-01-12", "highres_image": False,
             "printed_type_line": "Criatura — Elfo Mago", "printed_text": "Crie uma ficha"},
        ]

    def test_imagem_em_alta_e_texto_mais_novo(self) -> None:
        p = pick_printed(self.cards())["o1"]
        self.assertEqual(p["set"], "rav")
        self.assertEqual(p["_text"]["set"], "rvr")
        self.assertEqual(printed_faces(p)[0]["text_pt"], "Crie uma ficha")

    def test_impressao_sem_tipo_nao_vale_para_o_texto(self) -> None:
        cards = self.cards()
        cards.append({**cards[1], "set": "sld", "released_at": "2025-01-01", "printed_type_line": None})
        self.assertEqual(pick_printed(cards)["o1"]["_text"]["set"], "rvr")

    def test_imagem_que_o_scryfall_nao_tem(self) -> None:
        # Phyrexian Altar (INV em PT): o Scryfall põe a carta em inglês com o selo "Localized
        # Image Not Available"; a impressão serve pelo nome, mas não como imagem em PT
        altar = {"oracle_id": "o2", "printed_name": "Altar Phyrexiano", "name": "Phyrexian Altar", "set": "inv",
                 "collector_number": "306", "released_at": "2000-10-02", "image_status": "placeholder"}
        self.assertFalse(real_image(altar))
        self.assertEqual(pick_printed([altar])["o2"]["set"], "inv")
        # com uma impressão de imagem de verdade, ela ganha, mesmo mais velha e sem alta resolução
        badger = {"oracle_id": "o3", "set": "8ed", "released_at": "2003-07-28", "image_status": "placeholder", "highres_image": False}
        real = {**badger, "set": "phpr", "released_at": "1997-08-01", "image_status": "lowres"}
        self.assertEqual(pick_printed([badger, real])["o3"]["set"], "phpr")
        self.assertTrue(real_image(self.cards()[0]))

    def test_hifen_do_tipo_vira_travessao(self) -> None:
        self.assertEqual(printed_faces(self.cards()[0])[0]["type_pt"], "Criatura — Mago Elfo")

    def test_impressao_so_com_imagem_nao_tem_traducao(self) -> None:
        # Advent of the Wurm (DGM em PT): o Scryfall só tem a imagem
        self.assertFalse(printed_has_text({"name": "Advent of the Wurm", "lang": "pt"}))
        self.assertTrue(printed_has_text(self.cards()[1]))

    def test_criatura_sem_habilidades_tem_texto_vazio(self) -> None:
        # Great-Horn Krushok (FRF em PT): sem `printed_text`, mas com tipo e flavor
        krushok = {"name": "Great-Horn Krushok", "printed_name": "Krushok de Chifre Longo", "oracle_text": "",
                   "printed_type_line": "Criatura — Besta", "flavor_text": "Perfeitamente compatíveis…"}
        self.assertEqual(printed_faces(krushok)[0]["text_pt"], "")
        # com habilidades no Oracle, a falta do texto continua sendo falta
        self.assertIsNone(printed_faces({**krushok, "oracle_text": "Flying"})[0]["text_pt"])


class ArenaSymbols(unittest.TestCase):
    def test_simbolos(self) -> None:
        self.assertEqual(arena_symbols("{o2oU}, {oT}: compre"), "{2}{U}, {T}: compre")

    def test_chave_escapada(self) -> None:
        # Countervailing Winds no Arena
        self.assertEqual(arena_symbols("pague \\\\{o1\\\\} para cada card"), "pague {1} para cada card")

    def test_cor_em_minuscula(self) -> None:
        # Aeromunculus no Arena: {o2oGou}
        self.assertEqual(arena_symbols("{o2oGou}: Adaptar 1."), "{2}{G}{U}: Adaptar 1.")

    def test_chave_que_nao_e_simbolo_fica(self) -> None:
        self.assertEqual(arena_symbols("{nome}"), "{nome}")


class PwCosts(unittest.TestCase):
    ORACLE = "Kicker {2}\nWhen Jace enters, if Jace was kicked, create a token.\n+1: Scry 2.\n0: Draw a card and reveal it."

    def test_custo_do_oracle_na_frente_da_habilidade_do_arena(self) -> None:
        # Jace, Mago dos Espelhos: o Arena traz as habilidades sem o custo
        self.assertEqual(
            pw_costs(self.ORACLE, "Reforçar {2}\nQuando Jace entrar, crie uma ficha.\nUse vidência 2.\nCompre um card."),
            "Reforçar {2}\nQuando Jace entrar, crie uma ficha.\n+1: Use vidência 2.\n0: Compre um card.",
        )

    def test_texto_impresso_ja_tem_o_custo(self) -> None:
        self.assertEqual(
            pw_costs("+1: Scry 2.\n−3: Draw.", "+1: Use vidência 2.−3: Compre."),
            "+1: Use vidência 2.\n−3: Compre.",
        )

    def test_numero_de_paragrafos_diferente(self) -> None:
        self.assertIsNone(pw_costs(self.ORACLE, "Reforçar {2}\nUse vidência 2."))


class DropInvisible(unittest.TestCase):
    def test_marca_de_direcao_antes_do_custo(self) -> None:
        # Chandra, Acolyte of Flame: "\u200e-2: Você pode conjurar…" no Arena saía "−2: -2: Você…"
        arena = "Coloque um marcador.\nCrie duas fichas.\n\u200e-2: Você pode conjurar o card."
        oracle = "0: Put a counter.\n0: Create two tokens.\n−2: You may cast target card."
        self.assertEqual(
            pw_costs(oracle, drop_invisible(arena)),
            "0: Coloque um marcador.\n0: Crie duas fichas.\n-2: Você pode conjurar o card.",
        )

    def test_linha_so_com_a_marca_some(self) -> None:
        # Call Damage Control: o texto acabava numa linha só com a marca
        self.assertEqual(drop_invisible("Procure um card de terreno.\n\u200e"), "Procure um card de terreno.")
        self.assertEqual(drop_invisible("\u200e\"Quando injetar o viscus"), "\"Quando injetar o viscus")

    def test_texto_sem_marca_fica_igual(self) -> None:
        for t in ("Voar\n\nAterragem — Compre um card.", None, ""):
            self.assertEqual(drop_invisible(t), t)


class FixBreaks(unittest.TestCase):
    def test_habilidades_coladas(self) -> None:
        # Blighted Steppe (BFZ em PT)
        self.assertEqual(
            fix_breaks("{T}: Adicione {1} à sua reserva de mana.{3}{W}, {T}, Sacrifique"),
            "{T}: Adicione {1} à sua reserva de mana.\n{3}{W}, {T}, Sacrifique",
        )
        self.assertEqual(fix_breaks("entra virada.Quando ela entra"), "entra virada.\nQuando ela entra")
        self.assertEqual(fix_breaks("de mana.)Vale Afundado entra"), "de mana.)\nVale Afundado entra")

    def test_palavra_chave_colada(self) -> None:
        # Akoum Hellkite (BFZ) e Sensory Deprivation (M14) em PT
        self.assertEqual(fix_breaks("VoarAterragem — Toda vez"), "Voar\nAterragem — Toda vez")
        self.assertEqual(fix_breaks("Encantar criaturaA criatura encantada"), "Encantar criatura\nA criatura encantada")
        self.assertEqual(fix_breaks("LampejoVoarQuando"), "Lampejo\nVoar\nQuando")

    def test_nomes_com_maiuscula_no_meio_ficam(self) -> None:
        self.assertEqual(fix_breaks("Quando Dr. McCoy entrar"), "Quando Dr. McCoy entrar")
        self.assertEqual(fix_breaks("Fantasma de Ramirez DePietro causar dano"), "Fantasma de Ramirez DePietro causar dano")

    def test_espaco_do_italico_no_flavor(self) -> None:
        self.assertEqual(fix_breaks("Ensinamentos de SantoTraft", flavor=True), "Ensinamentos de Santo Traft")
        self.assertEqual(fix_breaks("As bestas deWirewood", flavor=True), "As bestas de Wirewood")
        self.assertEqual(fix_breaks("— General Douglas MacArthur", flavor=True), "— General Douglas MacArthur")
        self.assertEqual(fix_breaks("as ruas de Qo'noS", flavor=True), "as ruas de Qo'noS")

    def test_texto_certo_fica(self) -> None:
        self.assertEqual(fix_breaks("Voar. Quando esta criatura entra, compre 1.5 cards."), "Voar. Quando esta criatura entra, compre 1.5 cards.")

    def test_assinatura_do_flavor(self) -> None:
        self.assertEqual(fix_breaks('"Isso aqui não é diferente."— Mina', flavor=True), '"Isso aqui não é diferente."\n— Mina')
        self.assertEqual(fix_breaks('"Certo."\n— Mina', flavor=True), '"Certo."\n— Mina')
        # Scavenger Grounds: travessão no meio da frase não é assinatura
        self.assertEqual(fix_breaks("“A Queimadura”—outrora uma região", flavor=True), "“A Queimadura”—outrora uma região")


class FixArenaTypos(unittest.TestCase):
    def test_mais_repetido_no_bonus(self) -> None:
        # Colorstorm Stallion (SOS) no Arena: "recebe +1/++1"
        self.assertEqual(fix_arena_typos("esta criatura recebe +1/++1 até o final do turno."), "esta criatura recebe +1/+1 até o final do turno.")
        self.assertEqual(fix_arena_typos("Delírio — Esta criatura recebe +2/++2 enquanto"), "Delírio — Esta criatura recebe +2/+2 enquanto")

    def test_nomes_com_mais_ficam(self) -> None:
        # magias de Final Fantasy: "Cura++", "Fogo++"
        self.assertEqual(fix_arena_typos("•Cura++ — {o3oW} — As permanentes"), "•Cura++ — {o3oW} — As permanentes")
        self.assertEqual(fix_arena_typos("recebe +1/+1 e -X/+0"), "recebe +1/+1 e -X/+0")

    def test_ponto_no_meio_da_frase(self) -> None:
        # Destino do Avatar (TLA): depois do bônus não há pontuação
        self.assertEqual(
            fix_arena_typos("A criatura encantada recebe +1/+1. por cada card de criatura"),
            "A criatura encantada recebe +1/+1 por cada card de criatura",
        )
        # Jan Jansen (HBG): entre custos é vírgula
        self.assertEqual(fix_arena_typos("{oT}. sacrifique uma criatura artefato: Crie"), "{oT}, sacrifique uma criatura artefato: Crie")
        # Agentes Dai Li (TLA): antes de "e depois" também
        self.assertEqual(
            fix_arena_typos("use dobra de terra 1. e depois use dobra de terra 1."),
            "use dobra de terra 1, e depois use dobra de terra 1.",
        )

    def test_ponto_antes_de_minuscula_que_fica(self) -> None:
        # siglas e frases que começam com minúscula: mexer pede trocar letra, não pontuação
        self.assertEqual(fix_arena_typos("Pague 3 pontos de vida: M.O.D.O.K. acoberta."), "Pague 3 pontos de vida: M.O.D.O.K. acoberta.")
        self.assertEqual(fix_arena_typos("de seus donos. por cada oponente"), "de seus donos. por cada oponente")
        self.assertEqual(fix_arena_typos("Fim do turno. Compre um card."), "Fim do turno. Compre um card.")


class BalanceParens(unittest.TestCase):
    def test_parentese_de_abrir_que_falta(self) -> None:
        # Dismantling Blow (MH1 em PT): o lembrete do Reforçar saía sem itálico, com ")" solto
        self.assertEqual(
            balance_parens("Reforçar {2}{U} Você pode pagar {2}{U} conforme conjura esta mágica.)\nDestrua o artefato alvo."),
            "Reforçar {2}{U} (Você pode pagar {2}{U} conforme conjura esta mágica.)\nDestrua o artefato alvo.",
        )

    def test_segundo_lembrete_sem_abrir(self) -> None:
        # Spark Elemental (10E em PT)
        self.assertEqual(
            balance_parens("Atropelar, ímpeto (Se esta criatura… defensor.) Esta criatura pode atacar e {T} assim que entra.)"),
            "Atropelar, ímpeto (Se esta criatura… defensor.) (Esta criatura pode atacar e {T} assim que entra.)",
        )

    def test_parentese_de_fechar_que_falta(self) -> None:
        # Mahamoti Djinn (ORI em PT)
        self.assertEqual(balance_parens("Voar (Esta criatura só pode ser bloqueada por criaturas com voar ou alcance.\nVigilância"),
                         "Voar (Esta criatura só pode ser bloqueada por criaturas com voar ou alcance.)\nVigilância")

    def test_lembrete_quebrado_em_duas_linhas(self) -> None:
        # Fangs of Kalonia (MH3 em PT): quebra no meio do lembrete e fecho repetido
        self.assertEqual(
            balance_parens('Sobrecarga {4}{G}{G} (Você pode conjurar esta mágica.\nSe fizer isso, substitua "na criatura alvo".) ".)'),
            'Sobrecarga {4}{G}{G} (Você pode conjurar esta mágica. Se fizer isso, substitua "na criatura alvo".)',
        )

    def test_texto_certo_fica_igual(self) -> None:
        texto = "Voar (Esta criatura só pode ser bloqueada por criaturas com voar ou alcance.)\n{T}: Adicione {G}."
        self.assertEqual(balance_parens(texto), texto)
        self.assertIsNone(balance_parens(None))


class DropRepeatedWords(unittest.TestCase):
    def test_palavra_repetida(self) -> None:
        # Always Watching (SIR no Arena) e o "que que" de umas dez cartas
        self.assertEqual(drop_repeated_words("As criaturas criaturas não ficha que você controla"),
                         "As criaturas não ficha que você controla")
        self.assertEqual(drop_repeated_words("Toda vez que que esta criatura ou ou outra"), "Toda vez que esta criatura ou outra")

    def test_nomes_e_palavras_diferentes_ficam(self) -> None:
        self.assertEqual(drop_repeated_words("Desertores de Jeong Jeong"), "Desertores de Jeong Jeong")
        self.assertEqual(drop_repeated_words("queque que"), "queque que")

    def test_texto_de_regras_inteiro(self) -> None:
        self.assertEqual(clean_rules("Reforçar {2}{U} Você pode pagar pagar {2}{U}.)"), "Reforçar {2}{U} (Você pode pagar {2}{U}.)")


class FixGluedSymbols(unittest.TestCase):
    def test_habilidade_ativada_colada_na_palavra_chave(self) -> None:
        # texto impresso do Scryfall (Beastcaller Savant, BFZ; Truefire Paladin, Blessing)
        self.assertEqual(fix_glued_symbols("Ímpeto{T}: Adicione um mana"), "Ímpeto\n{T}: Adicione um mana")
        self.assertEqual(fix_glued_symbols("Vigilância{R}{W}: Paladino de Fogo Verdadeiro"), "Vigilância\n{R}{W}: Paladino de Fogo Verdadeiro")
        self.assertEqual(fix_glued_symbols("Encantar criatura{W}: A criatura encantada"), "Encantar criatura\n{W}: A criatura encantada")

    def test_espaco_que_falta_antes_do_simbolo(self) -> None:
        # erro de digitação do Arena (emblema da Liliana of the Dark Realms, Spectral Denial)
        self.assertEqual(fix_glued_symbols("{T}: Adicione{B}{B}{B}{B}."), "{T}: Adicione {B}{B}{B}{B}.")
        self.assertEqual(fix_glued_symbols("a menos que seu controlador pague{X}."), "a menos que seu controlador pague {X}.")

    def test_texto_certo_fica_igual(self) -> None:
        for t in ["Reforçar {2}{U}", "‘{T}: Adicione {B}.’", "{2}, {T}: Compre um card.", "Custo {X}"]:
            self.assertEqual(fix_glued_symbols(t), t)

    def test_entra_no_conserto_das_regras(self) -> None:
        self.assertEqual(clean_rules("Voar{2}: Kami do Repique ganha"), "Voar\n{2}: Kami do Repique ganha")


class FixSpacing(unittest.TestCase):
    def test_virgula_colada_na_palavra_seguinte(self) -> None:
        # Sokka, Swordmaster (Arena) e o flavor do Disciple of Grace
        self.assertEqual(clean_rules("No início do combate no seu turno,anexe até um Equipamento"), "No início do combate no seu turno, anexe até um Equipamento")
        self.assertEqual(fix_breaks("Olhando a paisagem à frente,o terror não passava", flavor=True), "Olhando a paisagem à frente, o terror não passava")
        for t in ("{2},{T}: Compre um card.", "1,5 ponto", "Voar, vigilância"):
            self.assertEqual(fix_spacing(t), t)

    def test_espaco_antes_do_ponto_e_da_virgula(self) -> None:
        self.assertEqual(fix_spacing("crie uma ficha de criatura Zumbi preta 2/2 ."), "crie uma ficha de criatura Zumbi preta 2/2.")
        self.assertEqual(fix_spacing("Amoque preta 2/2 , sendo X"), "Amoque preta 2/2, sendo X")
        self.assertEqual(fix_spacing("anexada a ela\" ."), "anexada a ela\".")
        self.assertEqual(fix_spacing("copie esta mágica .)"), "copie esta mágica.)")

    def test_virgula_grudada_na_palavra_seguinte(self) -> None:
        self.assertEqual(fix_spacing("que você controla ,em vez de"), "que você controla, em vez de")

    def test_pontuacao_dobrada(self) -> None:
        self.assertEqual(fix_spacing("{X},, {T}: Vire"), "{X}, {T}: Vire")
        self.assertEqual(fix_spacing("o controle de Primoc de Elo Mental.."), "o controle de Primoc de Elo Mental.")

    def test_reticencias_e_texto_certo_ficam(self) -> None:
        for t in ("Arremessar... — {3}, solte", "... Pegar — No início", "(Boas-vindas ao...)", "Pague {1}, {T}: compre 2 cards."):
            self.assertEqual(fix_spacing(t), t)

    def test_entra_no_conserto_das_regras(self) -> None:
        self.assertEqual(clean_rules("ela receberá +1/+2 .\nEnquanto"), "ela receberá +1/+2.\nEnquanto")


class FrameSupported(unittest.TestCase):
    """Moldura 2015 comum entra; a de Game Day, com a arte atrás da caixa, não."""

    base = {"frame": "2015", "layout": "normal", "border_color": "black", "type_line": "Creature — Dragon"}

    def test_moldura_comum(self) -> None:
        self.assertTrue(frame_supported({**self.base, "promo_types": ["setpromo"]}))

    def test_serie_spree_tem_a_moldura_comum(self) -> None:
        # a aba do "+" fica fora da barra do nome (Requisition Raid OTJ 26), também na arte estendida
        self.assertTrue(frame_supported({**self.base, "frame_effects": ["spree"]}))
        self.assertTrue(frame_supported({**self.base, "frame_effects": ["extendedart", "spree"]}))

    def test_game_day_com_a_arte_atras_da_caixa(self) -> None:
        # Thunderbreak Regent (pdtk 162): o Scryfall não marca full_art
        self.assertFalse(frame_supported({**self.base, "full_art": False, "promo_types": ["setpromo", "gameday"]}))

    def test_game_day_do_wizards_play_network_tem_moldura_comum(self) -> None:
        # Consider (pw22 1)
        self.assertTrue(frame_supported({**self.base, "promo_types": ["wizardsplaynetwork", "gameday"]}))

    def test_moldura_desenhada_a_mao_na_secret_lair(self) -> None:
        # Sol Ring (sld 2132) e Virtue of Persistence (sld 2129, aventura) do Ricardo Cavolo: o
        # Scryfall marca 2015 sem efeito, mas nome, texto e moldura são desenho dele
        cavolo = {"set": "sld", "artist": "Ricardo Cavolo"}
        self.assertFalse(frame_supported({**self.base, **cavolo}))
        faces = [{"name": "Virtue of Persistence"}, {"name": "Locthwain Scorn"}]
        adventure = {"frame": "2015", "layout": "adventure", "border_color": "black", "card_faces": faces}
        self.assertTrue(adventure_supported(adventure))
        self.assertFalse(adventure_supported({**adventure, **cavolo}))
        # fora da Secret Lair, o mesmo artista na moldura comum continua, e a sem borda dele na
        # moldura padrão também (Xanathar, sld 1785)
        self.assertTrue(frame_supported({**self.base, "set": "mh3", "artist": "Ricardo Cavolo"}))
        borderless = {**self.base, **cavolo, "border_color": "borderless", "frame_effects": ["legendary", "inverted"]}
        self.assertTrue(borderless_supported(borderless))

    def test_moldura_rabiscada_na_secret_lair(self) -> None:
        # a série do Deadpool (sld IFIYW-1 a 10): adesivos e escrita à mão por cima do nome, do
        # texto e da moldura; o Deadly Dispute ficava com um retângulo de papel no tipo
        for number in ("IFIYW-1", "IFIYW-6", "IFIYW-10"):
            self.assertFalse(frame_supported({**self.base, "set": "sld", "collector_number": number}))
        # o mesmo número fora da Secret Lair não diz nada
        self.assertTrue(frame_supported({**self.base, "set": "mh3", "collector_number": "IFIYW-1"}))

    def test_moldura_de_2003(self) -> None:
        # ADR 0024: a moldura comum de 2003 a 2014 entra (Uncontrollable Anger 10E 244)
        m03 = {**self.base, "frame": "2003"}
        self.assertTrue(frame_supported(m03))
        # o céu estrelado de Theros fica só na moldura em volta: barras e caixa iguais
        # (Archetype of Endurance BNG 116)
        self.assertTrue(frame_supported({**m03, "frame_effects": ["enchantment"]}))
        # com outro efeito o desenho muda: lápide de Odyssey, milagre, cores trocadas
        for effect in ("tombstone", "miracle", "colorshifted"):
            self.assertFalse(frame_supported({**m03, "frame_effects": [effect]}), effect)
            self.assertFalse(frame_supported({**m03, "frame_effects": ["enchantment", effect]}), effect)
        # planeswalker de 2003 tem caixa própria
        self.assertFalse(frame_supported({**m03, "type_line": "Legendary Planeswalker — Jace"}))
        # marca-d'água lisa entra: o motor apaga só as letras e a rede neural refaz a marca por
        # baixo delas (Darksteel Relic NPH 134, Wojek Halberdiers GTC 208)
        for mark in ("mirran", "phyrexian", "golgari", "boros", "dci", "wotc", "set", "colorpie"):
            self.assertTrue(frame_supported({**m03, "watermark": mark}), mark)
        # os logotipos grandes das promos, não: a rede neural os refazia em borrões, e o "FNM"
        # deixava pedaços do inglês (Terror F03 8)
        for mark in ("fnm", "arena", "protour", "grandprix", "mtg", "junior", "scholarship", "herospath"):
            self.assertFalse(frame_supported({**m03, "watermark": mark}), mark)
        # na M15 a marca-d'água não muda nada aqui
        self.assertTrue(frame_supported({**self.base, "watermark": "golgari"}))
        # bordas branca e preta entram; prateada (Unhinged) e dourada (World Championship), não
        self.assertTrue(frame_supported({**m03, "border_color": "white"}))
        for border in ("silver", "gold"):
            self.assertFalse(frame_supported({**m03, "border_color": border}), border)
        # os outros layouts de 2003 continuam de fora
        for layout in ("split", "flip", "leveler", "transform"):
            self.assertFalse(frame_supported({**m03, "layout": layout}), layout)
        # Champs and States: arte atrás do texto (Rakdos Guildmage PCMP 3); Secret Lair espelhada
        # (Viscera Seer SLD VS). Na M15 as duas coleções seguem como antes
        for code in ("pcmp", "sld"):
            self.assertFalse(frame_supported({**m03, "set": code}), code)
            self.assertTrue(frame_supported({**self.base, "set": code}), code)


    def test_moldura_antiga(self) -> None:
        # ADR 0031: a moldura de 1997 a 2003 e das retrô entra (Catastrophe USG 6)
        old = {**self.base, "frame": "1997"}
        self.assertTrue(frame_supported(old))
        self.assertTrue(frame_supported({**old, "border_color": "white"}))
        # a lápide de Odyssey fica antes do nome, e o nome em PT começa depois dela (Seize the Day,
        # ODY 220); os outros efeitos mudam o desenho
        self.assertTrue(frame_supported({**old, "frame_effects": ["tombstone"]}))
        self.assertFalse(frame_supported({**old, "frame_effects": ["tombstone", "legendary"]}))
        # marca-d'água no meio da caixa: os logotipos das promos e o "wotc" das de 30 anos
        for mark in ("wotc", "arena", "dci", "junior"):
            self.assertFalse(frame_supported({**old, "watermark": mark}), mark)
        # planeswalker retrô (MH3) tem caixa própria; as de World Championship têm borda dourada
        self.assertFalse(frame_supported({**old, "type_line": "Legendary Planeswalker — Urza"}))
        self.assertFalse(frame_supported({**old, "border_color": "gold"}))
        for layout in ("split", "transform", "token"):
            self.assertFalse(frame_supported({**old, "layout": layout}), layout)
        # Secret Lair na antiga: o tipo em outras letras (SLD 2517)
        self.assertFalse(frame_supported({**old, "set": "sld"}))

    def test_moldura_de_1993(self) -> None:
        # ADR 0039: a moldura de Alpha a Alliances entra (Serra Angel 3ED 40, Holy Armor LEB 24),
        # com borda preta ou branca
        m93 = {**self.base, "frame": "1993"}
        self.assertTrue(frame_supported(m93))
        self.assertTrue(frame_supported({**m93, "border_color": "white", "set": "4ed"}))
        # as douradas (Pro Tour Collector Set, World Championship) ficam de fora pela borda, e os
        # outros layouts também
        self.assertFalse(frame_supported({**m93, "border_color": "gold", "set": "ptc"}))
        self.assertFalse(frame_supported({**m93, "layout": "token"}))
        # a DragonCon (uma linha a mais na caixa) e as de comemoração têm outro desenho
        for code in ("pdrc", "pcel"):
            self.assertFalse(frame_supported({**m93, "set": code}), code)
        # efeito ou marca-d'água: nenhuma impressão de 1993 tem, e um desenho novo não entra sozinho
        self.assertFalse(frame_supported({**m93, "frame_effects": ["legendary"]}))
        self.assertFalse(frame_supported({**m93, "watermark": "wotc"}))


class BorderlessSupported(unittest.TestCase):
    """Arte sem borda entra só na moldura padrão, com a caixa escura ("inverted")."""

    base = {"frame": "2015", "layout": "normal", "border_color": "borderless", "type_line": "Creature — Dragon", "frame_effects": ["inverted"]}

    def test_moldura_padrao(self) -> None:
        self.assertTrue(borderless_supported(self.base))
        self.assertTrue(borderless_supported({**self.base, "frame_effects": ["inverted", "legendary"]}))
        self.assertTrue(borderless_supported({**self.base, "frame_effects": ["enchantment", "inverted"]}))

    def test_sem_caixa_escura_e_moldura_propria(self) -> None:
        # Invocações de Amonkhet (MP2), Mythic Edition: sem borda, mas com desenho próprio
        self.assertFalse(borderless_supported({**self.base, "frame_effects": []}))

    def test_efeitos_de_outro_desenho(self) -> None:
        for extra in ("showcase", "miracle", "companion", "fullart", "etched"):
            self.assertFalse(borderless_supported({**self.base, "frame_effects": ["inverted", extra]}), extra)

    def test_arte_cheia_sem_texto_e_tipos_com_caixa_propria(self) -> None:
        self.assertFalse(borderless_supported({**self.base, "full_art": True}))
        self.assertFalse(borderless_supported({**self.base, "textless": True}))
        self.assertFalse(borderless_supported({**self.base, "type_line": "Legendary Planeswalker — Jace"}))
        self.assertFalse(borderless_supported({**self.base, "type_line": "Enchantment — Saga"}))
        self.assertFalse(borderless_supported({**self.base, "keywords": ["Station"]}))

    def test_serie_dracula_tem_a_barra_de_tipo_mais_baixa(self) -> None:
        # Voldaren Estate (VOW 403) e Falkenrath Forebear (VOW 334), da série Drácula: caixa curta
        self.assertFalse(borderless_supported({**self.base, "promo_types": ["draculaseries", "buyabox"]}))
        self.assertFalse(borderless_supported({**self.base, "promo_types": ["draculaseries", "boosterfun"]}))
        self.assertTrue(borderless_supported({**self.base, "promo_types": ["boosterfun"]}))

    def test_moldura_com_borda_fica_com_frame_supported(self) -> None:
        self.assertFalse(borderless_supported({**self.base, "border_color": "black"}))
        self.assertFalse(frame_supported(self.base))


class FlavorDeOutraArte(unittest.TestCase):
    """O flavor em PT vale para as artes com o mesmo flavor em inglês da impressão do texto."""

    SPOCK = "In critical moments, men sometimes see exactly what they wish to see."

    def test_mesmo_flavor_marca(self):
        # Spock, Logical Choice: o texto do Arena é da TRC 194; a promo de arte estendida
        # (PMEI 2026-23) tem o mesmo flavor e saía sem nenhum
        rows = [{"oracle_id": "o", "text_print": {"set": "trc", "number": "194"}}]
        prints = [
            {"oracle_id": "o", "_flavor": (self.SPOCK,)},
            {"oracle_id": "o", "_flavor": (flavor_key(f"  {self.SPOCK}\n"),)},
            {"oracle_id": "o", "_flavor": ("Outro flavor.",)},
            {"oracle_id": "o", "_flavor": ("",)},
        ]
        n = mark_text_flavor(rows, prints, {("trc", "194"): (self.SPOCK,)})
        self.assertEqual([p["text_flavor"] for p in prints], [True, True, False, False])
        self.assertEqual(n, 2)

    def test_impressao_do_texto_sem_flavor_nao_marca(self):
        rows = [{"oracle_id": "o", "text_print": {"set": "abc", "number": "1"}}, {"oracle_id": "x", "text_print": None}]
        prints = [{"oracle_id": "o", "_flavor": ("",)}, {"oracle_id": "x", "_flavor": ("A.",)}]
        mark_text_flavor(rows, prints, {("abc", "1"): ("",)})
        self.assertEqual([p["text_flavor"] for p in prints], [False, False])

    def test_codigo_da_colecao_no_arena(self):
        # Dominaria é "DAR" no Arena e "dom" no Scryfall: sem o apelido, o flavor das 184
        # cartas do Arena dessa coleção não saía em arte nenhuma
        rows = [{"oracle_id": "o", "text_print": {"set": "dar", "number": "1"}}]
        prints = [{"oracle_id": "o", "_flavor": ("A.",)}]
        mark_text_flavor(rows, prints, {("dom", "1"): ("A.",)})
        self.assertTrue(prints[0]["text_flavor"])

    def test_flavor_em_ingles_do_arena(self):
        # Kari Zev: o texto do Arena é da Kaladesh Remastered (KLR 133), coleção digital em
        # que o Scryfall não tem flavor; a comparação usa o flavor em inglês do próprio Arena
        rows = [{"oracle_id": "o", "text_print": {"set": "klr", "number": "133"}, "_flavor_ref": ("Aboard her ship, the Dragon's Smile, Kari follows no one's rules but her own.",)}]
        prints = [{"oracle_id": "o", "_flavor": (flavor_key("Aboard her ship, the *Dragon's Smile*, Kari follows no one's rules but her own."),)}]
        mark_text_flavor(rows, prints, {("klr", "133"): ("",)})
        self.assertTrue(prints[0]["text_flavor"])
        self.assertNotIn("_flavor_ref", rows[0])

    def test_versao_nova_sem_flavor(self):
        # Itzquinth, Primogênito de Gishath: a versão mais nova do Arena (LCI 331) não tem
        # flavor; o texto vem dela e o flavor, com a impressão dele, da LCI 230
        old = {"faces": [{"text_pt": "Ímpeto", "flavor_pt": "Os dinossauros…"}], "print": {"set": "lci", "number": "230"}, "flavor_en": ("Dinosaurs…",)}
        new = {"faces": [{"text_pt": "Ímpeto.", "flavor_pt": None}], "print": {"set": "lci", "number": "331"}, "flavor_en": ("",)}
        self.assertTrue(keep_earlier_flavor(new, old))
        self.assertEqual(new["faces"][0], {"text_pt": "Ímpeto.", "flavor_pt": "Os dinossauros…"})
        self.assertEqual(new["print"], {"set": "lci", "number": "230"})
        self.assertEqual(new["flavor_en"], ("Dinosaurs…",))
        # versão nova com flavor próprio, ou anterior sem flavor: nada muda
        com = {"faces": [{"flavor_pt": "Outro."}], "print": {"set": "x", "number": "1"}, "flavor_en": ("Other.",)}
        self.assertFalse(keep_earlier_flavor(com, old))
        self.assertFalse(keep_earlier_flavor({"faces": [{"flavor_pt": None}], "print": {}, "flavor_en": ("",)}, None))

    def test_flavor_de_outra_versao_do_arena(self):
        # Birds of Paradise: o texto do Arena é da LTC 235; a BLC 81 tem outro flavor, também
        # traduzido no Arena (a fala da Ms. Bumbleflower), e saía sem nenhum
        blc = flavor_key("“How lovely! An ambassador from outside Valley arrived today in Three Tree City.”\n—Ms. Bumbleflower")
        ltc = "The noise of bubbling waters came up from the foaming riverbed."
        rows = [{"oracle_id": "o", "name_en": "Birds of Paradise", "text_print": {"set": "ltc", "number": "235"}}]
        versions = {
            "Birds of Paradise": [
                {"print": {"set": "blc", "number": "81"}, "en": (blc,), "pt": ("“Que adorável!…”\n— Sra. Bumbleflower",)},
                {"print": {"set": "ltc", "number": "235"}, "en": (ltc,), "pt": ("O som de águas borbulhantes…",)},
            ]
        }
        prints = [
            {"oracle_id": "o", "set_code": "blc", "number": "81", "_flavor": (blc,)},
            {"oracle_id": "o", "set_code": "ltc", "number": "235", "_flavor": (ltc,)},
            {"oracle_id": "o", "set_code": "m10", "number": "1", "_flavor": ("Outro flavor.",)},
            {"oracle_id": "o", "set_code": "plst", "number": "9", "_flavor": ("",)},
            {"oracle_id": "o", "set_code": "fdn", "number": "2", "_flavor": (ltc,), "text_flavor": True},
        ]
        n = mark_print_flavors(rows, prints, versions)
        self.assertEqual([p["flavor_pt"] for p in prints], [["“Que adorável!…”\n— Sra. Bumbleflower"], None, None, None, None])
        self.assertEqual(n, 1)

    def test_flavor_de_outra_versao_sem_flavor_no_scryfall(self):
        # coleção digital (Kaladesh Remastered): o Scryfall não tem o flavor; vale a mesma coleção e número
        rows = [{"oracle_id": "o", "name_en": "Kari Zev", "text_print": {"set": "kld", "number": "1"}}]
        versions = {"Kari Zev": [{"print": {"set": "klr", "number": "133"}, "en": ("Aboard…",), "pt": ("A bordo…",)}]}
        prints = [{"oracle_id": "o", "set_code": "klr", "number": "133", "_flavor": ("",)}]
        mark_print_flavors(rows, prints, versions)
        self.assertEqual(prints[0]["flavor_pt"], ["A bordo…"])

    def test_ficha_com_nome_de_carta_nao_leva_flavor(self):
        rows = [{"oracle_id": "t", "name_en": "Adorned Pouncer", "layout": "token", "text_print": None}]
        versions = {"Adorned Pouncer": [{"print": {"set": "hou", "number": "1"}, "en": ("A.",), "pt": ("B.",)}]}
        prints = [{"oracle_id": "t", "set_code": "thou", "number": "1", "layout": "token", "_flavor": ("A.",)}]
        mark_print_flavors(rows, prints, versions)
        self.assertIsNone(prints[0]["flavor_pt"])

    def test_aspas_e_travessao_de_um_tipo_so(self):
        self.assertEqual(flavor_key("“Run.”\n—Jace"), flavor_key('"Run." — Jace'))
        self.assertEqual(flavor_key("the *Dragon's Smile*"), flavor_key("the <i>Dragon's Smile</i>"))
        self.assertEqual(flavor_key(None), "")

    def test_flavor_de_cada_face(self):
        self.assertEqual(print_flavor({"card_faces": [{"flavor_text": "A."}, {}]}), ("A.", ""))
        # aventura: as faces sem flavor e o flavor no topo
        self.assertEqual(print_flavor({"flavor_text": "B.", "card_faces": [{}, {}]}), ("B.",))
        self.assertEqual(print_flavor({"flavor_text": "C."}), ("C.",))


class TextoDoEmblema(unittest.TestCase):
    """O texto do emblema vem das aspas do planeswalker, nunca de tradução."""

    def test_emblema_no_fim_da_linha(self):
        self.assertEqual(emblem_text('−7: Você recebe um emblema com "Você tem resistência a magia."'), "Você tem resistência a magia.")

    def test_outra_frase_depois(self):
        # Kiora, Mestra das Profundezas: o emblema saía em inglês
        line = '−8: Você recebe um emblema com "Toda vez que uma criatura entra no campo de batalha sob o seu controle, você pode fazer com que ela lute contra a criatura alvo." Depois, coloque no campo de batalha três fichas.'
        self.assertEqual(emblem_text(line), "Toda vez que uma criatura entra no campo de batalha sob o seu controle, você pode fazer com que ela lute contra a criatura alvo.")

    def test_dois_pontos_depois_de_com(self):
        # Zariel, Nissa (Força Vital), Huatli, Tezzeret e Jace: "emblema com: “…”."
        self.assertEqual(emblem_text("−6: Você recebe um emblema com: “Toda vez que um terreno que você controla entra, você pode comprar um card”."), "Toda vez que um terreno que você controla entra, você pode comprar um card")

    def test_aspas_que_nunca_fecham(self):
        # Jaya Ballard: o texto impresso esqueceu o fecho das aspas
        line = '−8: Você recebe um emblema com "Você pode conjurar mágicas instantâneas e feitiços de seu cemitério. Se uma mágica conjurada desta forma seria colocada em seu cemitério, em vez disso, exile-a.'
        self.assertTrue(emblem_text(line).endswith("exile-a."))

    def test_sem_emblema(self):
        self.assertIsNone(emblem_text("Voar"))


class SagaReminder(unittest.TestCase):
    """O lembrete do alto das Sagas vem das Sagas impressas em PT; o Arena não o traz."""

    EN = "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)"
    PT = "(Conforme esta Saga entra e após sua etapa de compra, adicione um marcador de conhecimento. Sacrifique-a após III.)"
    LER_EN = "Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)"
    LER_PT = "Adiantar leitura (Escolha um capítulo e comece com aquela quantidade de marcadores de conhecimento. Adicione um após sua etapa de compra. Os capítulos pulados não são desencadeados. Sacrifique-a após III.)"

    def saga(self, en: str, pt: str, type_line: str = "Enchantment — Saga") -> dict:
        return {"type_line": type_line, "oracle_text": en, "printed_text": pt}

    def test_lembrete_das_impressas(self):
        printed = {
            "a": self.saga(self.EN + "\nI — Draw a card.", self.PT + "\nI — Compre um card."),
            "b": self.saga(self.LER_EN + "\nI — Scry 1.", self.LER_PT + "\nI — Use vidência 1."),
            # carta que não é Saga e Saga sem lembrete na impressão não contam
            "c": self.saga(self.EN, "(Outra coisa.)", "Enchantment"),
            "d": self.saga(self.EN + "\nI — Draw a card.", "I — Compre um card."),
        }
        self.assertEqual(top_reminders(printed), {self.EN: self.PT, self.LER_EN: self.LER_PT})

    def test_vai_no_alto_do_texto_do_arena(self):
        # Urza's Saga, Book of Mazarbul: sem o lembrete, a faixa do alto ficava vazia
        texto = "I — Compre um card.\nII — Use vidência 2."
        self.assertEqual(top_reminder(self.EN + "\nI — Draw a card.\nII — Scry 2.", texto, {self.EN: self.PT}), self.PT + "\n" + texto)
        # já com o lembrete, ou sem lembrete conhecido, fica como está
        self.assertEqual(top_reminder(self.EN, self.PT + "\n" + texto, {self.EN: self.PT}), self.PT + "\n" + texto)
        self.assertEqual(top_reminder("(Another reminder.)\nI — Draw a card.", texto, {self.EN: self.PT}), texto)

    def test_adiantar_leitura_ganha_a_explicacao(self):
        # The Phasing of Zhalfir (DMU): o Arena traz só "Adiantar leitura"
        en = self.LER_EN + "\nI — Draw a card."
        self.assertEqual(top_reminder(en, "Adiantar leitura\nI — Compre um card.", {self.LER_EN: self.LER_PT}), self.LER_PT + "\nI — Compre um card.")
        # palavra-chave diferente da impressa: não mistura
        self.assertEqual(top_reminder(en, "Ler adiante\nI — Compre um card.", {self.LER_EN: self.LER_PT}), "Ler adiante\nI — Compre um card.")


class ClassText(unittest.TestCase):
    """Classes: o lembrete do alto vem das Classes impressas em PT; o Arena e o Scryfall têm marcações."""

    EN = "(Gain the next level as a sorcery to add its ability.)"
    PT = "(Ganhe o próximo nível como um feitiço para adicionar sua habilidade.)"

    def test_lembrete_das_classes_impressas(self):
        # o texto impresso do Scryfall traz "//Level_2//" entre a barra e a habilidade
        impresso = self.PT + "\nNão há limite para o número máximo de cards em sua mão.\n{2}{U}: Nível 2\n//Level_2//\nQuando esta Classe chegar ao nível 2, compre dois cards."
        printed = {"a": {"type_line": "Enchantment — Class", "oracle_text": self.EN + "\nYou have no maximum hand size.", "printed_text": impresso}}
        self.assertEqual(top_reminders(printed), {self.EN: self.PT})

    def test_vai_no_alto_do_texto_do_arena(self):
        # Classe: Mago: o Arena começa direto pela habilidade do nível 1
        texto = "Não há limite para o número máximo de cards em sua mão.\n{2}{U}: Nível 2\nQuando esta Classe chegar ao nível 2, compre dois cards."
        en = self.EN + "\nYou have no maximum hand size.\n{2}{U}: Level 2\nWhen this Class becomes level 2, draw two cards."
        self.assertEqual(top_reminder(en, texto, {self.EN: self.PT}), self.PT + "\n" + texto)

    def test_tira_as_marcacoes_de_nivel(self):
        self.assertEqual(drop_level_marks("{1}{U}: Nível 2\n//Level_2//\nQuando…"), "{1}{U}: Nível 2\nQuando…")
        self.assertEqual(drop_level_marks("Transformar // Queimar causa 2 pontos de dano."), "Transformar // Queimar causa 2 pontos de dano.")
        self.assertIsNone(drop_level_marks(None))

    def test_modelo_de_nivel_do_arena_nao_e_texto(self):
        # Classe: Ladino: "CLASSLEVEL [3] [Você pode jogar…]" repetia a habilidade do nível 3
        self.assertTrue(is_arena_marker("CLASSLEVEL [3] [Você pode jogar cards exilados com esta Classe.]"))
        self.assertTrue(is_arena_marker("#NoTranslationNeeded"))
        self.assertFalse(is_arena_marker("Você pode jogar cards exilados com esta Classe."))


class StationText(unittest.TestCase):
    """Posicionar (Station): o Arena marca cada nível com "#StationLevelInstrinsic_NoTranslation" (em inglês,
    "STATIONLEVEL [9+] [3/4] [Flying]…") antes das habilidades do nível."""

    def test_nivel_do_marcador(self):
        self.assertEqual(station_level("STATIONLEVEL [9+] [3/4] [Flying] [First strike]"), "9+")
        self.assertEqual(station_level("STATIONLEVEL [12+] [] [{3}{W}, {T}: Create a token…]"), "12+")
        self.assertIsNone(station_level("Station"))
        self.assertIsNone(station_level(None))

    def test_palavras_chave_de_cada_nivel_a_parte(self):
        # Nave-aríete Cuneilux: saía "Posicionar, voar, iniciativa" numa linha só
        groups = [(None, ["Quando esta Espaçonave entrar, crie uma ficha.", "Posicionar"]), ("9+", ["Voar", "Iniciativa"])]
        self.assertEqual(join_station(groups), ["Quando esta Espaçonave entrar, crie uma ficha.", "Posicionar", "9+ | Voar, iniciativa"])

    def test_nivel_com_varias_linhas(self):
        # Cruzador de Batalha Entrópico: o nível 8+ tem as palavras-chave e uma habilidade
        groups = [(None, ["Posicionar"]), ("1+", ["Toda vez que um oponente descarta um card, ele perde 3 pontos de vida."]), ("8+", ["Voar", "Toque mortífero", "Toda vez que esta Espaçonave ataca, cada oponente descarta um card."])]
        self.assertEqual(
            join_station(groups),
            ["Posicionar", "1+ | Toda vez que um oponente descarta um card, ele perde 3 pontos de vida.", "8+ | Voar, toque mortífero", "Toda vez que esta Espaçonave ataca, cada oponente descarta um card."],
        )

    def test_sem_niveis_fica_como_antes(self):
        self.assertEqual(join_station([(None, ["Voar", "Vigilância"])]), ["Voar, vigilância"])


class ClassSupported(unittest.TestCase):
    base = {"frame": "2015", "layout": "class", "border_color": "black", "type_line": "Enchantment — Class"}

    def test_moldura_padrao(self):
        self.assertTrue(class_supported(self.base))
        # as de Tartarugas Ninja têm o brilho de encantamento
        self.assertTrue(class_supported({**self.base, "frame_effects": ["enchantment"]}))
        self.assertTrue(class_supported({**self.base, "promo_types": ["prerelease", "datestamped"]}))

    def test_outras_molduras(self):
        # pôster e Secret Lair sem borda
        self.assertFalse(class_supported({**self.base, "border_color": "borderless", "full_art": True}))
        self.assertFalse(class_supported({**self.base, "frame_effects": ["showcase"]}))
        self.assertFalse(class_supported({**self.base, "layout": "normal"}))
        # promo de loja com o "&" em alto-relevo atravessando a coluna (Ranger Class, PAFR 202a)
        self.assertFalse(class_supported({**self.base, "promo_types": ["embossed", "instore"]}))


class StationSupported(unittest.TestCase):
    base = {"frame": "2015", "layout": "normal", "border_color": "black", "keywords": ["Station", "Flying"], "type_line": "Artifact — Spacecraft"}

    def test_moldura_padrao(self):
        self.assertTrue(station_supported(self.base))
        self.assertTrue(station_supported({**self.base, "frame_effects": ["legendary"]}))
        # arte estendida: a mesma caixa, sem a explicação do Posicionar
        self.assertTrue(station_supported({**self.base, "frame_effects": ["extendedart"]}))

    def test_outras_molduras(self):
        self.assertFalse(station_supported({**self.base, "keywords": ["Flying"]}))
        self.assertFalse(station_supported({**self.base, "border_color": "borderless"}))
        self.assertFalse(station_supported({**self.base, "frame_effects": ["showcase"]}))
        self.assertFalse(station_supported({**self.base, "full_art": True}))
        self.assertFalse(station_supported({**self.base, "textless": True}))


class MutateSupported(unittest.TestCase):
    base = {"frame": "2015", "layout": "mutate", "border_color": "black", "type_line": "Creature — Beast"}

    def test_moldura_padrao(self):
        self.assertTrue(mutate_supported(self.base))
        self.assertTrue(mutate_supported({**self.base, "frame_effects": ["legendary"]}))
        # promos de pré-estreia e do pacote de promoções: a mesma caixa, com o selo na arte
        self.assertTrue(mutate_supported({**self.base, "promo_types": ["prerelease", "datestamped"]}))

    def test_outras_molduras(self):
        # as de vitrine (a caixa de outro desenho) e as sem borda de Godzilla
        self.assertFalse(mutate_supported({**self.base, "frame_effects": ["showcase", "inverted"]}))
        self.assertFalse(mutate_supported({**self.base, "border_color": "borderless", "frame_effects": ["inverted"]}))
        self.assertFalse(mutate_supported({**self.base, "layout": "normal"}))
        self.assertFalse(mutate_supported({**self.base, "full_art": True}))
        self.assertFalse(mutate_supported({**self.base, "textless": True}))


class MutateText(unittest.TestCase):
    MUTATE = "Mutate {3}{G} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)"

    def test_nome_que_falta(self):
        # Glowstone Recluse: "{3}{G}" no Arena, com o lembrete no Scryfall, e "Mutação" na carta impressa
        en = f"{self.MUTATE}\nReach\nWhenever this creature mutates, put two +1/+1 counters on it."
        self.assertEqual(restore_cost_keyword(en, "{3}{G}\nAlcance\nToda vez…"), "Mutação {3}{G}\nAlcance\nToda vez…")
        self.assertEqual(restore_cost_keyword(en, "{3}{G} (Se você conjurar…)\nAlcance"), "Mutação {3}{G} (Se você conjurar…)\nAlcance")

    def test_fica_como_esta(self):
        en = f"{self.MUTATE}\n{{2}}, {{T}}: Draw a card."
        # com o nome, com outro custo e uma habilidade ativada que começa pelo custo
        self.assertEqual(restore_cost_keyword(en, "Mutação {3}{G}\n{2}, {T}: Compre um card."), "Mutação {3}{G}\n{2}, {T}: Compre um card.")
        self.assertEqual(restore_cost_keyword(en, "{2}{G}\nAlcance"), "{2}{G}\nAlcance")
        self.assertEqual(restore_cost_keyword("Echo {1}{G} (At the beginning…)", "{1}{G}"), "{1}{G}")
        self.assertIsNone(restore_cost_keyword(en, None))

    def test_palavras_chave_juntas(self):
        # Dirge Bat: o Oracle tem "Flash" e "Flying" em linhas separadas, e o Arena, "Lampejo, voar"
        en = ["Mutate {4}{B}{B} (If…)", "Flash", "Flying", "Whenever this creature mutates, destroy target creature."]
        self.assertEqual(join_keyword_lines(en), ["Mutate {4}{B}{B} (If…)", "Flash, flying", "Whenever this creature mutates, destroy target creature."])
        self.assertEqual(join_keyword_lines(["First strike", "Double strike", "Vigilance"]), ["First strike, double strike, vigilance"])
        # palavra-chave com custo ou lembrete não junta
        self.assertEqual(join_keyword_lines(["Flying", "Ward {2}"]), ["Flying", "Ward {2}"])
        reminders = {"If…": "Se…"}
        pt = "Mutação {4}{B}{B}\nLampejo, voar\nToda vez que esta criatura sofrer mutação, destrua a criatura alvo."
        out = add_reminders("\n".join(en), pt, reminders)
        self.assertEqual(out.split("\n")[0], "Mutação {4}{B}{B} (Se…)")
        self.assertEqual(out.split("\n")[1:], pt.split("\n")[1:])


class LevelerText(unittest.TestCase):
    """Subir de Nível (Level up): o Arena marca cada nível com "LEVEL [3-7] [4/4] [Protection from instants]"
    em inglês e "NÍVEL [3-7] [4/4] […]" em PT, antes das habilidades do nível."""

    def test_selo_e_pt_do_marcador(self):
        self.assertEqual(leveler_level("LEVEL [3-7] [4/4] [Protection from instants]"), ["NÍVEL 3-7", "4/4"])
        self.assertEqual(leveler_level("LEVEL [8+] [6/6] [Protection from everything]"), ["NÍVEL 8+", "6/6"])
        self.assertIsNone(leveler_level("Level up {1}"))
        self.assertIsNone(leveler_level(None))

    def test_niveis_como_o_oracle(self):
        # Hexdrinker: saía "Proteção contra mágicas instantâneas, nÍVEL [8+] [6/6] […]" numa linha só
        groups = [
            (None, ["Subir de nível {1}"], []),
            (None, ["Proteção contra mágicas instantâneas"], ["NÍVEL 3-7", "4/4"]),
            (None, ["Proteção contra tudo"], ["NÍVEL 8+", "6/6"]),
        ]
        self.assertEqual(
            join_station(groups),
            ["Subir de nível {1}", "NÍVEL 3-7", "4/4", "Proteção contra mágicas instantâneas", "NÍVEL 8+", "6/6", "Proteção contra tudo"],
        )


class LevelerSupported(unittest.TestCase):
    base = {"frame": "2003", "layout": "leveler", "border_color": "black", "type_line": "Creature — Human Warrior"}

    def test_molduras_dos_niveis(self):
        # Rise of the Eldrazi (2003) e Commander, Modern Horizons (atual)
        self.assertTrue(leveler_supported(self.base))
        self.assertTrue(leveler_supported({**self.base, "frame": "2015", "frame_effects": ["legendary"]}))

    def test_outras_molduras(self):
        # as promos de ROE com a marca-d'água, que saía em cacos com o apagamento de cada faixa
        self.assertFalse(leveler_supported({**self.base, "watermark": "planeswalker"}))
        # Secret Lair sem borda, a de borda branca e a carta de teste de MB2
        self.assertFalse(leveler_supported({**self.base, "frame": "2015", "border_color": "borderless"}))
        self.assertFalse(leveler_supported({**self.base, "frame": "2015", "border_color": "white"}))
        self.assertFalse(leveler_supported({**self.base, "frame": "2015", "promo_types": ["playtest"]}))
        self.assertFalse(leveler_supported({**self.base, "layout": "normal"}))
        self.assertFalse(leveler_supported({**self.base, "frame": "1997"}))
        self.assertFalse(leveler_supported({**self.base, "frame_effects": ["showcase"]}))


class CartasDeFundir(unittest.TestCase):
    parts = [
        {"component": "meld_part", "name": "Bruna, the Fading Light"},
        {"component": "meld_part", "name": "Gisela, the Broken Blade"},
        {"component": "meld_result", "name": "Brisela, Voice of Nightmares"},
    ]
    bruna = {
        "name": "Bruna, the Fading Light",
        "oracle_id": "b",
        "frame": "2015",
        "layout": "meld",
        "border_color": "black",
        "frame_effects": ["mooneldrazidfc"],
        "all_parts": parts,
        "oracle_text": "When you cast this spell, you may return target Angel or Human creature card from your graveyard to the battlefield.\nFlying, vigilance\n(Melds with Gisela, the Broken Blade.)",
    }
    brisela = {"name": "Brisela, Voice of Nightmares", "oracle_id": "r", "layout": "meld", "power": "9", "toughness": "10", "all_parts": parts}

    def test_so_a_frente(self):
        # Eldritch Moon (o ícone da lua e do Eldrazi), The Brothers' War e a arte estendida de FIN
        self.assertTrue(meld_supported(self.bruna))
        self.assertTrue(meld_supported({**self.bruna, "frame_effects": ["legendary", "extendedart"]}))
        # a carta fundida é a junção dos dois versos
        self.assertTrue(is_meld_result({**self.brisela, "frame": "2015", "border_color": "black"}))
        self.assertFalse(meld_supported({**self.bruna, **self.brisela, "frame_effects": []}))
        # sem borda (Secret Lair, FIN) e as que não são de fundir
        self.assertFalse(meld_supported({**self.bruna, "border_color": "borderless", "frame_effects": ["inverted"]}))
        self.assertFalse(meld_supported({**self.bruna, "layout": "normal"}))

    def test_so_a_face_da_carta(self):
        # o Arena liga à Bruna a face da Brisela: o nome saía "Bruna // Brisela"
        faces = [{"name_pt": "Bruna, a Luz Desvanecente"}, {"name_pt": "Brisela, Voz dos Pesadelos"}]
        self.assertEqual(own_faces(self.bruna, faces), faces[:1])
        self.assertEqual(own_faces({"layout": "transform"}, faces), faces)

    def test_pr_e_lembrete(self):
        rows = [
            {"oracle_id": "b", "faces": [{"text_pt": "Quando conjura esta mágica, você pode devolver…\nVoar, vigilância"}]},
            {"oracle_id": "r", "faces": [{"text_pt": "Voar, iniciativa, vigilância, vínculo com a vida"}]},
        ]
        printed = {
            "b": {
                "printed_name": "Bruna, a Luz Desvanecente",
                "printed_text": "Quando conjura Bruna, a Luz Desvanecente, você pode…\nVoar, vigilância\n(Funde-se com Gisela, a Lâmina Partida.)",
            }
        }
        self.assertEqual(add_meld_data(rows, [self.bruna, self.brisela], printed), (1, 1))
        face = rows[0]["faces"][0]
        self.assertEqual(face["meld_pt"], "9/10")
        self.assertTrue(face["text_pt"].endswith("\nVoar, vigilância\n(Funde-se com Gisela, a Lâmina Partida.)"))
        # a carta fundida não ganha nada
        self.assertNotIn("meld_pt", rows[1]["faces"][0])
        # de novo, nada muda (o lembrete não se repete)
        self.assertEqual(add_meld_data(rows, [self.bruna, self.brisela], printed), (1, 0))
        self.assertEqual(face["text_pt"].count("Funde-se"), 1)

    def test_sem_impressa_sem_lembrete(self):
        # o lembrete nunca é montado: sem impressa em PT (o Fang, de FIN), a carta fica sem ele
        rows = [{"oracle_id": "b", "faces": [{"text_pt": "Voar, vigilância"}]}]
        self.assertEqual(add_meld_data(rows, [self.bruna, self.brisela], {}), (1, 0))
        self.assertEqual(rows[0]["faces"][0]["text_pt"], "Voar, vigilância")
        # carta fundida planeswalker (Urza): a frente não imprime P/R nenhum
        urza = {**self.brisela, "power": None, "toughness": None}
        rows = [{"oracle_id": "b", "faces": [{"text_pt": "Voar"}]}]
        self.assertEqual(add_meld_data(rows, [self.bruna, urza], {}), (0, 0))


class KeywordReminders(unittest.TestCase):
    """O lembrete de palavra-chave vem das cartas impressas em PT; o Arena não o traz."""

    AMASS = "Put a +1/+1 counter on an Army you control. It's also an Orc. If you don't control an Army, create a 0/0 black Orc Army creature token first."
    ARREG = "Coloque um marcador +1/+1 em um Exército que você controla. Ele também é um Orc. Se você não controlar um Exército, crie antes uma ficha de criatura Orc Exército preta 0/0."
    FLASH = "You may cast this card from your graveyard for its flashback cost. Then exile it."
    RECAP = "Você pode conjurar este card de seu cemitério pagando seu custo de recapitular. Depois, exile-o."
    SHIELD = "If it would be dealt damage or destroyed, remove a shield counter from it instead."

    def print_(self, oid: str, pt: str, released: str = "2023-06-23") -> dict:
        return {"oracle_id": oid, "printed_text": pt, "released_at": released}

    def test_lembrete_das_impressas(self):
        oracle = {
            "a": {"oracle_text": f"Amass Orcs 1. ({self.AMASS})", "type_line": "Sorcery"},
            "b": {"oracle_text": f"Flashback {{2}}{{R}} ({self.FLASH})", "type_line": "Instant"},
        }
        prints = [
            self.print_("a", f"Arregimente Orcs 1. ({self.ARREG})"),
            # a impressão mais nova ganha; antes do Magic 2010 nem conta ("jogar", "remova do jogo")
            self.print_("b", "Recapitular {2}{R} (Você pode jogar este card de seu cemitério pagando seu custo de recapitular. Depois, remova-o do jogo.)", "2008-01-01"),
            self.print_("b", "Recapitular {2}{R} (Você pode conjurar este card de seu cemitério pagando seu custo de recapitular. Depois, exile-o do jogo.)", "2012-02-03"),
            self.print_("b", f"Recapitular {{2}}{{R}} ({self.RECAP})", "2021-09-24"),
        ]
        by_group, by_card = reminder_texts(prints, oracle)
        self.assertEqual(by_group["*"], {self.AMASS: self.ARREG, self.FLASH: self.RECAP})
        self.assertEqual(by_card["b"], {self.FLASH: self.RECAP})

    def test_casa_linha_a_linha(self):
        oracle = {
            # linhas a mais no texto impresso: não casa nenhuma
            "a": {"oracle_text": "Scry 1. (Look at the top card of your library.)\nDraw a card.", "type_line": "Sorcery"},
            # outro número no lembrete ou no resto da linha: é outra versão da carta
            "b": {"oracle_text": "Equip {2} ({2}: Attach to target creature you control.)", "type_line": "Artifact"},
            "c": {"oracle_text": "Amass Orcs 2. (Put two +1/+1 counters on an Army you control.)", "type_line": "Sorcery"},
            "d": {"oracle_text": "When this enters, mill a card. (To mill a card, put the top card of your library into your graveyard.)", "type_line": "Artifact"},
        }
        prints = [
            self.print_("a", "Use vidência 1. (Olhe o card do topo.)\nCompre\num card."),
            self.print_("b", "Equipar {3} ({3}: Anexe à criatura alvo que você controla.)"),
            self.print_("c", "Arregimente Orcs 1. (Coloque dois marcadores +1/+1 em um Exército que você controla.)"),
            # erro de digitação do Scryfall (Inverted Iceberg, LCI): letra repetida e sem ponto final
            self.print_("d", "Quando entrar, triture um card. (P Para triturar um card, coloque o card do topo de seu grimório em seu cemitério)"),
        ]
        self.assertEqual(reminder_texts(prints, oracle), ({}, {}))

    def test_impressa_com_o_texto_em_ingles(self):
        # impressões em PT com linhas em inglês no Scryfall (Chimil, the Inner Sun, LCI 249): o
        # lembrete em inglês ia para as outras cartas com a palavra (U.S.S. Discovery, TRK)
        discover = "Exile cards from the top of your library until you exile a nonland card with mana value 5 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order."
        oracle = {
            "a": {"oracle_text": f"At the beginning of your end step, discover 5. ({discover})", "type_line": "Legendary Artifact"},
            "b": {"oracle_text": f"When this enters, discover 5. ({discover})", "type_line": "Creature"},
        }
        prints = [
            self.print_("a", f"At the beginning of your end step, discover 5. ({discover})"),
            self.print_("b", f"Quando entrar, descubra 5. ({discover})"),
        ]
        self.assertEqual(reminder_texts(prints, oracle), ({}, {}))

    def test_impresso_antigo_que_nao_diz_o_mesmo(self):
        # o Oracle mudou o lembrete e a impressão ficou com o antigo: o atropelar dos Fractius
        # (Groundshaker Sliver, M14) ia para as cartas com atropelar, e o arregimentar de WAR não
        # diz "Ele também é um Zumbi"
        trample = "A creature with trample can deal excess combat damage to the player or planeswalker it's attacking."
        amass = "Put a +1/+1 counter on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first."
        oracle = {
            "a": {"oracle_text": f"Sliver creatures you control have trample. ({trample})", "type_line": "Creature — Sliver"},
            "b": {"oracle_text": f"Amass Zombies 1. ({amass})", "type_line": "Sorcery"},
        }
        prints = [
            self.print_("a", "As criaturas do tipo Fractius que você controla têm atropelar. (Se um Fractius que você controla for atribuir dano suficiente para destruir seus bloqueadores, você poderá fazer com que ele atribua o resto de seu dano ao planeswalker ou jogador defensor.)", "2013-07-19"),
            self.print_("b", "Arregimente 1. (Coloque um marcador +1/+1 em um Exército que você controla. Se você não controlar um, crie antes uma ficha de criatura Zumbi Exército preta 0/0.)", "2019-05-03"),
        ]
        by_group, by_card = reminder_texts(prints, oracle)
        self.assertEqual(by_group, {})
        # a própria carta fica com o da impressão dela, que é o da carta física
        self.assertEqual(set(by_card), {"a", "b"})
        self.assertTrue(by_card["a"][trample].startswith("Se um Fractius"))
        # frase a mais no PT ("Depois, …") é o mesmo texto
        self.assertTrue(says_all("Look at the top two cards of your library, then put any number of them on the bottom.", "Olhe os dois cards do topo do seu grimório. Depois, coloque qualquer número deles no fundo."))

    def test_ela_ou_ele_pelo_tipo(self):
        # o escudo diz "ela" da criatura e "ele" do artefato: cada grupo fica com o seu
        oracle = {
            "a": {"oracle_text": f"Shield counter ({self.SHIELD})", "type_line": "Creature — Human"},
            "b": {"oracle_text": f"Shield counter ({self.SHIELD})", "type_line": "Artifact — Vehicle"},
        }
        ela = "Se ela sofreria dano ou seria destruída, em vez disso, remova um marcador de escudo dela."
        ele = "Se ele sofreria dano ou seria destruído, em vez disso, remova um marcador de escudo dele."
        by_group, by_card = reminder_texts([self.print_("a", f"Marcador de escudo ({ela})"), self.print_("b", f"Marcador de escudo ({ele})", "2022-01-01")], oracle)
        self.assertEqual(by_group["criatura"][self.SHIELD], ela)
        self.assertEqual(by_group["artefato"][self.SHIELD], ele)
        # uma criatura artefato sem impressão em PT usa a de criatura; a própria carta ganha de todos
        self.assertEqual(face_reminders("x", "Artifact Creature — Golem", by_group, by_card)[self.SHIELD], ela)
        self.assertEqual(face_reminders("b", "Creature — Human", by_group, by_card)[self.SHIELD], ele)
        self.assertEqual(type_group("Legendary Enchantment Creature — God"), "criatura")
        self.assertEqual(type_group("Kindred Instant — Elf"), "mágica")

    def test_vai_no_fim_da_linha(self):
        # Book of Mazarbul: a carta física explica o "Arregimentar Orcs 1." do capítulo I
        en = f"(As this Saga enters…)\nI — Amass Orcs 1. ({self.AMASS})\nII — Amass Orcs 2.\nIII — Creatures you control get +1/+0."
        pt = "(Conforme esta Saga entra…)\nI — Arregimentar Orcs 1.\nII — Arregimente Orcs 2.\nIII — As criaturas que você controla recebem +1/+0."
        out = add_reminders(en, pt, {self.AMASS: self.ARREG})
        self.assertEqual(out.split("\n")[1], f"I — Arregimentar Orcs 1. ({self.ARREG})")
        self.assertEqual(out.split("\n")[2:], pt.split("\n")[2:])
        # e numa carta comum
        self.assertEqual(add_reminders(f"Flashback {{2}}{{R}} ({self.FLASH})", "Recapitular {2}{R}", {self.FLASH: self.RECAP}), f"Recapitular {{2}}{{R}} ({self.RECAP})")

    def test_fica_como_esta(self):
        lembretes = {self.AMASS: self.ARREG, self.FLASH: self.RECAP}
        en = f"I — Amass Orcs 1. ({self.AMASS})\nII — Draw a card."
        # linhas que não batem, lembrete desconhecido e linha que já tem parênteses
        self.assertEqual(add_reminders(en, "I — Arregimente Orcs 1.", lembretes), "I — Arregimente Orcs 1.")
        self.assertEqual(add_reminders(en, "I — Arregimente Orcs 1.\nII — Compre um card.", {}), "I — Arregimente Orcs 1.\nII — Compre um card.")
        ja = f"I — Arregimente Orcs 1. ({self.ARREG})\nII — Compre um card."
        self.assertEqual(add_reminders(en, ja, lembretes), ja)
        self.assertIsNone(add_reminders(en, None, lembretes))
        # outro custo na linha em PT: não é a mesma linha
        self.assertEqual(add_reminders(f"Flashback {{2}}{{R}} ({self.FLASH})", "Recapitular {3}{R}", lembretes), "Recapitular {3}{R}")


class ArenaHints(unittest.TestCase):
    """O lembrete nunca impresso em PT vem da dica do Arena com as mesmas palavras do Oracle (ADR 0021)."""

    STATION = "Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 12+."
    # a dica do Arena tem outra ordem ("on this Spacecraft equal to its power") e não tem o ponto final
    HINT = {
        "key": "AbilityHanger/Keyword/Station_Body",
        "en": "Tap another creature you control: Put charge counters on this Spacecraft equal to its power. Station only as a sorcery. It's an artifact creature at {chargeRequirement}+",
        "pt": "Vire outra criatura que você controla: Coloque uma quantidade de marcadores de carga nesta Espaçonave igual ao poder dela. Posicione somente como um feitiço. Ela é uma criatura artefato em {chargeRequirement}+",
    }
    PT = "Vire outra criatura que você controla: Coloque uma quantidade de marcadores de carga nesta Espaçonave igual ao poder dela. Posicione somente como um feitiço. Ela é uma criatura artefato em 12+."
    PLANET = {
        "key": "AbilityHanger/Keyword/Station_Planet_Body",
        "en": "Tap another creature you control: Put charge counters on this Planet equal to its power. Station only as a sorcery.",
        "pt": "Vire outra criatura que você controla: Coloque uma quantidade de marcadores de carga neste Planeta igual ao poder dela. Posicione somente como um feitiço.",
    }

    def test_mesmas_palavras_em_outra_ordem(self):
        self.assertEqual(hint_reminder(self.STATION, self.HINT["en"], self.HINT["pt"]), self.PT)
        planet = "Tap another creature you control: Put charge counters equal to its power on this Planet. Station only as a sorcery."
        self.assertEqual(hint_reminder(planet, self.PLANET["en"], self.PLANET["pt"]), self.PLANET["pt"])

    def test_palavras_diferentes(self):
        # a dica do planeta não serve para a nave, nem a da nave para outro nível sem o número
        self.assertIsNone(hint_reminder(self.STATION, self.PLANET["en"], self.PLANET["pt"]))
        self.assertIsNone(hint_reminder("Tap another creature you control: Put charge counters equal to its power on this Spacecraft.", self.HINT["en"], self.HINT["pt"]))
        # número por extenso não é variável ("three"), e duas variáveis com números diferentes não casam
        bushido = {"en": "When this blocks or becomes blocked, it gets +{numeral}/+{numeral} until end of turn.", "pt": "Quando esta criatura bloquear ou for bloqueada, ela recebe +{numeral}/+{numeral} até o final do turno."}
        self.assertEqual(hint_reminder("When this blocks or becomes blocked, it gets +2/+2 until end of turn.", bushido["en"], bushido["pt"]), "Quando esta criatura bloquear ou for bloqueada, ela recebe +2/+2 até o final do turno.")
        self.assertIsNone(hint_reminder("When this blocks or becomes blocked, it gets +2/+1 until end of turn.", bushido["en"], bushido["pt"]))
        self.assertIsNone(hint_reminder("When this blocks or becomes blocked, it gets +three/+three until end of turn.", bushido["en"], bushido["pt"]))

    def test_so_onde_nao_ha_impresso(self):
        oracle = [
            {"oracle_id": "a", "name": "Nave", "oracle_text": f"Station ({self.STATION})\nSTATION 12+\nFlying", "type_line": "Artifact — Spacecraft"},
            {"oracle_id": "b", "card_faces": [{"name": "Raio", "oracle_text": f"Flashback {{2}}{{R}} ({KeywordReminders.FLASH})"}, {"name": "Outro", "oracle_text": "Draw a card."}]},
        ]
        flash = {"key": "AbilityHanger/Keyword/Flashback_Body", "en": KeywordReminders.FLASH, "pt": "Outro texto."}
        self.assertEqual(arena_reminders(oracle, [self.HINT, flash], set(), skip={}), {"a": {self.STATION: self.PT}, "b": {KeywordReminders.FLASH: "Outro texto."}})
        # o lembrete impresso em PT ganha, e as dicas com a tradução errada ficam de fora
        self.assertEqual(arena_reminders(oracle, [self.HINT, flash], {KeywordReminders.FLASH}, skip={}), {"a": {self.STATION: self.PT}})
        self.assertEqual(arena_reminders(oracle, [self.HINT, flash], set(), skip={flash["key"]: "errada"}), {"a": {self.STATION: self.PT}})

    def test_diferencas_que_nao_mudam_o_sentido(self):
        # o custo vai para o {abilityCost} e "token" pode faltar na dica (Offspring, Rust-Shield Rampager)
        offspring = {
            "en": "You may pay an additional {abilityCost} as you cast this spell. If you do, when this creature enters, create a 1/1 copy of it.",
            "pt": "Você pode pagar mais {abilityCost} ao conjurar esta mágica. Se fizer isso, quando esta criatura entrar, crie uma cópia 1/1 dela.",
        }
        rem = "You may pay an additional {1}{U} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it."
        self.assertEqual(hint_reminder(rem, offspring["en"], offspring["pt"]), "Você pode pagar mais {1}{U} ao conjurar esta mágica. Se fizer isso, quando esta criatura entrar, crie uma cópia 1/1 dela.")
        # "this creature" na carta e "it" na dica do Warp; símbolos do Arena ("{o1}") e o ")" a mais do Ninjutsu
        warp = {"en": "You may cast this card from your hand for its warp cost. Exile it at the beginning of the next end step.", "pt": "Você pode conjurar este card. Exile-o no início da próxima etapa final."}
        self.assertEqual(hint_reminder("You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step.", warp["en"], warp["pt"]), "Você pode conjurar este card. Exile-o no início da próxima etapa final.")
        affinity = {"en": "This spell costs {o1} less to cast for each creature you control.", "pt": "Esta mágica custa {o1} a menos."}
        self.assertEqual(hint_reminder("This spell costs {1} less to cast for each creature you control.", affinity["en"], affinity["pt"]), "Esta mágica custa {1} a menos.")
        ninjutsu = {"en": "{abilityCost}, Return an unblocked attacker you control to hand: Put this card onto the battlefield.", "pt": "{abilityCost}, devolva um atacante: Coloque este card no campo de batalha.)."}
        self.assertEqual(hint_reminder("{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield.", ninjutsu["en"], ninjutsu["pt"]), "{B}, devolva um atacante: Coloque este card no campo de batalha.")
        # a dica que começa por "To manifest dread," vale para o lembrete sem esse começo
        dread = {"en": "To manifest dread, look at the top two cards of your library.", "pt": "Para Manifestar Pavor, olhe os dois cards no topo de seu grimório."}
        self.assertEqual(hint_reminder("Look at the top two cards of your library.", dread["en"], dread["pt"]), "Olhe os dois cards no topo de seu grimório.")
        # dica em PT ainda em inglês (DiscoverN) não serve
        self.assertIsNone(hint_reminder("Look at the top two cards of your library.", dread["en"], dread["en"]))

    def test_numero_por_extenso(self):
        # "two" na carta e {numeral} na dica: em PT sai por extenso, concordando com a palavra seguinte
        mobilize = {
            "en": "Whenever this creature attacks, create {numeral} tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.",
            "pt": "Toda vez que esta criatura atacar, crie {numeral} fichas de criatura Guerreiro vermelha 1/1 viradas e atacando. Sacrifique-as no início da próxima etapa final.",
        }
        rem = "Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step."
        self.assertEqual(
            hint_reminder(rem, mobilize["en"], mobilize["pt"]),
            "Toda vez que esta criatura atacar, crie duas fichas de criatura Guerreiro vermelha 1/1 viradas e atacando. Sacrifique-as no início da próxima etapa final.",
        )
        self.assertIn("crie três fichas", hint_reminder(rem.replace("two", "three"), mobilize["en"], mobilize["pt"]))
        empower = {"en": "Put {numeral} loyalty counters on a Jace token you control.", "pt": "Coloque {numeral} marcadores de lealdade em uma ficha de Jace que você controla."}
        self.assertEqual(hint_reminder("Put two loyalty counters on a Jace token you control.", empower["en"], empower["pt"]), "Coloque dois marcadores de lealdade em uma ficha de Jace que você controla.")
        self.assertEqual(hint_reminder("Put six loyalty counters on a Jace token you control.", empower["en"], empower["pt"]), "Coloque seis marcadores de lealdade em uma ficha de Jace que você controla.")
        # o artigo não é número: o singular tem a dica dele (Mobilize_1)
        self.assertIsNone(hint_reminder("Whenever this creature attacks, create a tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.", mobilize["en"], mobilize["pt"]))

    def test_it_so_quando_e_a_propria_carta(self):
        # "It deals damage…" vira "Este card causa dano…" no Wither da própria carta, nunca no da criatura equipada (Fists of the Demigod)
        wither = {"key": "AbilityHanger/Keyword/Wither_Body", "en": "This deals damage to creatures in the form of -1/-1 counters.", "pt": "Este card causa dano a criaturas na forma de marcadores -1/-1."}
        rem = "It deals damage to creatures in the form of -1/-1 counters."
        oracle = [
            {"oracle_id": "a", "name": "Corvo", "oracle_text": f"Flying, wither ({rem})"},
            {"oracle_id": "b", "name": "Punhos", "oracle_text": f"Equipped creature gets +1/+1 and has wither. ({rem})"},
        ]
        self.assertEqual(arena_reminders(oracle, [wither], set(), skip={}), {"a": {rem: wither["pt"]}})
        self.assertTrue(refers_to_self("This creature enters prepared.", "Adventurous Eater"))
        self.assertTrue(refers_to_self("Whenever a land you control enters, Tam becomes prepared.", "Tam, Observant Sequencer"))
        self.assertFalse(refers_to_self("When this Equipment enters, create a 1/1 colorless Shapeshifter creature token with changeling.", "Stalactite Dagger"))
        self.assertFalse(refers_to_self("{1}{R}, {T}: Target creature you control gains firebending 4 until end of turn.", "Fire Nation Palace"))

    def test_vai_para_a_linha_do_posicionar(self):
        en = f"Station ({self.STATION})\nSTATION 12+\nFlying\n5/5"
        self.assertEqual(add_reminders(en, "Posicionar\nPOSICIONAR 12+\nVoar\n5/5", {self.STATION: self.PT}).split("\n")[0], f"Posicionar ({self.PT})")

    def test_le_o_banco_da_interface(self):
        import sqlite3
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "Raw_ClientLocalization.mtga"
            con = sqlite3.connect(db)
            con.execute("CREATE TABLE Loc (Key TEXT, Bundle TEXT, enUS TEXT, ptBR TEXT)")
            con.executemany(
                "INSERT INTO Loc VALUES (?, ?, ?, ?)",
                [(self.HINT["key"], "b", self.HINT["en"], self.HINT["pt"]), ("AbilityHanger/Keyword/Nada_Body", "b", "Only English.", None), ("MainNav/Home", "b", "Home", "Início")],
            )
            con.commit()
            con.close()
            self.assertEqual(extract_hints(db), [self.HINT])


class SagaChapters(unittest.TestCase):
    """O Arena traz um parágrafo por capítulo, sem o número; o número e os grupos vêm do Oracle."""

    LEMBRETE = "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\n"

    def test_um_capitulo_por_paragrafo(self):
        en = self.LEMBRETE + "I — Draw a card.\nII — Scry 2.\nIII — You gain 3 life."
        pt = "Compre um card.\nUse vidência 2.\nVocê ganha 3 pontos de vida."
        self.assertEqual(saga_chapters(en, pt), "I — Compre um card.\nII — Use vidência 2.\nIII — Você ganha 3 pontos de vida.")

    def test_grupo_repetido_no_arena(self):
        # Long List of the Ents: o mesmo parágrafo seis vezes no Arena, um grupo só no Oracle
        en = "I, II, III, IV, V, VI — Note a creature type."
        self.assertEqual(saga_chapters(en, "\n".join(["Anote um tipo."] * 6)), "I, II, III, IV, V, VI — Anote um tipo.")
        # e o grupo com um parágrafo só (o número de linhas bate com o de grupos)
        self.assertEqual(saga_chapters("I, II — Draw a card.\nIII — Scry 1.", "Compre um card.\nUse vidência 1."), "I, II — Compre um card.\nIII — Use vidência 1.")

    def test_ler_adiante_fica_no_alto(self):
        en = "Read ahead (Choose a chapter and start with that many lore counters.)\nI — Draw a card.\nII — Scry 1."
        pt = "Adiantar leitura\nCompre um card.\nUse vidência 1."
        self.assertEqual(saga_chapters(en, pt), "Adiantar leitura\nI — Compre um card.\nII — Use vidência 1.")

    def test_nao_bate(self):
        self.assertIsNone(saga_chapters("I — Draw a card.\nII — Scry 1.", "Compre um card."))
        # parágrafos diferentes no mesmo grupo
        self.assertIsNone(saga_chapters("I, II — Draw a card.", "Compre um card.\nUse vidência 1."))
        self.assertIsNone(saga_chapters("Flying", "Voar"))

    def test_travessao_solto_no_capitulo(self):
        # Roads Go Ever, Ever On (HOB): o Arena traz "— Procure…" no primeiro capítulo
        en = "I — Search your library for up to two basic Plains cards.\nII, III — Put a card exiled with this Saga into its owner's hand."
        pt = "— Procure em seu grimório até dois cards de Planície básicos.\nColoque um card exilado.\nColoque um card exilado."
        self.assertEqual(saga_chapters(en, pt), "I — Procure em seu grimório até dois cards de Planície básicos.\nII, III — Coloque um card exilado.")

    def test_nome_do_capitulo_em_italico(self):
        # Invocações de Final Fantasy: o nome do capítulo é palavra de ambientação
        en = "I — Gungnir — Destroy target creature.\nII — Zantetsuken — Draw a card."
        pt = "I — Gungnir — Destrua a criatura alvo.\nII — Zantetsuken — Compre um card."
        self.assertEqual(ability_word_lines(en, pt, {"gungnir", "zantetsuken"}), [0, 1])


class SagaSupported(unittest.TestCase):
    base = {"frame": "2015", "layout": "saga", "border_color": "black", "type_line": "Enchantment — Saga", "frame_effects": []}

    def test_moldura_padrao(self):
        self.assertTrue(saga_supported(self.base))
        self.assertTrue(saga_supported({**self.base, "frame_effects": ["legendary"], "type_line": "Legendary Enchantment — Saga"}))
        self.assertTrue(saga_supported({**self.base, "frame_effects": ["enchantment"]}))
        # criatura Saga (Invocações de Final Fantasy): a moldura delas, conferida pelo motor (ADR 0042)
        self.assertTrue(saga_supported({**self.base, "type_line": "Enchantment Creature — Saga Knight"}))

    def test_fora(self):
        self.assertFalse(saga_supported({**self.base, "border_color": "borderless"}))
        self.assertFalse(saga_supported({**self.base, "frame_effects": ["showcase"]}))
        self.assertFalse(saga_supported({**self.base, "full_art": True}))
        self.assertFalse(saga_supported({**self.base, "frame": "2003"}))
        self.assertFalse(saga_supported({**self.base, "layout": "transform"}))


class PrepareSupported(unittest.TestCase):
    faces = [{"name": "Scathing Shadelock", "power": "4"}, {"name": "Venomous Words"}]
    base = {"frame": "2015", "layout": "prepare", "border_color": "black", "frame_effects": [], "card_faces": faces}

    def test_caixa_dividida(self):
        self.assertTrue(prepare_supported(self.base))
        self.assertTrue(prepare_supported({**self.base, "frame_effects": ["legendary"]}))
        # a arte estendida (Joined Researchers, SOS 312) tem a mesma caixa
        self.assertTrue(prepare_supported({**self.base, "frame_effects": ["extendedart"]}))
        self.assertTrue(prepare_supported({**self.base, "frame_effects": ["legendary", "extendedart"]}))

    def test_fora(self):
        # Ancestral Recall de SOS na moldura de 2003 e Bloodline Recollector de arte inteira (FRA 402)
        self.assertFalse(prepare_supported({**self.base, "frame": "2003"}))
        self.assertFalse(prepare_supported({**self.base, "full_art": True}))
        self.assertFalse(prepare_supported({**self.base, "frame_effects": ["showcase"]}))
        self.assertFalse(prepare_supported({**self.base, "layout": "adventure"}))
        self.assertFalse(prepare_supported({**self.base, "card_faces": self.faces[:1]}))
        self.assertFalse(adventure_supported(self.base))


class Divididas(unittest.TestCase):
    """Cartas divididas da moldura atual (ADR 0034) e as com Consequência (ADR 0035)."""

    faces = [{"name": "Thrash", "type_line": "Instant"}, {"name": "Threat", "type_line": "Sorcery"}]
    base = {"name": "Thrash // Threat", "frame": "2015", "layout": "split", "border_color": "black", "set": "rna", "card_faces": faces}
    aftermath = {**base, "name": "Dusk // Dawn", "set": "akh", "keywords": ["Aftermath"]}

    def test_dividida(self):
        self.assertTrue(split_supported(self.base))
        # as de Commander 2016 e as cartas de teste, a Consequência, o Fundir e as Salas têm outro desenho
        for code in ("c16", "cmb1", "unk"):
            self.assertFalse(split_supported({**self.base, "set": code}), code)
        self.assertFalse(split_supported(self.aftermath))
        self.assertFalse(split_supported({**self.base, "keywords": ["Fuse"]}))
        self.assertFalse(split_supported({**self.base, "card_faces": [{**f, "type_line": "Enchantment — Room"} for f in self.faces]}))
        # a de 2003 entra (ADR 0037), com a marca-d'água das guildas e sem o logotipo da FNM
        self.assertTrue(split_supported({**self.base, "frame": "2003", "set": "dis"}))
        guild = [{**f, "watermark": w} for f, w in zip(self.faces, ("azorius", "dimir"))]
        self.assertTrue(split_supported({**self.base, "frame": "2003", "set": "dis", "card_faces": guild}))
        fnm = [{**self.faces[0], "watermark": "fnm"}, self.faces[1]]
        self.assertFalse(split_supported({**self.base, "frame": "2003", "set": "f06", "card_faces": fnm}))
        # a antiga (ADR 0038): sem marca-d'água e fora da Secret Lair, como as cartas de pé dela
        self.assertTrue(split_supported({**self.base, "frame": "1997", "set": "apc"}))
        marked = [{**f, "watermark": "wotc"} for f in self.faces]
        self.assertFalse(split_supported({**self.base, "frame": "1997", "set": "apc", "card_faces": marked}))
        self.assertFalse(split_supported({**self.base, "frame": "1997", "set": "sld"}))
        self.assertFalse(split_supported({**self.base, "frame": "1997", "set": "wc01", "border_color": "gold"}))
        self.assertFalse(split_supported({**self.base, "frame": "1993"}))

    def test_fundir(self):
        fuse = {**self.base, "name": "Wear // Tear", "set": "cmr", "keywords": ["Fuse"]}
        self.assertTrue(fuse_supported(fuse))
        self.assertFalse(split_supported(fuse))
        self.assertFalse(fuse_supported(self.base))
        # as de Dragon's Maze, na moldura de 2003, entram (ADR 0037); a carta de teste do Unknown
        # Event fica de fora
        self.assertTrue(fuse_supported({**fuse, "frame": "2003", "set": "dgm"}))
        self.assertFalse(split_supported({**fuse, "frame": "2003", "set": "dgm"}))
        self.assertFalse(fuse_supported({**fuse, "set": "unk"}))

    def test_lembrete_do_fundir(self):
        pt = "Você pode conjurar uma ou ambas as metades deste card da sua mão."
        self.assertEqual(without_fuse("Destrua o artefato alvo.\nFundir"), "Destrua o artefato alvo.")
        self.assertEqual(without_fuse(f"Destrua o artefato alvo.\nFundir ({pt})"), "Destrua o artefato alvo.")
        self.assertEqual(without_fuse("Fundir os dois."), "Fundir os dois.")
        oracle = [{"oracle_id": "w", "layout": "split", "keywords": ["Fuse"]}, {"oracle_id": "f", "layout": "split", "keywords": []}]
        rows = [
            {"oracle_id": "w", "faces": [{"text_pt": "Destrua o artefato alvo.\nFundir"}, {"text_pt": f"Destrua o encantamento alvo.\nFundir ({pt})"}]},
            {"oracle_id": "f", "faces": [{"text_pt": "Destrua.\nFundir"}]},
        ]
        self.assertEqual(add_fuse_reminders(rows, oracle, {"*": {FUSE_EN: pt}}), 1)
        self.assertEqual([f["text_pt"] for f in rows[0]["faces"]], ["Destrua o artefato alvo.", "Destrua o encantamento alvo."])
        self.assertEqual(rows[0]["faces"][1]["reminder_pt"], f"Fundir ({pt})")
        self.assertNotIn("reminder_pt", rows[1]["faces"][0])
        # sem o lembrete oficial, nada muda
        self.assertEqual(add_fuse_reminders([{"oracle_id": "w", "faces": [{"text_pt": "A\nFundir"}]}], oracle, {}), 0)

    def test_consequencia(self):
        self.assertTrue(aftermath_supported(self.aftermath))
        self.assertTrue(aftermath_supported({**self.aftermath, "set": "c19"}))
        self.assertFalse(aftermath_supported(self.base))
        for extra in ({"border_color": "borderless"}, {"frame_effects": ["showcase"]}, {"frame": "2003"}, {"full_art": True}):
            self.assertFalse(aftermath_supported({**self.aftermath, **extra}), extra)
        self.assertFalse(frame_supported(self.aftermath))


ROOM_EN = "You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it."
ROOM_PT = "Você pode conjurar qualquer metade. Aquela porta é destrancada no campo de batalha. Como um feitiço, você pode pagar o custo de mana de uma porta trancada para destrancá-la."
ROOM_HINTS = [{"key": "AbilityHanger/Keyword/Room_Body", "en": ROOM_EN, "pt": ROOM_PT}]


class Salas(unittest.TestCase):
    """Salas de Duskmourn (ADR 0033): a moldura deitada, o lembrete da faixa do meio e as metades."""

    faces = [
        {"name": "Walk-In Closet", "type_line": "Enchantment — Room", "oracle_text": f"You may play lands from your graveyard.\n({ROOM_EN})"},
        {"name": "Forgotten Cellar", "type_line": "Enchantment — Room", "oracle_text": f"When you unlock this door, mill three cards.\n({ROOM_EN})"},
    ]
    base = {"name": "Walk-In Closet // Forgotten Cellar", "frame": "2015", "layout": "split", "border_color": "black", "card_faces": faces}

    def test_suportada(self):
        self.assertTrue(room_supported(self.base))

    def test_fora(self):
        # as sem borda de Booster Fun (DSK 297 a 306) e as cartas divididas que não são Salas
        self.assertFalse(room_supported({**self.base, "border_color": "borderless", "frame_effects": ["inverted"]}))
        self.assertFalse(room_supported({**self.base, "card_faces": [{**f, "type_line": "Instant"} for f in self.faces]}))
        self.assertFalse(room_supported({**self.base, "frame": "2003"}))
        self.assertFalse(frame_supported(self.base))

    def test_lembrete_da_dica(self):
        self.assertEqual(room_reminder(self.faces[0]["oracle_text"], ROOM_HINTS), f"({ROOM_PT})")
        # sem a dica, ou com outro lembrete no Oracle, nada
        self.assertIsNone(room_reminder(self.faces[0]["oracle_text"], []))
        self.assertIsNone(room_reminder("You may play lands from your graveyard.\n(You may cast either half.)", ROOM_HINTS))

    def test_texto_sem_o_lembrete(self):
        self.assertEqual(without_room_reminder(self.faces[0]["oracle_text"]), "You may play lands from your graveyard.")
        self.assertIsNone(without_room_reminder(None))

    def test_lembrete_em_cada_face(self):
        rows = [{"oracle_id": "x", "layout": "split", "faces": [{"name_pt": "Armário"}, {"name_pt": "Porão Esquecido"}]}]
        self.assertEqual(add_room_reminders(rows, [{**self.base, "oracle_id": "x"}], ROOM_HINTS), 1)
        self.assertEqual([f["reminder_pt"] for f in rows[0]["faces"]], [f"({ROOM_PT})"] * 2)

    def test_metades_do_arena(self):
        # o Arena traz a carta inteira antes das metades: cada metade casa com a dela, sem o lembrete
        arena = [{"name_en": "Walk-In Closet // Forgotten Cellar"}, {"name_en": "Walk-In Closet"}, {"name_en": "Forgotten Cellar"}]
        self.assertIsNone(en_face_of(self.base, arena, 0).get("oracle_text"))
        self.assertEqual(en_face_of(self.base, arena, 1)["oracle_text"], "You may play lands from your graveyard.")
        self.assertEqual(en_face_of(self.base, arena, 2)["oracle_text"], "When you unlock this door, mill three cards.")
        self.assertEqual(en_face_of(self.base, arena[1:], 1)["name"], "Forgotten Cellar")

    def test_nome_da_carta_inteira(self):
        arena = [{"name_en": "Walk-In Closet // Forgotten Cellar", "name_pt": "Armário // Porão Esquecido"}, {"name_en": "Walk-In Closet", "name_pt": "Armário"}, {"name_en": "Forgotten Cellar", "name_pt": "Porão Esquecido"}]
        self.assertEqual(arena_name_pt(arena), "Armário // Porão Esquecido")
        self.assertEqual(arena_name_pt(arena[1:]), "Armário // Porão Esquecido")

    def test_separador_das_consequencias_no_arena(self):
        # Dusk // Dawn (AKR) e Crime // Punishment (OTP) vêm do Arena com " /// ": sem trocar, a
        # carta casava pela primeira metade e o nome saía "Anoitecer // Anoitecer /// Alvorecer"
        self.assertEqual(arena_name("Dusk /// Dawn"), "Dusk // Dawn")
        self.assertEqual(arena_name("Anoitecer /// Alvorecer"), "Anoitecer // Alvorecer")
        self.assertEqual(arena_name("Find // Finality"), "Find // Finality")
        self.assertEqual(arena_name("Llanowar Elves"), "Llanowar Elves")
        self.assertIsNone(arena_name(None))
        arena = [{"name_en": arena_name("Dusk /// Dawn"), "name_pt": arena_name("Anoitecer /// Alvorecer")}, {"name_en": "Dusk", "name_pt": "Anoitecer"}, {"name_en": "Dawn", "name_pt": "Alvorecer"}]
        self.assertEqual(arena_name_pt(arena), "Anoitecer // Alvorecer")

    def test_metade_com_o_nome_inteiro_no_arena(self):
        # Hustle // Bustle (MKM 249): o Arena dá à Hustle o nome da carta inteira
        faces = [
            {"name_en": "Hustle // Bustle", "name_pt": "Burburinho // Agitação"},
            {"name_en": "Hustle", "name_pt": "Burburinho // Agitação"},
            {"name_en": "Bustle", "name_pt": "Agitação"},
        ]
        self.assertEqual([f["name_pt"] for f in half_names(faces)], ["Burburinho // Agitação", "Burburinho", "Agitação"])
        # Turn // Burn: o Arena dá às metades "turno" e "A Queima"; a carta impressa é Transformar // Queimar
        turn = [
            {"name_en": "Turn // Burn", "name_pt": "Transformar // Queimar"},
            {"name_en": "Turn", "name_pt": "turno"},
            {"name_en": "Burn", "name_pt": "A Queima"},
        ]
        self.assertEqual([f["name_pt"] for f in half_names(turn)[1:]], ["Transformar", "Queimar"])
        # sem a carta inteira na frente (as de duas faces), nada muda
        dfc = [{"name_en": "Delver of Secrets", "name_pt": "A // B"}, {"name_en": "Insectile Aberration", "name_pt": "C"}]
        self.assertEqual(half_names(dfc)[0]["name_pt"], "A // B")

    def test_dividida_do_arena_so_pelo_nome_inteiro(self):
        start = {"faces": [{"name_en": "Start"}, {"name_en": "Start // Finish"}]}
        delver = {"faces": [{"name_en": "Delver of Secrets"}, {"name_en": "Insectile Aberration"}]}
        arena = {"Start": start, "Start // Finish": {"faces": []}, "Delver of Secrets": delver}
        # a carta de teste Start // Fire não é a Start // Finish do Arena
        self.assertIsNone(arena_entry(arena, "Start // Fire"))
        self.assertIs(arena_entry(arena, "Start // Finish"), arena["Start // Finish"])
        # as de duas faces casam pela primeira
        self.assertIs(arena_entry(arena, "Delver of Secrets // Insectile Aberration"), delver)
        self.assertIsNone(arena_entry(arena, "Llanowar Elves"))

    def test_nome_inteiro_em_cada_metade_impressa(self):
        # Assure // Assemble de RVR: o Scryfall põe "Fortalecer // Formar" nas duas metades
        card = {"card_faces": [{"name": "Assure", "printed_name": "Fortalecer // Formar"}, {"name": "Assemble", "printed_name": "Fortalecer // Formar"}]}
        self.assertEqual([f["name_pt"] for f in printed_faces(card)], ["Fortalecer", "Formar"])

    def test_metades_trocadas_de_invasion(self):
        card = {"set": "inv", "collector_number": "294", "card_faces": [{"name": "Pain", "printed_name": "Sofrimento"}, {"name": "Suffering", "printed_name": "Dor"}]}
        fixed = swap_half_names(card)
        self.assertEqual([f["printed_name"] for f in fixed["card_faces"]], ["Dor", "Sofrimento"])
        self.assertEqual(fixed["printed_name"], "Dor // Sofrimento")
        # as de Apocalypse estão certas
        apc = {"set": "apc", "collector_number": "128", "card_faces": [{"name": "Fire", "printed_name": "Fogo"}, {"name": "Ice", "printed_name": "Gelo"}]}
        self.assertIs(swap_half_names(apc), apc)

    def test_a_com_anel_no_nome_impresso(self):
        # Aladdin's Lamp da Quarta Edição: o Scryfall tem "Låmpada de Aladin"
        card = {"name": "Aladdin's Lamp", "printed_name": "Låmpada de Aladin"}
        self.assertEqual(fix_ring_a(card)["printed_name"], "Lâmpada de Aladin")
        # com o "å" no nome em inglês, fica
        nordic = {"name": "Ålborg", "printed_name": "Ålborg"}
        self.assertIs(fix_ring_a(nordic), nordic)
        ok = {"name": "Pestilence", "printed_name": "Pestilência"}
        self.assertIs(fix_ring_a(ok), ok)

    def test_segunda_metade_no_texto_da_primeira(self):
        # Assault // Battery de TSB: o Scryfall tem a segunda metade inteira no texto da primeira
        card = {
            "card_faces": [
                {"name": "Assault", "printed_text": "Assalto causa 2 pontos de dano à criatura alvo ou jogador alvo.\n//\nBateria\no3oG\nFeitiço\nColoque em jogo uma ficha."},
                {"name": "Battery", "printed_text": "Coloque em jogo uma ficha."},
            ]
        }
        self.assertEqual([f["text_pt"] for f in printed_faces(card)], ["Assalto causa 2 pontos de dano à criatura alvo ou jogador alvo.", "Coloque em jogo uma ficha."])


class AdventureSupported(unittest.TestCase):
    faces = [{"name": "Bonecrusher Giant", "power": "4"}, {"name": "Stomp"}]
    base = {"frame": "2015", "layout": "adventure", "border_color": "black", "frame_effects": [], "card_faces": faces}

    def test_moldura_de_livro(self):
        self.assertTrue(adventure_supported(self.base))
        self.assertTrue(adventure_supported({**self.base, "frame_effects": ["legendary"]}))
        # o Presságio de TDM tem o mesmo layout e as mesmas medidas
        self.assertTrue(adventure_supported({**self.base, "promo_types": ["prerelease"]}))

    def test_fora(self):
        self.assertFalse(adventure_supported({**self.base, "frame_effects": ["showcase"]}))
        self.assertFalse(adventure_supported({**self.base, "frame_effects": ["extendedart"]}))
        self.assertFalse(adventure_supported({**self.base, "border_color": "borderless", "frame_effects": ["inverted"]}))
        self.assertFalse(adventure_supported({**self.base, "promo_types": ["gameday"]}))
        self.assertFalse(adventure_supported({**self.base, "layout": "normal"}))
        self.assertFalse(adventure_supported({**self.base, "card_faces": self.faces[:1]}))

    def test_impressao_marcada(self):
        card = {
            **self.base,
            "id": "x",
            "set": "eld",
            "set_name": "Throne of Eldraine",
            "collector_number": "115",
            "image_uris": {"png": "https://cards.scryfall.io/png/front/x.png"},
            "card_faces": [{"name": "Bonecrusher Giant", "power": "4", "toughness": "3", "mana_cost": "{2}{R}"}, {"name": "Stomp", "mana_cost": "{1}{R}"}],
        }
        row = print_row(card, "o", card["card_faces"][0], None)
        self.assertTrue(row["supported"])
        self.assertEqual(row["mana_cost"], "{2}{R}")
        self.assertTrue(row["has_pt"])
        self.assertFalse(row["two_sided"])


if __name__ == "__main__":
    unittest.main()


class TokenKey(unittest.TestCase):
    def test_barreira_artefato_nao_casa_com_a_que_nao_e(self) -> None:
        # THB: "Token Artifact Creature — Wall"; o Arena tem a da MSH, "Token Creature", mais nova
        thb = token_key("Wall", "0", "4", "Defender", "Token Artifact Creature — Wall")
        msh = token_key("Wall", "0", "4", "Defender", "Token Creature")
        self.assertNotEqual(thb, msh)
        self.assertEqual(thb, token_key("Wall", "0", "4", "Defender", "Token Artifact Creature"))

    def test_ordem_dos_tipos_e_token_no_fim(self) -> None:
        # o Arena escreve às vezes sem "Token" e com outra ordem
        self.assertEqual(
            token_key("Elf", "1", "1", "", "Legendary Token Creature — Elf"),
            token_key("Elf", "1", "1", "", "Token Legendary Creature"),
        )

    def test_face_de_duas_faces_pelas_cores(self) -> None:
        # Vampiro branco da ficha de duas faces (F17) não é o Vampiro branco e preto
        face = {"name": "Vampire", "power": "1", "toughness": "1", "oracle_text": "Lifelink", "type_line": "Token Creature — Vampire", "colors": ["W"]}
        self.assertNotEqual(token_face_key(face), token_face_key({**face, "colors": ["W", "B"]}))
        self.assertEqual(token_face_key(face), token_face_key(dict(face)))


class IntrinsicMana(unittest.TestCase):
    def test_terreno_com_tipo_basico(self) -> None:
        # Túmulo Aquoso: "{T}: Adicione {U}." e "{T}: Adicione {B}." vêm do tipo Ilha Pântano
        self.assertTrue(is_intrinsic_mana("Land", "Island Swamp", "{oT}: Add {oU}."))
        self.assertTrue(is_intrinsic_mana("Land", "Island Swamp", "{oT}: Add {oB}."))
        self.assertTrue(is_intrinsic_mana("Snow Land", "Forest Plains", "{oT}: Add {oW}."))

    def test_habilidade_de_verdade(self) -> None:
        self.assertFalse(is_intrinsic_mana("Creature", "Elf Druid", "{oT}: Add {oG}."))  # Elfos de Llanowar
        self.assertFalse(is_intrinsic_mana("Land", "", "{oT}: Add {oG}."))  # terreno sem tipo básico
        self.assertFalse(is_intrinsic_mana("Land", "Island Swamp", "{oT}: Add {oR}."))  # outra cor
        self.assertFalse(is_intrinsic_mana("Land", "Island", "{oT}: Add {oU} or {oB}."))


ITALIC = {"landfall", "unreliable visions", "undying vengeance", "descend", "threshold"}


class AbilityWordLinesTest(unittest.TestCase):
    def test_palavra_de_habilidade(self):
        en = "Flying\nLandfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn."
        pt = "Voar\nAterragem — Toda vez que um terreno entra no campo de batalha sob o seu controle, esta criatura recebe +2/+2."
        self.assertEqual(ability_word_lines(en, pt, ITALIC), [1])

    def test_duas_palavras_de_ambientacao(self):
        en = "Unreliable Visions — At the beginning…\nUndying Vengeance — Whenever you play…"
        pt = "Visões não confiáveis — No início…\nVingança imortal — Toda vez que…"
        self.assertEqual(ability_word_lines(en, pt, ITALIC), [0, 1])

    def test_custo_de_palavra_chave_e_escolha(self):
        # "Ward—Pay" sem espaço não é palavra de habilidade; "Choose one —" não tem texto depois
        self.assertIsNone(ability_word_lines("Ward—Pay 2 life.", "Salvaguarda — Pague 2 pontos de vida.", ITALIC))
        self.assertIsNone(ability_word_lines("Choose one —\n• Draw a card.", "Escolha um —\n• Compre um card.", ITALIC))

    def test_contagem_diferente(self):
        en = "Landfall — Whenever a land enters, scry 1."
        pt = "Aterragem — Toda vez que um terreno entra, use vidência 1.\nSalvaguarda — Pague 2 pontos de vida."
        self.assertIsNone(ability_word_lines(en, pt, ITALIC))

    def test_palavra_chave_com_travessao_fica_em_tipo_comum(self):
        # "Max speed —" é palavra-chave (Zahur, Passado da Glória, DFT): a carta impressa não
        # tem itálico; o "Threshold —" da mesma carta, sim
        en = "Max speed — Whenever a nontoken creature you control dies, draw a card.\nThreshold — This creature gets +1/+1."
        pt = "Velocidade máxima — Toda vez que uma criatura não ficha que você controla morrer, compre um card.\nLimiar — Esta criatura recebe +1/+1."
        self.assertEqual(ability_word_lines(en, pt, ITALIC), [1])
        self.assertIsNone(ability_word_lines("I, II — Draw a card.", "I, II — Compre um card.", ITALIC))

    def test_palavra_com_numero(self):
        en = "Descend 4 — Whenever you attack, scry 1."
        pt = "Descender 4 — Toda vez que você atacar, use vidência 1."
        self.assertEqual(ability_word_lines(en, pt, ITALIC), [0])


class IndicadorDeCor(unittest.TestCase):
    """O círculo à esquerda do tipo nas cartas de uma face só (Crashing Footfalls) era apagado."""

    base = {"id": "x", "set": "mh1", "set_name": "Modern Horizons", "collector_number": "160", "layout": "normal", "frame": "2015", "border_color": "black", "type_line": "Sorcery"}

    def test_carta_com_indicador(self):
        c = {**self.base, "color_indicator": ["G"], "mana_cost": ""}
        self.assertTrue(print_row(c, "o", c, None)["indicator"])

    def test_carta_sem_indicador(self):
        c = {**self.base, "mana_cost": "{G}"}
        self.assertFalse(print_row(c, "o", c, None)["indicator"])


class TraducaoNaoOficial(unittest.TestCase):
    """ADR 0025: carta sem texto oficial em PT, montada com as linhas das oficiais e as traduzidas."""

    def test_chave_sem_lembrete_e_com_o_nome_como_til(self) -> None:
        line = "Flying (This creature can't be blocked except by creatures with flying or reach.)"
        self.assertEqual(line_key(line, ["X"]), "Flying")
        # o nome mais comprido primeiro: "Alexios, Deimos of Kosmos" antes de "Alexios"
        self.assertEqual(
            line_key("Alexios, Deimos of Kosmos attacks each combat. Alexios can't be sacrificed.", ["Alexios", "Alexios, Deimos of Kosmos"]),
            "~ attacks each combat. ~ can't be sacrificed.",
        )
        # depois de "a" ou "an", o nome é o de um tipo (Coward // Killer): fica, para sair "Covarde"
        self.assertEqual(
            line_key("Target creature can't block this turn and becomes a Coward in addition to its other types until end of turn.", ["Coward"]),
            "Target creature can't block this turn and becomes a Coward in addition to its other types until end of turn.",
        )
        self.assertEqual(line_key("Coward deals 1 damage to any target.", ["Coward"]), "~ deals 1 damage to any target.")
        # no PT o "a" é preposição e o nome sai
        self.assertEqual(line_key("Previne todo o dano que seria causado a Leão Fulgente.", ["Leão Fulgente"], pt=True), "Previne todo o dano que seria causado a ~.")

    def test_molde_leva_o_plural(self) -> None:
        # "1 ponto de vida" e "3 pontos de vida": o molde de uma não serve à outra
        self.assertNotEqual(mold("You gain 1 life."), mold("You gain 3 life."))
        self.assertEqual(mold("You gain 3 life."), mold("You gain 2 life."))
        self.assertEqual(mold("{2}{W}, {T}: Draw a card."), mold("{1}{U}, {T}: Draw a card."))
        self.assertEqual(fill_mold("You gain 4 life.", mold("Você ganha 2 pontos de vida.")), "Você ganha 4 pontos de vida.")
        self.assertEqual(fill_mold("{1}{U}, {T}: Draw a card.", mold("{2}{W}, {T}: Compre um card.")), "{1}{U}, {T}: Compre um card.")

    def oracle(self) -> dict[str, dict]:
        return {
            "a": {"name": "Arena Card", "oracle_text": "Flying\nWhen ~ enters, you gain 3 life.".replace("~", "Arena Card"), "type_line": "Creature — Bird"},
            "i": {"name": "Printed Card", "oracle_text": "Flying", "type_line": "Creature — Bird Soldier"},
            "x": {"name": "Odd Card", "oracle_text": "Flying\nVigilance", "type_line": "Creature — Bird"},
        }

    def rows(self) -> list[dict]:
        def face(name: str, type_pt: str, text: str) -> dict:
            return {"name_pt": name, "type_pt": type_pt, "text_pt": text}

        return [
            {"oracle_id": "a", "source": "arena", "name_pt": "Carta do Arena",
             "faces": [face("Carta do Arena", "Criatura — Ave", "Voar\nQuando Carta do Arena entrar, você ganha 3 pontos de vida.")]},
            {"oracle_id": "i", "source": "impresso", "name_pt": "Carta Impressa",
             "faces": [face("Carta Impressa", "Criatura — Pássaro Soldado", "Voando")]},
            # número de linhas diferente: não casa nada
            {"oracle_id": "x", "source": "arena", "name_pt": "Carta Estranha", "faces": [face("Carta Estranha", "Criatura — Ave", "Voar e vigilância")]},
        ]

    def test_linhas_oficiais_com_o_arena_na_frente(self) -> None:
        best, molds = official_lines(self.rows(), self.oracle())
        self.assertEqual(best["Flying"], "Voar")  # o "Voando" da impressa perde
        self.assertEqual(best["When ~ enters, you gain 3 life."], "Quando ~ entrar, você ganha 3 pontos de vida.")
        self.assertNotIn("Vigilance", best)
        self.assertEqual(molds[mold("When ~ enters, you gain 5 life.")], mold("Quando ~ entrar, você ganha 3 pontos de vida."))

    def test_tipo_pelo_que_ja_saiu_oficial(self) -> None:
        heads, subs = official_types(self.rows(), self.oracle())
        self.assertEqual(heads["Creature"], "Criatura")
        self.assertEqual(subs["Bird"], "Ave")  # o Arena pesa o dobro
        self.assertEqual(subs["Soldier"], "Soldado")
        extra = {"Time Lord": "Senhor do Tempo", "Cow": "Vaca"}
        self.assertEqual(translate_type("Creature — Bird Soldier", heads, subs, extra), "Criatura — Ave Soldado")
        self.assertEqual(translate_type("Creature — Time Lord Soldier", heads, subs, extra), "Criatura — Senhor do Tempo Soldado")
        self.assertEqual(translate_type("Creature", heads, subs, extra), "Criatura")
        # o tipo de planeswalker é nome próprio
        self.assertEqual(translate_type("Planeswalker — Nissa", {"Planeswalker": "Planeswalker"}, subs, extra), "Planeswalker — Nissa")
        # sem tradução de uma parte, nada
        self.assertIsNone(translate_type("Creature — Wolf", heads, subs, extra))
        self.assertIsNone(translate_type("Kindred Creature — Bird", heads, subs, extra))
        self.assertIsNone(translate_type(None, heads, subs, extra))

    def test_subtipo_fora_da_ordem_do_ingles(self) -> None:
        # "Elder Dragon" é "Dragão Ancião": casado palavra por palavra, o "Elder" virava "Dragão" e a
        # carta saía "Dragão Dragão" (Hraesvelgr of the First Brood)
        lines = [("Creature — Dragon", "Criatura — Dragão")] * 3 + [("Creature — Spirit", "Criatura — Espírito")] * 3
        lines += [("Legendary Creature — Elder Dragon", "Criatura Lendária — Dragão Ancião")] * 2 + [("Creature — Zubera Spirit", "Criatura — Espírito Zubera")]
        oracle = {str(i): {"name": str(i), "type_line": en} for i, (en, _) in enumerate(lines)}
        rows = [{"oracle_id": str(i), "source": "impresso", "faces": [{"type_pt": pt}]} for i, (_, pt) in enumerate(lines)]
        heads, subs = official_types(rows, oracle)
        self.assertEqual((subs["Elder"], subs["Dragon"], subs["Zubera"], subs["Spirit"]), ("Ancião", "Dragão", "Zubera", "Espírito"))
        self.assertEqual(translate_type("Legendary Creature — Elder Dragon", heads, subs, {}), "Criatura Lendária — Dragão Ancião")
        self.assertEqual(translate_type("Creature — Zubera Spirit", heads, subs, {}), "Criatura — Espírito Zubera")
        self.assertEqual(translate_type("Creature — Spirit Dragon", heads, subs, {}), "Criatura — Espírito Dragão")

    def test_faces_pela_linha_oficial_pelo_molde_e_pela_traduzida(self) -> None:
        best = {"Flying": "Voar"}
        molds = {mold("You gain 2 life."): mold("Você ganha 2 pontos de vida.")}
        lines = {"~ can't block.": "~ não pode bloquear."}
        heads, subs = {"Creature": "Criatura"}, {"Bird": "Ave"}
        card = {"name": "New Bird", "type_line": "Creature — Bird", "mana_cost": "{1}{W}",
                "oracle_text": "Flying\nYou gain 4 life.\nNew Bird can't block.\n(Reminder alone.)"}
        faces = unofficial_faces(card, [], best, molds, lines, heads, subs, {})
        self.assertEqual(faces, [{"name_en": "New Bird", "name_pt": "New Bird", "type_pt": "Criatura — Ave",
                                  "text_pt": "Voar\nVocê ganha 4 pontos de vida.\nNew Bird não pode bloquear.", "flavor_pt": None, "mana_cost": "{1}{W}"}])
        # com o nome impresso em PT, ele entra no lugar do "~"
        self.assertEqual(unofficial_faces(card, ["Ave Nova"], best, molds, lines, heads, subs, {})[0]["text_pt"].split("\n")[2], "Ave Nova não pode bloquear.")
        # uma linha sem tradução: a carta fica em inglês
        self.assertIsNone(unofficial_faces({**card, "oracle_text": "Flying\nTrample"}, [], best, molds, lines, heads, subs, {}))
        # tipo sem tradução também
        self.assertIsNone(unofficial_faces({**card, "type_line": "Creature — Wolf"}, [], best, molds, lines, heads, subs, {}))

    def test_linhas_traduzidas_com_os_mesmos_numeros_e_simbolos(self) -> None:
        # cada linha de data/traducao/linhas.json: os mesmos símbolos, números, "X" e "~" nos dois idiomas
        mark = re.compile(r"\{[^}]+\}|[+-]?\d+/[+-]?\d+|[+-]?\d+|~|\bX\b")
        lines, types = build.load_unofficial()
        self.assertGreater(len(lines), 1000)
        for en, pt in lines.items():
            self.assertEqual(sorted(mark.findall(en)), sorted(mark.findall(pt)), en)
            self.assertEqual(line_key(en, []), en, "a chave é a linha do Oracle sem lembrete")
            self.assertTrue(pt.strip() and "\n" not in pt, en)
        self.assertTrue(all(pt and pt[0].isupper() for pt in types.values()))

    def test_subtipo_no_texto_com_o_nome_oficial(self) -> None:
        # "Wall" é "Barreira" nas cartas oficiais: "Muralha" no texto não batia com a linha de tipo
        subs = {"Wall": "Barreira", "Dog": "Cão", "Spider": "Aranha", "Drake": "Dragonete", "Beast": "Besta", "Bear": "Urso", "Eye": "Olho", "Klingon": "Klingon"}
        extra = {"Bobblehead": "Boneco Cabeçudo"}
        lines = {
            "Destroy target Wall.": "Destrua a Muralha alvo.",
            "Walls you control get +1/+1.": "As Barreiras que você controla recebem +1/+1.",
            "Destroy each non-Wall creature.": "Destrua cada criatura não Barreira.",
            "Other Dogs you control have vigilance.": "Os outros Cães que você controla têm vigilância.",
            "X is the number of Bobbleheads you control.": "X é o número de Bonecos Cabeçudos que você controla.",
            "Klingons you control have menace.": "Os Klingons que você controla têm ameaçar.",
            # nomes próprios: hífen, depois de outra maiúscula ou de "The", antes de outra maiúscula ou de "of"
            "Whenever Ghost-Spider attacks, draw a card.": "Toda vez que Ghost-Spider atacar, compre um card.",
            "Whenever Nathan Drake attacks, draw a card.": "Toda vez que Nathan Drake atacar, compre um card.",
            "The Beast enters tapped.": "The Beast entra virado.",
            "Bear Witness — Whenever a creature dies, investigate.": "Prestar Testemunho — Toda vez que uma criatura morrer, investigue.",
            "Partner with Okaun, Eye of Chaos": "Parceiro de Okaun, Eye of Chaos",
            "Create a 2/2 green Beast creature token.": "Crie uma ficha de criatura Fera verde 2/2.",
        }
        self.assertEqual(
            subtype_mismatches(lines, subs, extra),
            [("Destroy target Wall.", "Wall", "Barreira"), ("Create a 2/2 green Beast creature token.", "Beast", "Besta")],
        )

    def test_faltam_lista_o_subtipo_sem_nome_que_segura_a_carta(self) -> None:
        # todas as linhas traduzidas e o subtipo sem nome em PT: a carta segue em inglês. O subtipo
        # que só saiu em PT numa ficha também segura, porque o pipeline não lê os tipos das fichas
        legal = {"commander": "legal"}
        oracle = {
            "a": {"oracle_id": "a", "name": "Arena Bird", "oracle_text": "Flying", "type_line": "Creature — Bird", "legalities": legal},
            "t": {"oracle_id": "t", "name": "Germ", "oracle_text": "", "type_line": "Token Creature — Germ", "layout": "token", "legalities": legal},
            "n": {"oracle_id": "n", "name": "Night Bird", "oracle_text": "Flying", "type_line": "Creature — Bird Nightstalker", "legalities": legal},
            "g": {"oracle_id": "g", "name": "Space Germ", "oracle_text": "Flying", "type_line": "Creature — Germ", "legalities": legal},
            "o": {"oracle_id": "o", "name": "Odd Bird", "oracle_text": "Flying\nSomething new.", "type_line": "Creature — Bird Nightstalker", "legalities": legal},
            # folha de adesivos: não vai no deck e fica fora da lista
            "s": {"oracle_id": "s", "name": "Odd Stickers", "oracle_text": "{TK}{TK} — Flying", "type_line": "Stickers", "legalities": legal},
        }
        cards = [
            {"oracle_id": "a", "source": "arena", "name_pt": "Ave do Arena", "faces": [{"name_pt": "Ave do Arena", "type_pt": "Criatura — Ave", "text_pt": "Voar"}]},
            {"oracle_id": "t", "source": "arena", "layout": "token", "name_pt": "Germe", "faces": [{"name_pt": "Germe", "type_pt": "Ficha de Criatura — Germe", "text_pt": ""}]},
            {"oracle_id": "n", "source": None, "faces": []},
            {"oracle_id": "g", "source": None, "faces": []},
            {"oracle_id": "o", "source": None, "faces": []},
            {"oracle_id": "s", "source": None, "faces": []},
        ]
        with mock.patch.object(build, "load_unofficial", return_value=({}, {})):
            self.assertEqual(faltam.held_by_type(cards, oracle), [("Germ", ["Space Germ"]), ("Nightstalker", ["Night Bird"])])
            self.assertEqual([t["en"] for t in faltam.missing(cards, oracle)], ["Something new."])
        with mock.patch.object(build, "load_unofficial", return_value=({}, {"Nightstalker": "Espreitador Noturno", "Germ": "Germe"})):
            self.assertEqual(faltam.held_by_type(cards, oracle), [])

    def test_so_a_carta_sem_texto_oficial_ganha_a_traducao(self) -> None:
        oracle = [
            {"oracle_id": "a", "name": "Arena Card", "oracle_text": "Flying", "type_line": "Creature — Bird"},
            {"oracle_id": "n", "name": "New Bird", "oracle_text": "Flying\nNew Bird can't block.", "type_line": "Creature — Bird"},
            {"oracle_id": "m", "name": "Named Bird", "oracle_text": "Flying", "type_line": "Creature — Bird"},
            {"oracle_id": "z", "name": "Hard Bird", "oracle_text": "Flying\nSomething new.", "type_line": "Creature — Bird"},
        ]
        rows = [
            {"oracle_id": "a", "source": "arena", "name_pt": "Ave do Arena",
             "faces": [{"name_pt": "Ave do Arena", "type_pt": "Criatura — Ave", "text_pt": "Voar"}]},
            {"oracle_id": "n", "source": None, "name_pt": None, "faces": []},
            # só o nome impresso em PT (a imagem do Scryfall é a inglesa com o selo)
            {"oracle_id": "m", "source": None, "name_pt": "Ave Nomeada", "faces": []},
            {"oracle_id": "z", "source": None, "name_pt": None, "faces": []},
        ]
        with mock.patch.object(build, "load_unofficial", return_value=({"~ can't block.": "~ não pode bloquear."}, {})):
            self.assertEqual(add_unofficial(rows, oracle, {}, {}, {}), 2)
        self.assertEqual(rows[0]["source"], "arena")
        self.assertEqual((rows[1]["source"], rows[1]["name_pt"]), ("nao-oficial", "New Bird"))
        self.assertEqual(rows[1]["faces"][0]["text_pt"], "Voar\nNew Bird não pode bloquear.")
        self.assertEqual((rows[2]["source"], rows[2]["name_pt"], rows[2]["faces"][0]["name_pt"]), ("nao-oficial", "Ave Nomeada", "Ave Nomeada"))
        self.assertIsNone(rows[3]["source"])

    def test_emblema_herda_a_marca_do_planeswalker(self) -> None:
        # o emblema vem das aspas do planeswalker: com a tradução não oficial dele, sai marcado igual
        pw = {"oracle_id": "p", "name_pt": "Teferi, Who Slows the Sunset", "source": "nao-oficial",
              "faces": [{"name_pt": "Teferi, Who Slows the Sunset", "type_pt": "Planeswalker Lendário — Teferi",
                         "text_pt": "−7: Você recebe um emblema com “Desvire todas as permanentes que você controla durante a etapa de desvirar de cada outro jogador.”"}]}
        t = {"name": "Teferi Emblem", "type_line": "Emblem — Teferi", "all_parts": [{"id": "x"}]}
        face = emblem_face(t, {"p": pw}, {"x": "p"})
        self.assertEqual((face["source"], face["type_pt"]), ("nao-oficial", "Emblema — Teferi"))

