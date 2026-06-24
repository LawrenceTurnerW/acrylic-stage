"""ターゲット選択ロジック(純粋関数)。

味方の通常攻撃:
  - 生存している敵からランダム1体(SPEC §4 にロジック明示なし、ハッカソン版は random)
  - ボスがいればやや優先したいが、Day 4 では均等 random

敵の通常攻撃:
  - stages.yaml の target_strategy ("prefer_front" / "prefer_rear" / "random")
  - SPEC §6 ステージ1: 全敵が prefer_front
  - 前列に生存者がいない時は後列にフォールバック (逆も同様)
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .combatant import Combatant


# stages.yaml で参照される target_strategies のデフォルト確率
DEFAULT_TARGET_STRATEGIES = {
    "prefer_front": {"front_chance": 0.75, "rear_chance": 0.25},
    "prefer_rear": {"front_chance": 0.25, "rear_chance": 0.75},
    "random": {"front_chance": 0.5, "rear_chance": 0.5},
}


def pick_target_for_ally(
    enemies: list["Combatant"],
) -> "Combatant | None":
    """味方が攻撃する敵を選ぶ。生存中のみ対象に均等ランダム。"""
    alive = [e for e in enemies if not e.downed]
    if not alive:
        return None
    return random.choice(alive)


def pick_target_for_enemy(
    allies: list["Combatant"],
    strategy: str,
    target_strategies: dict | None = None,
) -> "Combatant | None":
    """敵が攻撃する味方を選ぶ。target_strategy に従って列の重みを決め、
    その列に生存者がいなければ自動でもう片方の列にフォールバック。
    """
    alive = [a for a in allies if not a.downed]
    if not alive:
        return None

    cfg = (target_strategies or DEFAULT_TARGET_STRATEGIES).get(
        strategy, DEFAULT_TARGET_STRATEGIES["random"]
    )

    front = [a for a in alive if a.row == "front"]
    rear = [a for a in alive if a.row == "rear"]

    # どちらの列を狙うか
    target_row: str | None
    if front and rear:
        target_row = (
            "front"
            if random.random() < float(cfg.get("front_chance", 0.5))
            else "rear"
        )
    elif front:
        target_row = "front"
    elif rear:
        target_row = "rear"
    else:
        target_row = None

    pool = front if target_row == "front" else rear if target_row == "rear" else alive
    if not pool:
        return None
    return random.choice(pool)
