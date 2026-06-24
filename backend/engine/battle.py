"""自動進行型バトルエンジン (Day 4 スコープ)。

仕様:
- 開始時に味方 Combatant / 敵 Combatant を YAML から組み立てる
- ターン間隔 base_params.turn_interval_sec (デフォルト 5 秒) で 1 ターン進行
- 各ターン:
  - 行動順は素早さ降順(同率はランダム)
  - 生存中の全アクターが順に 1 行動(現状は通常攻撃のみ)
  - ターン経過の声援ゲージ累積を全味方に適用
- 行動詳細を battle_action として broadcast、状態スナップショットを
  battle_state として broadcast
- 全味方ダウン → defeat / 全敵ダウン → victory で battle_end を broadcast

Day 5 以降で追加するもの:
- 必殺技発動(声援 100 でフラグ)
- DoT (延焼/毒)
- バフ/デバフ (素早さ debuff 等)
- ボスの警告攻撃ギミック
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any

from .combatant import Combatant, build_ally, build_enemy
from .damage import calculate_damage
from .dialogue import pick_dialogue, pick_system_message
from .targeting import (
    DEFAULT_TARGET_STRATEGIES,
    pick_target_for_ally,
    pick_target_for_enemy,
)

logger = logging.getLogger(__name__)


class BattleEngine:
    """バトル進行を管理する単一インスタンス。

    main.py のシングルトンとして保持し、/start_battle で start()、
    /reset で stop() を呼ぶ運用。
    """

    def __init__(self, ws_broadcast, game_state) -> None:
        # ws_broadcast: async def (dict) -> None
        # game_state: GameState (characters_cfg / stages_cfg / dialogue_cfg を持つ)
        self.ws_broadcast = ws_broadcast
        self.game_state = game_state

        self.allies: list[Combatant] = []
        self.enemies: list[Combatant] = []
        self.turn: int = 0
        self.finished: bool = False
        self.result: str | None = None  # "win" | "lose" | None

        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    # -------- 公開 API --------

    async def start(self, formation: dict[str, list[int]]) -> dict[str, Any]:
        """編成を確定して戦闘を開始する。"""
        async with self._lock:
            await self._stop_unlocked()
            self._build_combatants(formation)
            self.turn = 0
            self.finished = False
            self.result = None
            self._task = asyncio.create_task(self._run())
            logger.info(
                "battle start: allies=%d enemies=%d",
                len(self.allies),
                len(self.enemies),
            )
            return {
                "ok": True,
                "ally_count": len(self.allies),
                "enemy_count": len(self.enemies),
            }

    async def stop(self) -> None:
        async with self._lock:
            await self._stop_unlocked()

    async def _stop_unlocked(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None

    def state_snapshot(self) -> dict[str, Any]:
        return {
            "turn": self.turn,
            "finished": self.finished,
            "result": self.result,
            "allies": [c.to_dict() for c in self.allies],
            "enemies": [c.to_dict() for c in self.enemies],
        }

    def update_ally_rows(self, detections: list[dict[str, Any]]) -> bool:
        """ArUco 検出結果に基づいて味方の row (front/rear) を上書きする。

        戦闘中にアクスタを物理的に動かしたら反映させるためのフック
        (現状は呼び出し元未実装、Day 5/6 の警告攻撃で使う)。
        変更があったら True を返す。
        """
        by_marker = {int(d["marker_id"]): d for d in detections}
        changed = False
        for ally in self.allies:
            if ally.marker_id is None:
                continue
            d = by_marker.get(ally.marker_id)
            if not d:
                continue
            new_row = d.get("row")
            if new_row and new_row != ally.row:
                ally.row = new_row
                changed = True
        return changed

    # -------- 内部: セットアップ --------

    def _build_combatants(self, formation: dict[str, list[int]]) -> None:
        gs = self.game_state
        chars_cfg = gs.characters_cfg
        stages_cfg = gs.stages_cfg

        characters_with_cond = gs.characters_with_conditions()
        chars_by_marker = {
            int(c["aruco_marker_id"]): c for c in characters_with_cond
        }

        base_params = chars_cfg.get("base_params", {})
        stat_to_stars = chars_cfg.get("stat_to_stars", {})

        allies: list[Combatant] = []
        for row_name in ("front", "rear"):
            for marker_id in formation.get(row_name, [])[:2]:
                ch = chars_by_marker.get(int(marker_id))
                if not ch:
                    logger.warning("unknown marker_id in formation: %s", marker_id)
                    continue
                allies.append(
                    build_ally(ch, base_params, stat_to_stars, row=row_name)
                )
        self.allies = allies

        # 現在ステージ(ハッカソン版は stage[0] 固定)
        stages = stages_cfg.get("stages", [])
        stage = stages[0] if stages else {}
        enemy_types = stages_cfg.get("enemy_types", {})
        enemies: list[Combatant] = []
        for e in stage.get("enemies", []):
            enemies.append(
                build_enemy(
                    enemy_id=e["id"],
                    enemy_type_id=e["type"],
                    enemy_types_cfg=enemy_types,
                    is_boss=bool(e.get("is_boss", False)),
                )
            )
        self.enemies = enemies

    # -------- 内部: ループ --------

    async def _run(self) -> None:
        try:
            await self._broadcast_state()
            await self._broadcast_action(
                {
                    "kind": "system",
                    "message": pick_system_message(
                        self.game_state.dialogue_cfg, "battle_start"
                    )
                    or "ライブ、スタート!",
                }
            )

            base_params = self.game_state.characters_cfg.get("base_params", {})
            turn_interval = float(base_params.get("turn_interval_sec", 5))

            while not self.finished:
                await asyncio.sleep(turn_interval)
                if self.finished:
                    break
                self.turn += 1
                await self._step_turn()
                await self._broadcast_state()
                self._check_end()
                if self.finished:
                    break

            await self._broadcast_battle_end()
        except asyncio.CancelledError:
            logger.info("battle loop cancelled")
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("battle loop crashed: %s", e)

    async def _step_turn(self) -> None:
        """1 ターン分の進行: ターン経過 gauge + 全アクターが行動。"""
        base_params = self.game_state.characters_cfg.get("base_params", {})
        gauge_per_turn = int(base_params.get("gauge_per_turn", 5))

        # ターン経過の声援(味方のみ)
        for ally in self.allies:
            if not ally.downed:
                mult = 1.0
                if ally.condition:
                    mult = float(ally.condition.get("gauge_multiplier", 1.0))
                ally.gain_gauge(int(round(gauge_per_turn * mult)))

        # 行動順を素早さ降順で確定(同率は ramdom 並び替え)
        actors = self._build_action_order()

        for actor in actors:
            if self.finished:
                break
            if actor.downed:
                continue
            await self._act_normal(actor)
            self._check_end()

    def _build_action_order(self) -> list[Combatant]:
        combined: list[Combatant] = [
            c for c in (*self.allies, *self.enemies) if not c.downed
        ]
        # 同 speed のシャッフルのため、tie-breaker をランダム
        combined.sort(key=lambda c: (-c.speed, random.random()))
        return combined

    # -------- 内部: アクション --------

    async def _act_normal(self, actor: Combatant) -> None:
        """通常攻撃 1 回。"""
        if actor.is_ally:
            target = pick_target_for_ally(self.enemies)
            if target is None:
                return
        else:
            strategy = actor.behavior.get("target_strategy", "random")
            target = pick_target_for_enemy(
                self.allies,
                strategy,
                target_strategies=self.game_state.stages_cfg.get(
                    "target_strategies", DEFAULT_TARGET_STRATEGIES
                ),
            )
            if target is None:
                return

        position_modifiers = self.game_state.characters_cfg.get(
            "position_modifiers", {}
        )
        base_params = self.game_state.characters_cfg.get("base_params", {})

        damage = calculate_damage(
            attacker_attack=actor.attack,
            target_defense=target.defense,
            attacker_position_preference=actor.position_preference,
            attacker_row=actor.row,
            attacker_is_ally=actor.is_ally,
            target_row=target.row,
            target_is_ally=target.is_ally,
            attacker_condition=actor.condition,
            position_modifiers=position_modifiers,
            damage_minimum=int(base_params.get("damage_minimum", 1)),
        )
        actual = target.take_damage(damage)

        # 声援ゲージ(味方のみ、SPEC §4.1)
        if actor.is_ally:
            gauge_gain = int(base_params.get("gauge_per_normal_attack", 20))
            mult = (
                float(actor.condition.get("gauge_multiplier", 1.0))
                if actor.condition
                else 1.0
            )
            actor.gain_gauge(int(round(gauge_gain * mult)))
        if target.is_ally and not target.downed:
            hit_gain = int(base_params.get("gauge_per_hit_taken", 10))
            mult = (
                float(target.condition.get("gauge_multiplier", 1.0))
                if target.condition
                else 1.0
            )
            target.gain_gauge(int(round(hit_gain * mult)))

        message = self._compose_message(actor, target, actual)

        await self._broadcast_action(
            {
                "kind": "normal_attack",
                "actor_id": actor.id,
                "actor_name": actor.name,
                "actor_is_ally": actor.is_ally,
                "target_id": target.id,
                "target_name": target.name,
                "damage": actual,
                "target_downed": target.downed,
                "turn": self.turn,
                "message": message,
            }
        )

        if target.downed:
            downed_msg = (
                pick_dialogue(self.game_state.dialogue_cfg, target.id, "downed")
                if target.is_ally
                else f"{target.name} を撃破!"
            )
            await self._broadcast_action(
                {
                    "kind": "downed",
                    "actor_id": target.id,
                    "actor_name": target.name,
                    "actor_is_ally": target.is_ally,
                    "turn": self.turn,
                    "message": downed_msg or f"{target.name} ダウン...",
                }
            )

    def _compose_message(
        self, actor: Combatant, target: Combatant, damage: int
    ) -> str:
        if actor.is_ally:
            line = pick_dialogue(
                self.game_state.dialogue_cfg, actor.id, "normal_attack"
            )
            if line:
                return f"{actor.name}「{line}」→ {target.name} に {damage}"
            return f"{actor.name} の攻撃!{target.name} に {damage}"
        return f"{actor.name} の攻撃!{target.name} に {damage}"

    # -------- 内部: 終了判定 / broadcast --------

    def _check_end(self) -> None:
        if self.finished:
            return
        ally_alive = any(not c.downed for c in self.allies)
        enemy_alive = any(not c.downed for c in self.enemies)
        if not ally_alive:
            self.finished = True
            self.result = "lose"
        elif not enemy_alive:
            self.finished = True
            self.result = "win"

    async def _broadcast_state(self) -> None:
        await self.ws_broadcast(
            {
                "type": "battle_state",
                "ts": time.time(),
                **self.state_snapshot(),
            }
        )

    async def _broadcast_action(self, payload: dict[str, Any]) -> None:
        await self.ws_broadcast(
            {"type": "battle_action", "ts": time.time(), **payload}
        )

    async def _broadcast_battle_end(self) -> None:
        mvp_id: str | None = None
        if self.result == "win":
            alive = [c for c in self.allies if not c.downed]
            if alive:
                # ハッカソン版 MVP は単純に「残テンション最高」
                mvp_id = max(alive, key=lambda c: c.tension).id
        end_msg_key = "victory" if self.result == "win" else "defeat"
        msg = pick_system_message(self.game_state.dialogue_cfg, end_msg_key)
        await self.ws_broadcast(
            {
                "type": "battle_end",
                "ts": time.time(),
                "result": self.result,
                "mvp_id": mvp_id,
                "turn": self.turn,
                "message": msg,
            }
        )
