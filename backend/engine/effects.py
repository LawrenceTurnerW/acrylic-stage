"""必殺技の効果を effect kind ごとに dispatch するモジュール。

characters.yaml の ultimate.effects は kind + params の配列。Effects は
順番に適用され、同一発動内で「ターゲット」を共有する(SPEC §5):
  江波: damage_single → 同じ敵に dot(延焼)
  香鳴: damage_single → 同じ敵に dot(毒)

各効果の戻り値は broadcast 用の小さな dict(damage / target_id 等)。
calculate_damage はここでは直接呼ばず、battle 側に引数を返して計算してもらう。
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Callable

from .combatant import Combatant, DamageOverTime, StatusEffect
from .damage import calculate_damage


@dataclass
class UltimateResult:
    """必殺技 1 発動の結果サマリ。WS broadcast 用に集約する。"""

    actor_id: str
    actor_name: str
    ultimate_name: str
    ultimate_type: str
    primary_target_id: str | None
    primary_target_name: str | None
    targets_hit: list[str]
    total_damage: int
    healed_count: int
    healed_total: int
    buffed_count: int
    debuffed_count: int
    dot_applied: list[str]  # ターゲット名のリスト
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "actor_id": self.actor_id,
            "actor_name": self.actor_name,
            "ultimate_name": self.ultimate_name,
            "ultimate_type": self.ultimate_type,
            "primary_target_id": self.primary_target_id,
            "primary_target_name": self.primary_target_name,
            "targets_hit": self.targets_hit,
            "total_damage": self.total_damage,
            "healed_count": self.healed_count,
            "healed_total": self.healed_total,
            "buffed_count": self.buffed_count,
            "debuffed_count": self.debuffed_count,
            "dot_applied": self.dot_applied,
            "message": self.message,
        }


def execute_ultimate(
    actor: Combatant,
    allies: list[Combatant],
    enemies: list[Combatant],
    *,
    position_modifiers: dict[str, Any],
    damage_minimum: int,
    line_message: str,
) -> UltimateResult:
    """1 体の味方の必殺技を実行し、effects を順番に適用。

    actor.ultimate が None の場合は空の結果を返す(呼び出し側のガード前提)。
    """
    ultimate = actor.ultimate or {}
    effects = ultimate.get("effects", [])
    name = ultimate.get("name", "?")
    utype = ultimate.get("type", "")

    result = UltimateResult(
        actor_id=actor.id,
        actor_name=actor.name,
        ultimate_name=name,
        ultimate_type=utype,
        primary_target_id=None,
        primary_target_name=None,
        targets_hit=[],
        total_damage=0,
        healed_count=0,
        healed_total=0,
        buffed_count=0,
        debuffed_count=0,
        dot_applied=[],
        message=line_message,
    )

    # 同じ必殺技内で「単体技の対象」を共有する(damage_single → dot 連鎖など)
    primary_target: Combatant | None = None

    def _pick_alive_enemy() -> Combatant | None:
        alive = [e for e in enemies if not e.downed]
        return random.choice(alive) if alive else None

    def _damage(target: Combatant, multiplier: float) -> int:
        # actor.effective_attack() を使うため calculate_damage を直接呼ぶ
        dmg = calculate_damage(
            attacker_attack=int(round(actor.effective_attack())),
            target_defense=target.defense,
            attacker_position_preference=actor.position_preference,
            attacker_row=actor.row,
            attacker_is_ally=actor.is_ally,
            target_row=target.row,
            target_is_ally=target.is_ally,
            attacker_condition=actor.condition,
            ultimate_multiplier=multiplier,
            position_modifiers=position_modifiers,
            damage_minimum=damage_minimum,
        )
        actual = target.take_damage(dmg)
        result.total_damage += actual
        if target.id not in result.targets_hit:
            result.targets_hit.append(target.id)
        return actual

    for eff in effects:
        kind = eff.get("kind")
        handler = _HANDLERS.get(kind)
        if handler is None:
            continue
        primary_target = handler(
            eff,
            actor=actor,
            allies=allies,
            enemies=enemies,
            primary_target=primary_target,
            result=result,
            damage_fn=_damage,
            pick_enemy=_pick_alive_enemy,
            ultimate_name=name,
        )

    if primary_target is not None:
        result.primary_target_id = primary_target.id
        result.primary_target_name = primary_target.name

    return result


# ---------------------------------------------------------------------------
# Effect handlers
# Signature: (eff, *, actor, allies, enemies, primary_target, result, damage_fn,
#            pick_enemy, ultimate_name) -> Combatant | None
# 戻り値は更新後の primary_target (次の effect が同じターゲットを使うため)
# ---------------------------------------------------------------------------


HandlerFn = Callable[..., "Combatant | None"]


def _heal_all(eff, *, allies, result, **_):
    amount = int(eff.get("amount", 0))
    for a in allies:
        if a.downed:
            continue
        healed = a.heal(amount)
        if healed > 0:
            result.healed_count += 1
            result.healed_total += healed
    return _.get("primary_target")


def _gauge_all(eff, *, allies, **_):
    amount = int(eff.get("amount", 0))
    for a in allies:
        if not a.downed:
            a.gain_gauge(amount)
    return _.get("primary_target")


def _buff_attack_all(eff, *, allies, result, ultimate_name, **_):
    mult = float(eff.get("multiplier", 1.0))
    turns = int(eff.get("turns", 1))
    for a in allies:
        if a.downed:
            continue
        a.add_status_effect(
            StatusEffect(
                kind="attack_buff",
                multiplier=mult,
                turns_left=turns,
                source=ultimate_name,
            )
        )
        result.buffed_count += 1
    return _.get("primary_target")


def _damage_single(eff, *, primary_target, pick_enemy, damage_fn, **_):
    target = primary_target or pick_enemy()
    if target is None or target.downed:
        return target
    mult = float(eff.get("multiplier", 1.0))
    damage_fn(target, mult)
    return target


def _damage_all(eff, *, enemies, damage_fn, **_):
    mult = float(eff.get("multiplier", 1.0))
    if eff.get("guaranteed_critical"):
        mult *= 1.5
    for e in enemies:
        if e.downed:
            continue
        damage_fn(e, mult)
    return _.get("primary_target")


def _damage_single_multi(eff, *, primary_target, pick_enemy, damage_fn, **_):
    target = primary_target or pick_enemy()
    if target is None:
        return target
    hits = int(eff.get("hits", 1))
    mph = float(eff.get("multiplier_per_hit", 1.0))
    crit_chance = float(eff.get("critical_boost_on_last", 0.0))
    for i in range(hits):
        if target.downed:
            break
        is_last = i == hits - 1
        mult = mph * (1.5 if (is_last and random.random() < crit_chance) else 1.0)
        damage_fn(target, mult)
    return target


def _debuff_speed_all(eff, *, enemies, result, ultimate_name, **_):
    mult = float(eff.get("multiplier", 1.0))
    turns = int(eff.get("turns", 1))
    for e in enemies:
        if e.downed:
            continue
        e.add_status_effect(
            StatusEffect(
                kind="speed_debuff",
                multiplier=mult,
                turns_left=turns,
                source=ultimate_name,
            )
        )
        result.debuffed_count += 1
    return _.get("primary_target")


def _dot(eff, *, primary_target, result, **_):
    if primary_target is None or primary_target.downed:
        return primary_target
    primary_target.add_dot(
        DamageOverTime(
            name=str(eff.get("name", "状態")),
            damage=int(eff.get("damage", 0)),
            turns_left=int(eff.get("turns", 1)),
        )
    )
    result.dot_applied.append(primary_target.name)
    return primary_target


_HANDLERS: dict[str, HandlerFn] = {
    "heal_all": _heal_all,
    "gauge_all": _gauge_all,
    "buff_attack_all": _buff_attack_all,
    "damage_single": _damage_single,
    "damage_all": _damage_all,
    "damage_single_multi": _damage_single_multi,
    "debuff_speed_all": _debuff_speed_all,
    "dot": _dot,
}
