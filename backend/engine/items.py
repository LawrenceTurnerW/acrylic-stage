"""ドロップアクセサリー: カタログ解決と Combatant への効果反映。

YAML (backend/config/items.yaml) で定義されたアイテム情報を解決し、
build_ally 時に Combatant のステータスに加算する。バックエンドはドロップ
生成は行わない(frontend が localStorage で管理し、結果のみ /start_battle
に equipment として送ってくる前提)。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ResolvedItem:
    """1 個のアイテムインスタンスに対する効果。"""

    kind: str  # "power_brooch" | "heart_charm" | "voice_ring"
    rarity: str  # "N" | "R" | "SR"
    name: str
    icon: str
    effect: str  # "attack" | "max_tension" | "gauge_per_turn_bonus"
    value: int


def resolve(items_cfg: dict[str, Any], kind: str, rarity: str) -> ResolvedItem | None:
    """YAML を見て (kind, rarity) を ResolvedItem に変換。

    未知の組み合わせは None を返す(呼び出し側で握りつぶす)。
    """
    if not items_cfg:
        return None
    item_def = items_cfg.get("items", {}).get(kind)
    if not item_def:
        logger.warning("unknown item kind: %s", kind)
        return None
    rarity_def = item_def.get("rarities", {}).get(rarity)
    if not rarity_def:
        logger.warning("unknown rarity %s for %s", rarity, kind)
        return None
    return ResolvedItem(
        kind=kind,
        rarity=rarity,
        name=item_def.get("name", kind),
        icon=item_def.get("icon", ""),
        effect=item_def.get("effect", ""),
        value=int(rarity_def.get("value", 0)),
    )


def apply_to_combatant(combatant, item: ResolvedItem) -> None:
    """ResolvedItem の効果を Combatant に加算する。

    Combatant に未知の属性が出ないよう effect は事前に whitelist しておく。
    エラーは握りつぶす(壊れた item で battle が落ちないように)。
    """
    if item.effect == "attack":
        combatant.attack += item.value
    elif item.effect == "max_tension":
        combatant.max_tension += item.value
        # tension は max まで合わせて埋める(装備でいきなり HP 増えるイメージ)
        combatant.tension = combatant.max_tension
    elif item.effect == "gauge_per_turn_bonus":
        combatant.bonus_gauge_per_turn += item.value
    else:
        logger.warning("unknown effect kind: %s", item.effect)
