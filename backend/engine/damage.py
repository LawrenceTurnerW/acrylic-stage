"""ダメージ計算(純粋関数)。

SPEC §4.3:
  基礎ダメージ = (攻撃力 × 配置補正 × コンディション補正 × 必殺倍率) - 対象の防御力
  最終ダメージ = max(基礎ダメージ, damage_minimum)

配置補正 (§4.2):
  - 適性位置 (matching) なら ×1.20
  - 不適性 (mismatching) なら ×0.85
  - 適性 "either" は常に matching 扱い
  - 適性 "front_risk" は鬼多見アユム専用、front を matching と見なす
  - 敵には適用しない(味方の攻撃時のみ)

被弾倍率は別途 (§4.2):
  - 前列の被弾は ×1.5
  - 後列の被弾は ×0.5

コンディション補正:
  - condition.attack_multiplier (味方のみ。敵には condition なし)
"""

from __future__ import annotations

from typing import Any


def _position_attack_modifier(
    position_preference: str | None,
    row: str,
    position_modifiers: dict[str, Any],
) -> float:
    """配置補正を返す(味方の攻撃 multiplier)。"""
    pos_cfg = position_modifiers.get(row, {})
    if position_preference is None:
        return 1.0
    if position_preference == "either":
        return float(pos_cfg.get("matching_attack_bonus", 1.0))
    if position_preference == "front_risk":
        # 前列にいる時のみ matching 扱い、後列に行くとペナルティ
        return float(
            pos_cfg.get(
                "matching_attack_bonus" if row == "front" else "mismatching_attack_penalty",
                1.0,
            )
        )
    # "front" or "rear"
    matching = position_preference == row
    return float(
        pos_cfg.get(
            "matching_attack_bonus" if matching else "mismatching_attack_penalty",
            1.0,
        )
    )


def _row_damage_taken_multiplier(
    row: str, position_modifiers: dict[str, Any]
) -> float:
    return float(position_modifiers.get(row, {}).get("damage_taken_multiplier", 1.0))


def calculate_damage(
    attacker_attack: int,
    target_defense: int,
    *,
    attacker_position_preference: str | None,
    attacker_row: str,
    attacker_is_ally: bool,
    target_row: str,
    target_is_ally: bool,
    attacker_condition: dict[str, Any] | None,
    ultimate_multiplier: float = 1.0,
    position_modifiers: dict[str, Any],
    damage_minimum: int = 1,
) -> int:
    """SPEC §4.3 のダメージ計算式。

    味方→敵 と 敵→味方 の双方をこの関数で扱う。配置補正は攻撃側が味方の時のみ
    適用、被弾倍率は対象が味方の時のみ適用(敵に「列」は無い前提)。
    """
    dmg = float(attacker_attack)

    if attacker_is_ally:
        dmg *= _position_attack_modifier(
            attacker_position_preference,
            attacker_row,
            position_modifiers,
        )
        if attacker_condition is not None:
            dmg *= float(attacker_condition.get("attack_multiplier", 1.0))

    dmg *= ultimate_multiplier

    if target_is_ally:
        dmg *= _row_damage_taken_multiplier(target_row, position_modifiers)

    dmg -= float(target_defense)
    return max(damage_minimum, int(round(dmg)))
