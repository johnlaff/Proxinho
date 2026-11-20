"""Testes do pipeline de dados: python3 -m unittest discover -s data/pipeline."""

import unittest

from build import ability_word_lines, arena_symbols, balance_parens, borderless_supported, cites_alt_name, clean_rules, drop_invisible, drop_repeated_words, emblem_text, fix_glued_symbols, fix_arena_typos, fix_breaks, fix_spacing, flavor_key, frame_supported, is_intrinsic_mana, keep_earlier_flavor, mark_text_flavor, print_flavor, pick_printed, print_row, printed_faces, printed_has_text, pw_costs, add_reminders, reminder_texts, saga_chapters, saga_reminder, saga_reminders, saga_supported, token_face_key, token_key


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

    def test_game_day_com_a_arte_atras_da_caixa(self) -> None:
        # Thunderbreak Regent (pdtk 162): o Scryfall não marca full_art
        self.assertFalse(frame_supported({**self.base, "full_art": False, "promo_types": ["setpromo", "gameday"]}))

    def test_game_day_do_wizards_play_network_tem_moldura_comum(self) -> None:
        # Consider (pw22 1)
        self.assertTrue(frame_supported({**self.base, "promo_types": ["wizardsplaynetwork", "gameday"]}))

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
        self.assertEqual(saga_reminders(printed), {self.EN: self.PT, self.LER_EN: self.LER_PT})

    def test_vai_no_alto_do_texto_do_arena(self):
        # Urza's Saga, Book of Mazarbul: sem o lembrete, a faixa do alto ficava vazia
        texto = "I — Compre um card.\nII — Use vidência 2."
        self.assertEqual(saga_reminder(self.EN + "\nI — Draw a card.\nII — Scry 2.", texto, {self.EN: self.PT}), self.PT + "\n" + texto)
        # já com o lembrete, ou sem lembrete conhecido, fica como está
        self.assertEqual(saga_reminder(self.EN, self.PT + "\n" + texto, {self.EN: self.PT}), self.PT + "\n" + texto)
        self.assertEqual(saga_reminder("(Another reminder.)\nI — Draw a card.", texto, {self.EN: self.PT}), texto)

    def test_adiantar_leitura_ganha_a_explicacao(self):
        # The Phasing of Zhalfir (DMU): o Arena traz só "Adiantar leitura"
        en = self.LER_EN + "\nI — Draw a card."
        self.assertEqual(saga_reminder(en, "Adiantar leitura\nI — Compre um card.", {self.LER_EN: self.LER_PT}), self.LER_PT + "\nI — Compre um card.")
        # palavra-chave diferente da impressa: não mistura
        self.assertEqual(saga_reminder(en, "Ler adiante\nI — Compre um card.", {self.LER_EN: self.LER_PT}), "Ler adiante\nI — Compre um card.")


class KeywordReminders(unittest.TestCase):
    """O lembrete de palavra-chave vem das cartas impressas em PT; o Arena não o traz."""

    AMASS = "Put a +1/+1 counter on an Army you control. It's also an Orc. If you don't control an Army, create a 0/0 black Orc Army creature token first."
    ARREG = "Coloque um marcador +1/+1 em um Exército que você controla. Ele também é um Orc. Se você não controlar um Exército, crie antes uma ficha de criatura Orc Exército preta 0/0."

    def print_(self, oid: str, pt: str, released: str) -> dict:
        return {"oracle_id": oid, "printed_text": pt, "released_at": released}

    def test_lembrete_das_impressas(self):
        oracle = {
            "a": {"oracle_text": f"Amass Orcs 1. ({self.AMASS})"},
            "b": {"oracle_text": "Flashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"},
            "c": {"oracle_text": "Scry 1. (Look at the top card of your library.)\nCycling {2} ({2}, Discard this card: Draw a card.)"},
        }
        prints = [
            self.print_("a", f"Arregimente Orcs 1. ({self.ARREG})", "2023-06-23"),
            # a impressão mais nova ganha: a antiga usa "jogar"
            self.print_("b", "Recapitular {2}{R} (Você pode jogar este card de seu cemitério pagando seu custo de recapitular. Depois, remova-o do jogo.)", "2006-01-01"),
            self.print_("b", "Recapitular {2}{R} (Você pode conjurar este card de seu cemitério pagando seu custo de recapitular. Depois, exile-o.)", "2021-09-24"),
            # quantidade de parênteses diferente: não casa nenhum
            self.print_("c", "Use vidência 1.\nCiclagem {2} ({2}, descarte este card: Compre um card.)", "2020-01-01"),
        ]
        self.assertEqual(
            reminder_texts(prints, oracle),
            {
                self.AMASS: self.ARREG,
                "You may cast this card from your graveyard for its flashback cost. Then exile it.": "Você pode conjurar este card de seu cemitério pagando seu custo de recapitular. Depois, exile-o.",
            },
        )

    def test_numeros_e_simbolos_iguais(self):
        # o texto impresso com outro número é de outra versão do lembrete: não casa
        oracle = {"a": {"oracle_text": "Equip {2} ({2}: Attach to target creature you control.)"}}
        prints = [self.print_("a", "Equipar {3} ({3}: Anexe à criatura alvo que você controla.)", "2020-01-01")]
        self.assertEqual(reminder_texts(prints, oracle), {})

    def test_vai_no_fim_da_linha_do_capitulo(self):
        # Book of Mazarbul: a carta física explica o "Arregimentar Orcs 1." do capítulo I
        en = f"(As this Saga enters…)\nI — Amass Orcs 1. ({self.AMASS})\nII — Amass Orcs 2.\nIII — Creatures you control get +1/+0."
        pt = "(Conforme esta Saga entra…)\nI — Arregimentar Orcs 1.\nII — Arregimente Orcs 2.\nIII — As criaturas que você controla recebem +1/+0."
        out = add_reminders(en, pt, {self.AMASS: self.ARREG})
        self.assertEqual(out.split("\n")[1], f"I — Arregimentar Orcs 1. ({self.ARREG})")
        self.assertEqual(out.split("\n")[2:], pt.split("\n")[2:])

    def test_fica_como_esta(self):
        lembretes = {self.AMASS: self.ARREG}
        en = f"I — Amass Orcs 1. ({self.AMASS})\nII — Draw a card."
        # linhas que não batem, lembrete desconhecido e linha que já tem parênteses
        self.assertEqual(add_reminders(en, "I — Arregimente Orcs 1.", lembretes), "I — Arregimente Orcs 1.")
        self.assertEqual(add_reminders(en, "I — Arregimente Orcs 1.\nII — Compre um card.", {}), "I — Arregimente Orcs 1.\nII — Compre um card.")
        ja = f"I — Arregimente Orcs 1. ({self.ARREG})\nII — Compre um card."
        self.assertEqual(add_reminders(en, ja, lembretes), ja)
        self.assertIsNone(add_reminders(en, None, lembretes))


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

    def test_fora(self):
        self.assertFalse(saga_supported({**self.base, "border_color": "borderless"}))
        self.assertFalse(saga_supported({**self.base, "frame_effects": ["showcase"]}))
        self.assertFalse(saga_supported({**self.base, "full_art": True}))
        self.assertFalse(saga_supported({**self.base, "frame": "2003"}))
        # criatura Saga (Invocações de Final Fantasy): outra moldura
        self.assertFalse(saga_supported({**self.base, "type_line": "Enchantment Creature — Saga Knight"}))
        self.assertFalse(saga_supported({**self.base, "layout": "transform"}))


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
