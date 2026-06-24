"""dialogue.yaml からの実況テキスト選択(純粋関数)。

SPEC §7 で「LLM は使わず、固定テンプレ集からランダム選択」と明記。
カテゴリ別 (normal_attack / ultimate / downed) にキャラ ID で引いて
random.choice する。テンプレに含まれる `{target}` `{damage}` 等の
プレースホルダは呼び出し側で .format で埋める運用。

味方のみ対応。敵のセリフはハッカソン版では持たない。
"""

from __future__ import annotations

import random
from typing import Any


def pick_dialogue(
    dialogue_cfg: dict[str, Any],
    character_id: str,
    category: str,
) -> str:
    """指定キャラの指定カテゴリのセリフを 1 つランダム選択。

    見つからない場合は空文字列を返す(UI 側で空を扱うのを楽にする)。
    """
    chars = dialogue_cfg.get("characters", {})
    char = chars.get(character_id, {})
    lines = char.get(category, [])
    if not lines:
        return ""
    return random.choice(lines)


def pick_system_message(
    dialogue_cfg: dict[str, Any],
    key: str,
) -> str:
    """system セクションのメッセージを引く。

    `battle_start` / `victory` / `defeat` 等はリスト、
    `warning_attack_announce` は dict なので呼び出し側で分岐すること。
    """
    system = dialogue_cfg.get("system", {})
    val = system.get(key)
    if isinstance(val, list) and val:
        return random.choice(val)
    if isinstance(val, str):
        return val
    return ""
