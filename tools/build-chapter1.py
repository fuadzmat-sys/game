"""Compile the complete canonical Chapter 1 brief, preserving its Russian text.

The source is docs/CHAPTER1_REWRITE.md. The full English translation is keyed by
the exact source paragraph in chapter1-english.json. Structural instructions
become scene/choice/flag commands; all story paragraphs remain playable text.
No old Chapter 1 resource or dialogue is included by this compiler.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIEF = ROOT / "docs" / "CHAPTER1_REWRITE.md"
TRANSLATION = ROOT / "tools" / "chapter1-english.json"
OUTPUT = ROOT / "assets" / "chapter1-scripts.json"
NAMESPACE = "chapter_1_v3/"

# Source intervals are inclusive. Their union covers the full playable script,
# including all twelve local choice branches and all nine creature variations.
RANGES = {
    "start": (229, 375),
    "cafe": (376, 534),
    "cafe_werewolf": (535, 560),
    "cafe_wendigo": (561, 586),
    "cafe_vampire": (587, 612),
    "reason": (614, 664),
    "reason_deflect": (666, 679),
    "reason_curiosity": (681, 694),
    "reason_openness": (696, 727),
    "cafe_after": (729, 805),
    "yard": (806, 886),
    "yard_werewolf": (889, 916),
    "yard_wendigo": (917, 942),
    "yard_vampire": (943, 974),
    "yard_after": (975, 992),
    "forest_edge": (993, 1048),
    "tracks": (1049, 1121),
    "tracks_bold": (1123, 1142),
    "tracks_journal": (1143, 1175),
    "tracks_search": (1176, 1208),
    "animals": (1210, 1292),
    "false_alarm": (1293, 1407),
    "deep_forest": (1408, 1491),
    "descent_pacifica": (1492, 1528),
    "descent_gideon": (1529, 1566),
    "descent_careful": (1567, 1593),
    "clearing": (1594, 1647),
    "clearing_werewolf": (1648, 1659),
    "clearing_wendigo": (1660, 1668),
    "clearing_vampire": (1669, 1679),
    "clearing_after": (1680, 1766),
    "watched": (1767, 1813),
    "ending_bold": (1815, 1830),
    "ending_cautious": (1831, 1857),
    "ending_observation": (1858, 1886),
    "blue_glow": (1887, 2048),
    "will": (2049, 2069),
}

SPEAKERS = {
    "Пасифика:": "Pacifica", "Гидеон:": "Gideon",
    "Официантка:": "Waitress", "Женщина №1:": "Woman_1",
    "Женщина №2:": "Woman_2", "Женщина:": "Woman",
    "Мужчина:": "Man", "Уилл тихо:": "Will",
}
STRUCTURAL = {
    "Ветки соединяются.", "Общая сцена:",
    "Здесь игра проверяет выбор Chapter 0.",
    # These are implementation notes about future consequences, not dialogue.
    "Позже в Chapter 2 они начинают ближе к предполагаемому логову.",
    "В Chapter 2 герои получают возможность взять дополнительный предмет.",
    "Небольшой бонус к уликам в Chapter 2.",
}
COUNTERS = [
    "gideon_deflects", "gideon_curiosity", "gideon_openness",
    "pacifica_gideon_trust", "pacifica_bold", "journal_doubt",
    "pacifica_protective",
]
BOOLEANS = [
    "extra_clue_01", "careful_route", "chapter1_bold_end",
    "chapter1_cautious_end", "chapter1_observation_end",
]

# A branch reconverges immediately after its full local scene. No old ending is
# reachable, and only Will's final observer shot completes the chapter.
NEXT = {
    "start": "cafe",
    **{f"cafe_{m}": "reason" for m in ["werewolf", "wendigo", "vampire"]},
    **{f"reason_{r}": "cafe_after" for r in ["deflect", "curiosity", "openness"]},
    "cafe_after": "yard",
    **{f"yard_{m}": "yard_after" for m in ["werewolf", "wendigo", "vampire"]},
    "yard_after": "forest_edge", "forest_edge": "tracks",
    **{f"tracks_{r}": "animals" for r in ["bold", "journal", "search"]},
    "animals": "false_alarm", "false_alarm": "deep_forest",
    **{f"descent_{r}": "clearing" for r in ["pacifica", "gideon", "careful"]},
    **{f"clearing_{m}": "clearing_after" for m in ["werewolf", "wendigo", "vampire"]},
    "clearing_after": "watched",
    **{f"ending_{r}": "blue_glow" for r in ["bold", "cautious", "observation"]},
    "blue_glow": "will",
}
CHOICES = {
    "reason": [
        ("Мне было нечего делать.", "reason_deflect"),
        ("Хотел понять, что произошло вчера.", "reason_curiosity"),
        ("А с кем мне ещё разговаривать?", "reason_openness"),
    ],
    "tracks": [
        ("Продолжить идти по ним.", "tracks_bold"),
        ("Сначала сравнить с Дневником.", "tracks_journal"),
        ("Осмотреть территорию.", "tracks_search"),
    ],
    "deep_forest": [
        ("Пасифика идёт первой", "descent_pacifica"),
        ("Гидеон идёт первым", "descent_gideon"),
        ("Найти другой путь", "descent_careful"),
    ],
    "watched": [
        ("Идти за звуком", "ending_bold"),
        ("Отступить и вернуться подготовленными", "ending_cautious"),
        ("Попытаться устроить наблюдение", "ending_observation"),
    ],
}
SELECTORS = {
    "reason_deflect": ("Reason", "Deflect"),
    "reason_curiosity": ("Reason", "Curiosity"),
    "reason_openness": ("Reason", "Openness"),
    "tracks_bold": ("Tracks", "Bold"),
    "tracks_journal": ("Tracks", "Journal"),
    "tracks_search": ("Tracks", "Search"),
    "descent_pacifica": ("Descent", "Pacifica"),
    "descent_gideon": ("Descent", "Gideon"),
    "descent_careful": ("Descent", "Careful"),
    "ending_bold": ("Ending", "Bold"),
    "ending_cautious": ("Ending", "Cautious"),
    "ending_observation": ("Ending", "Observation"),
}

def cmds(*commands: str) -> list[str]:
    return [f"[{command}]" for command in commands]

PAIR = cmds("char showi Gideon left scale 1", "char showi Pacifica right flip left scale 1",
            "emotion Gideon neutral", "emotion Pacifica neutral", "char Gideon change idle", "char Pacifica change smile")
ENTRIES = {
    "start": cmds("scene chapter_1_v3", "BG changei black", "music stop", "ambience stop", "camera reset duration 0", "fx clear", "char hidei Gideon Pacifica Will", "effect clear", "item hide")
        + cmds(*(f"flag set {key} 0" for key in COUNTERS))
        + cmds(*(f"flag set {key} false" for key in BOOLEANS)) + cmds("item give journal_3"),
    "cafe": cmds("BG change ch1_diner time 1.2", "music conversation_1 fade .8", "ambience stop", "fx cafe_warm", "camera preset medium duration .7", "sfx bell", "effect clear", "item hide") + PAIR,
    "yard": cmds("BG change ch1_yard time 1.2", "music curious fade .7", "fx clear", "camera reset duration .6", "sfx footsteps", "item hide") + PAIR,
    "forest_edge": cmds("BG change ch1_forest_edge time 1.4", "music forest_day_1 fade 1", "ambience forest_day fade 1", "fx forest_wind", "camera preset normal duration .8", "sfx birds", "item hide") + PAIR,
    "tracks": cmds("BG change ch1_tracks time 1.4", "music forest_day_1", "ambience forest_day", "fx forest_wind", "camera zoom 1.04 duration 1", "sfx forest_wind", "item hide") + PAIR,
    "animals": cmds("BG change ch1_tracks time 1", "music curious crossfade fade .8", "ambience forest_day", "camera preset medium duration .8", "item hide") + PAIR,
    "false_alarm": cmds("BG change ch1_tracks time 1", "music stop fade .5", "ambience forest_day", "camera reset duration .4", "item hide") + PAIR,
    "deep_forest": cmds("BG change ch1_deep_forest time 1.8", "music curious fade 1", "ambience forest_tension fade 1", "fx dark_vignette", "camera preset medium duration 1.1", "sfx forest_wind", "item hide") + PAIR,
    "clearing": cmds("BG change ch1_clearing time 1.6", "music curious", "ambience forest_tension", "fx dark_vignette", "camera preset close duration 1.2", "item hide") + PAIR,
    "watched": cmds("BG change ch1_deep_forest time 1.6", "music stop fade .8", "ambience forest_tension", "fx dark_vignette", "camera preset horror duration 1.4", "sfx forest_wind", "item hide") + PAIR,
    "blue_glow": cmds("BG change ch1_road time 1.8", "music forest_day_1 fade 1.2", "ambience road_night fade 1", "fx electric_blue", "camera preset dramatic duration 1.6", "item hide", "effect clear") + PAIR,
    "will": cmds("char hidei Gideon Pacifica", "BG change ch1_deep_forest time 2", "music stop fade 1", "ambience road_night", "fx electric_blue", "camera preset horror duration 1.5", "item hide", "effect clear"),
}

# Commands tied to exact source rows keep the written direction and its visible
# performance together. Direction text remains available in the dialogue log.
BEFORE_TEXT = {
    "Несколько секунд слышно только птиц.": cmds("sfx birds", "wait 2"),
    "Постепенно появляется город.": cmds("BG change ch1_town_morning time 2", "music pacifica_theme"),
    "Перед небольшим кафе стоит Пасифика.": cmds("char Pacifica show center from outright scale 1 duration .45", "expression Pacifica annoyed transition .2", "anim Pacifica lean_forward duration .4"),
    "Голос сзади:": cmds("char Gideon show left from outleft scale 1 duration .45", "char Pacifica right flip left duration .35", "expression Gideon deadpan transition .15", "camera focus Gideon zoom 1.05 duration .6"),
    "Пасифика улыбается.": cmds("expression Pacifica smile transition .18", "camera reset duration .5"),
    "Пасифика закрывает Дневник салфеткой.": cmds("item hide"),
    "Перед ней лежит Дневник №3.": cmds("item show journal_3"),
    "Потом смеётся.": cmds("emotion Pacifica laugh"),
    "Что?": [],
    "Пасифика становится серьёзнее.": cmds("emotion Pacifica neutral", "char Pacifica change curious"),
    "Пасифика перелистывает страницы.": cmds("emotion Pacifica neutral", "char Pacifica change curious", "item show journal_3"),
    "Он осматривает дешёвое кафе.": cmds("char Gideon change annoyed"),
    "Гидеон на секунду отводит взгляд.": cmds("char Gideon change upset"),
    "Пасифика перестаёт улыбаться.": cmds("emotion Pacifica neutral", "char Pacifica change curious"),
    "Гидеон вздыхает.": cmds("sfx sigh", "expression Gideon sad transition .2", "anim Gideon sad_drop duration .45"),
    "Гидеон приседает возле повреждения.": cmds("expression Gideon deadpan transition .15", "anim Gideon lean_forward duration .4", "camera focus Gideon zoom 1.07 duration .6"),
    "Пасифика мгновенно хватает ближайшую тяжёлую ветку.": cmds("char Pacifica change fighting"),
    "Внезапно из кустов доносится громкий треск.": cmds("sfx branch_crack", "camera shake small"),
    "Треск становится ближе.": cmds("sfx branch_crack"),
    "маленькая грязная собака.": cmds("char Dog show center scale .6 duration .25", "char Gideon movei -1300", "char Pacifica movei 1300", "anim Pacifica surprise_jump", "expression Gideon deadpan transition .12"),
    "АА—": cmds("expression Pacifica surprised transition .08", "camera shake medium", "anim Pacifica recoil duration .3"),
    "Она останавливается.": cmds("camera reset duration .35"),
    "Пасифика не выдерживает и смеётся.": cmds("emotion Pacifica laugh", "expression Gideon deadpan transition .12"),
    "Она тихо скулит.": cmds("sfx dog_whine", "emotion Pacifica neutral", "char Pacifica change curious", "char Gideon change idle"),
    "И убегает в противоположную сторону.": cmds("char Dog hide outright", "char Gideon movei -740", "char Pacifica movei 740", "sfx footsteps"),
    "Издалека слышится странный низкий звук.": cmds("sfx unknown_call", "camera zoom 1.08 duration 1.4", "fx dark_vignette"),
    "Земля под ногой осыпается.": cmds("sfx branch_crack"),
    "Пасифика резко скользит.": cmds("expression Pacifica scared transition .08", "camera shake medium", "anim Pacifica recoil duration .35"),
    "Гидеон хватает её за руку.": cmds("char Gideon move -350 duration .3", "char Pacifica move 350 duration .3", "camera focus Pacifica zoom 1.08 duration .45"),
    "Они обходят склон.": cmds("sfx footsteps"),
    "Пасифика замирает.": cmds("char Pacifica change upset", "char Gideon change idle"),
    "Пасифика прыскает.": cmds("emotion Pacifica laugh"),
    "Потом её взгляд падает на дерево.": cmds("emotion Pacifica neutral", "char Pacifica change curious"),
    "Между деревьями что-то двигается.": cmds("sfx branch_crack", "camera pan left duration .8"),
    "Пасифика резко поворачивается.": cmds("expression Pacifica determined transition .12", "anim Pacifica step_forward duration .35"),
    "Из-за деревьев снова доносится хруст.": cmds("sfx branch_crack"),
    "На несколько секунд возникает слабое синее свечение.": cmds("effect blue_glow", "fx electric_blue", "sfx blue_spark", "camera zoom 1.1 duration 1.2"),
    "Потом исчезает.": cmds("effect clear", "fx dark_vignette", "camera reset duration .8"),
    "Между деревьями стоит Уилл.": cmds("char Will show center scale .78 duration .6", "char Will color (0.18,0.25,0.34,1)", "char Will change sad", "camera focus Will zoom 1.1 duration 1.4"),
    "На несколько секунд возле его руки появляется слабая синяя искра.": cmds("effect blue_glow", "fx electric_blue", "sfx blue_spark", "camera zoom 1.12 duration 1.1"),
    "Синее свечение исчезает.": cmds("effect clear", "fx dark_vignette"),
}
AFTER_TEXT = {
    "Гидеон хватает её за руку.": cmds("wait .5"),
}

def clean(text: str) -> str:
    return text.replace("**", "").strip()

def source_records(lines: list[str], first: int, last: int):
    speaker = "Narrator"
    for number in range(first, last + 1):
        source = lines[number - 1].strip()
        if not source or source.startswith("#") or source == "---":
            continue
        if source.startswith(("**Локация:", "**Время:", "**Музыка:")):
            continue
        if source.startswith("**Флаг:"):
            match = re.search(r"`([a-z0-9_]+) = (\+1|true)`", source)
            if not match:
                raise ValueError(f"Unknown flag instruction on source line {number}")
            key, value = match.groups()
            yield number, "command", f"flag add {key} 1" if value == "+1" else f"flag set {key} true"
            continue
        if source.startswith("**Отношения Пасифика"):
            yield number, "command", "flag add pacifica_gideon_trust 1"
            continue
        if source.startswith("**Получен предмет:"):
            yield number, "command", "item give cloth_scrap"
            continue
        text = clean(source)
        if text in STRUCTURAL:
            continue
        if text in SPEAKERS:
            speaker = SPEAKERS[text]
            continue
        if text.startswith("— "):
            yield number, speaker, text[2:]
            speaker = "Narrator"
        else:
            yield number, "Narrator", text
            speaker = "Narrator"

def build() -> tuple[dict, dict]:
    source = BRIEF.read_text(encoding="utf-8")
    lines = source.splitlines()
    translations = json.loads(TRANSLATION.read_text(encoding="utf-8"))
    scripts, report = {}, {"source": "docs/CHAPTER1_REWRITE.md", "sourceSha256": hashlib.sha256(source.encode()).hexdigest(), "namespace": NAMESPACE, "scripts": {}}
    for language in ["russian", "english"]:
        def translated(text: str) -> str:
            if language == "russian":
                return text
            if text not in translations:
                raise ValueError(f"Missing English source paragraph: {text!r}")
            return translations[text]
        for name, (first, last) in RANGES.items():
            parts = ["// Canonical Chapter 1 — Tracks in the Forest. Source: docs/CHAPTER1_REWRITE.md", *ENTRIES.get(name, [])]
            if name in SELECTORS:
                key, value = SELECTORS[name]
                parts += cmds(f"Choice {key} {value}")
            if name.startswith("cafe_") and name in ["cafe_werewolf", "cafe_wendigo", "cafe_vampire"]:
                parts += cmds(f"item show journal_{name.split('_')[1]}")
            rows = []
            for number, speaker, text in source_records(lines, first, last):
                parts.append(f"// Source line {number}")
                if speaker == "command":
                    parts += cmds(text)
                    continue
                parts += BEFORE_TEXT.get(text, [])
                # Keep poses restrained for Gideon; the script never gives him
                # the old chapter's panic or trembling loop.
                if name == "false_alarm" and speaker == "Gideon" and text in ["Страшный монстр.", "Огромный.", "Палкой?"]:
                    parts += cmds("char Gideon change smile")
                if text == "На ней застрял маленький кусок тёмной ткани.":
                    parts += cmds("item show cloth_scrap")
                if text == "BUSTER":
                    parts += cmds("item show buster_collar")
                parts += [f"[{speaker}]", translated(text)]
                parts += AFTER_TEXT.get(text, [])
                rows.append({"sourceLine": number, "speaker": speaker, "text": text})
            if name in ["cafe", "yard", "clearing"]:
                for monster in ["Werewolf", "Wendigo", "Vampire"]:
                    parts += cmds(f"Choice check Monster {monster} next {NAMESPACE}{name}_{monster.lower()}")
            elif name in CHOICES:
                parts += cmds("item hide", "Choice importance important")
                for index, (label, target) in enumerate(CHOICES[name], start=1):
                    parts += cmds(f"Button text {index} {translated(label)}", f"Button order {index} next {NAMESPACE}{target}")
                parts += cmds("stop")
            elif name in NEXT:
                parts += cmds("item hide", f"next {NAMESPACE}{NEXT[name]}")
            elif name == "will":
                parts += cmds("char hidei Will", "effect clear", "BG change black time 1.5", "wait 1.5", "scene credits")
            else:
                raise ValueError(f"No continuation for {name}")
            # The source calls for a final black screen, not merely its written
            # description. The opening black frame is already set at entry.
            for index, part in enumerate(parts):
                if name == "will" and part == translated("Чёрный экран."):
                    parts[index:index] = cmds("char hidei Will", "effect clear", "BG change black time 1.5")
                    break
            resource = f"textes/{language}/{NAMESPACE}{name}"
            scripts[resource] = "\n\n".join(parts) + "\n"
            if language == "russian":
                report["scripts"][name] = rows
    report["resourceCount"] = len(scripts)
    report["sourceParagraphs"] = sum(len(rows) for rows in report["scripts"].values())
    report["spokenParagraphs"] = sum(row["speaker"] != "Narrator" for rows in report["scripts"].values() for row in rows)
    return scripts, report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, help="Optional source coverage report (outside the runtime package)")
    args = parser.parse_args()
    scripts, report = build()
    OUTPUT.write_text(json.dumps(scripts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Compiled {len(scripts)} resources; {report['sourceParagraphs']} complete Russian source paragraphs, {report['spokenParagraphs']} spoken lines.")
