"""戦闘中の 1 アクター (味方 1 体 / 敵 1 体) を表す Combatant。

ステータスは戦闘開始時に YAML(characters.yaml / stages.yaml)から組み立てて
固定する。コンディションも開始時にスナップショットして格納
(セッション中は不変、SPEC §4.4 の仕様通り)。

Day 4 スコープ:
- tension / gauge は変動
- attack / defense / speed は固定スナップショット
- 必殺技は今は持つだけで発動しない(Day 5)
- DoT / バフ / デバフは未実装 (Day 5)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class StatusEffect:
    """攻撃力バフ・素早さデバフなどの一時的な乗算効果。

    Battle engine が毎ターン頭に turns_left を 1 ずつ減らし、0 になったものは
    cull する。multiplier は damage/speed 計算時に積算される。
    """

    kind: str  # "attack_buff" | "speed_debuff"
    multiplier: float
    turns_left: int
    source: str  # 表示用(必殺技名など)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "multiplier": self.multiplier,
            "turns_left": self.turns_left,
            "source": self.source,
        }


@dataclass
class DamageOverTime:
    """延焼・毒など、毎ターン固定ダメージを与える状態。"""

    name: str  # "延焼" | "毒"
    damage: int
    turns_left: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "damage": self.damage,
            "turns_left": self.turns_left,
        }


@dataclass
class Combatant:
    id: str  # 味方は character.id ("nanami_rona"), 敵は stage 上の enemy.id ("heat_golem")
    name: str
    is_ally: bool

    # ステータス(戦闘開始時の値で固定)
    attack: int
    defense: int
    speed: int

    # ランタイム
    tension: int  # = HP
    max_tension: int
    gauge: int
    max_gauge: int

    # 味方のみ: marker_id (ArUco) と前列/後列
    marker_id: int | None = None
    row: str = "front"  # "front" | "rear"

    # 表示・ロジック用メタ
    unit: str | None = None  # 味方のユニット ID
    attribute: str | None = None  # 味方の属性 ID
    personal_color: str | None = None  # 味方の個人カラー
    role: str | None = None
    position_preference: str | None = None
    condition: dict[str, Any] | None = None  # 起動時抽選結果
    ultimate: dict[str, Any] | None = None
    icon: str | None = None  # 敵のアイコン
    is_boss: bool = False

    # 敵のみ: 行動定義
    behavior: dict[str, Any] = field(default_factory=dict)

    # ランタイム状態効果
    status_effects: list[StatusEffect] = field(default_factory=list)
    dots: list[DamageOverTime] = field(default_factory=list)

    # 装備品(ドロップアクセサリー)による加算分
    bonus_gauge_per_turn: int = 0
    equipment: dict[str, Any] | None = None  # {"kind", "rarity", "name", "icon", "effect", "value"}

    @property
    def downed(self) -> bool:
        return self.tension <= 0

    def take_damage(self, amount: int) -> int:
        """ダメージを適用してテンションから引く。実際に減った量を返す。"""
        before = self.tension
        self.tension = max(0, self.tension - amount)
        return before - self.tension

    def heal(self, amount: int) -> int:
        """ヒール。実際に回復した量を返す。"""
        if self.downed:
            return 0
        before = self.tension
        self.tension = min(self.max_tension, self.tension + amount)
        return self.tension - before

    def gain_gauge(self, amount: int) -> None:
        """声援ゲージを増やす。上限でクランプ。"""
        self.gauge = min(self.max_gauge, self.gauge + amount)

    def reset_gauge(self) -> None:
        self.gauge = 0

    # ---- 状態効果 -----------------------------------------------------

    def add_status_effect(self, effect: StatusEffect) -> None:
        # 同 kind + same source は上書き(重ね掛け防止)。違う source なら共存。
        for e in self.status_effects:
            if e.kind == effect.kind and e.source == effect.source:
                e.multiplier = effect.multiplier
                e.turns_left = effect.turns_left
                return
        self.status_effects.append(effect)

    def add_dot(self, dot: DamageOverTime) -> None:
        for d in self.dots:
            if d.name == dot.name:
                d.damage = dot.damage
                d.turns_left = dot.turns_left
                return
        self.dots.append(dot)

    def tick_dots(self) -> list[tuple[str, int]]:
        """各 DoT を 1 ターン分処理。実際に受けた (name, damage) のリストを返す。
        ターン残数も同時に減らし、0 になったものを除去する。
        """
        applied: list[tuple[str, int]] = []
        for d in self.dots:
            if self.downed:
                break
            actual = self.take_damage(d.damage)
            if actual > 0:
                applied.append((d.name, actual))
        # ターン経過
        for d in self.dots:
            d.turns_left -= 1
        self.dots = [d for d in self.dots if d.turns_left > 0]
        return applied

    def tick_status_effects(self) -> None:
        for e in self.status_effects:
            e.turns_left -= 1
        self.status_effects = [e for e in self.status_effects if e.turns_left > 0]

    def effective_attack(self) -> float:
        m = 1.0
        for e in self.status_effects:
            if e.kind == "attack_buff":
                m *= e.multiplier
        return self.attack * m

    def effective_speed(self) -> float:
        m = 1.0
        for e in self.status_effects:
            if e.kind == "speed_debuff":
                m *= e.multiplier
        return self.speed * m

    def to_dict(self) -> dict[str, Any]:
        """WS broadcast 用のシリアライザ。"""
        return {
            "id": self.id,
            "name": self.name,
            "is_ally": self.is_ally,
            "attack": self.attack,
            "defense": self.defense,
            "speed": self.speed,
            "tension": self.tension,
            "max_tension": self.max_tension,
            "gauge": self.gauge,
            "max_gauge": self.max_gauge,
            "marker_id": self.marker_id,
            "row": self.row,
            "unit": self.unit,
            "attribute": self.attribute,
            "personal_color": self.personal_color,
            "role": self.role,
            "position_preference": self.position_preference,
            "condition": self.condition,
            "ultimate": self.ultimate,
            "icon": self.icon,
            "is_boss": self.is_boss,
            "downed": self.downed,
            "status_effects": [e.to_dict() for e in self.status_effects],
            "dots": [d.to_dict() for d in self.dots],
            "equipment": self.equipment,
        }


def _stat_value(stars: int, table: dict[int, int]) -> int:
    """characters.yaml の stat_to_stars を引いて内部数値に変換。"""
    # YAML から読むと整数キーになる
    return int(table.get(stars, table.get(str(stars), 0)))


def build_ally(
    character: dict[str, Any],
    base_params: dict[str, Any],
    stat_to_stars: dict[str, Any],
    row: str,
) -> Combatant:
    """1 味方 Combatant を組み立てる。"""
    attack = _stat_value(character["stats"]["attack"], stat_to_stars["attack"])
    defense = _stat_value(character["stats"]["defense"], stat_to_stars["defense"])
    speed = _stat_value(character["stats"]["speed"], stat_to_stars["speed"])

    max_tension = int(base_params.get("starting_tension", 100))
    max_gauge = int(base_params.get("max_gauge", 100))
    return Combatant(
        id=character["id"],
        name=character["name"],
        is_ally=True,
        attack=attack,
        defense=defense,
        speed=speed,
        tension=max_tension,
        max_tension=max_tension,
        gauge=int(base_params.get("starting_gauge", 0)),
        max_gauge=max_gauge,
        marker_id=character["aruco_marker_id"],
        row=row,
        unit=character.get("unit"),
        attribute=character.get("attribute"),
        personal_color=character.get("personal_color"),
        role=character.get("role"),
        position_preference=character.get("position_preference"),
        condition=character.get("condition"),
        ultimate=character.get("ultimate"),
    )


def build_enemy(
    enemy_id: str,
    enemy_type_id: str,
    enemy_types_cfg: dict[str, Any],
    is_boss: bool,
) -> Combatant:
    """1 敵 Combatant を組み立てる。"""
    typ = enemy_types_cfg.get(enemy_type_id, {})
    hp = int(typ.get("hp", 30))
    return Combatant(
        id=enemy_id,
        name=typ.get("name", enemy_type_id),
        is_ally=False,
        attack=int(typ.get("attack", 8)),
        defense=0,  # 敵に防御は持たせない (SPEC では敵の防御は未定義)
        speed=int(typ.get("speed", 8)),
        tension=hp,
        max_tension=hp,
        gauge=0,
        max_gauge=100,
        icon=typ.get("icon"),
        is_boss=is_boss,
        behavior=typ.get("behavior", {}),
    )
