"""自動進行型バトルエンジン (Day 5)。

Day 4 にあった通常攻撃 + ターン進行に加え、Day 5 で以下を追加:
- ゲージ満タンで必殺技自動発動 (engine/effects.py の dispatch)
- コンディション「寝不足」の skip_chance による行動スキップ
- 状態効果 (attack_buff / speed_debuff) と DoT (延焼/毒) のターン tick
- effective_attack / effective_speed の反映 (バフ・デバフ込み)

Day 6 で追加: ボスの警告攻撃ギミック (前列爆撃 / 後列狙撃)。
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
from .effects import execute_ultimate
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

        # 警告攻撃 (ボス専用、SPEC §4.6)。ボス1体につき同時に1件まで保持。
        # {boss_id: {"variant_name", "target_row", "fires_on_turn"}}
        self._pending_warnings: dict[str, dict[str, Any]] = {}

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

        戦闘中にアクスタを物理的に動かしたら反映させるためのフック。
        変更があったら True を返す。row が変わったら row_changed イベントを
        broadcast して UI 側でカード移動アニメを走らせる(broadcast は呼び出し
        側のタスクで async にスケジュールする)。
        """
        if self.finished or not self._running:
            return False
        by_marker = {int(d["marker_id"]): d for d in detections}
        changed = False
        for ally in self.allies:
            if ally.marker_id is None or ally.downed:
                continue
            d = by_marker.get(ally.marker_id)
            if not d:
                continue
            new_row = d.get("row")
            if new_row and new_row != ally.row:
                old = ally.row
                ally.row = new_row
                changed = True
                logger.info(
                    "row changed: %s %s -> %s", ally.name, old, new_row
                )
        return changed

    def schedule_row_sync(self, detections: list[dict[str, Any]]) -> None:
        """同期的に呼ばれる camera hook から非同期 broadcast に橋渡し。

        ループが回っていない時 (idle / battle 終了済み) は何もしない。
        row 変化があった時のみ battle_state を即時 broadcast する。
        """
        if self.finished or not self._running:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # event loop が無いコンテキストでは何もしない
        if not self.update_ally_rows(detections):
            return
        # broadcast は eager にやる。これにより警告攻撃中の row 変更が
        # 次ターンを待たず UI に伝わる。
        loop.create_task(self._broadcast_state())

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
        """1 ターン分の進行:
        1) DoT 適用 (味方/敵共に)
        2) ターン経過 gauge 加算 (味方のみ)
        3) 行動順を確定して各アクター行動
        4) 状態効果の turns_left 減算
        """
        base_params = self.game_state.characters_cfg.get("base_params", {})

        # 1) DoT
        await self._apply_dot_ticks()
        self._check_end()
        if self.finished:
            return

        # 2) ターン経過 gauge
        gauge_per_turn = int(base_params.get("gauge_per_turn", 5))
        for ally in self.allies:
            if not ally.downed:
                mult = 1.0
                if ally.condition:
                    mult = float(ally.condition.get("gauge_multiplier", 1.0))
                ally.gain_gauge(int(round(gauge_per_turn * mult)))

        # 3) 行動順を素早さ降順で確定(同率はランダム並び替え)
        actors = self._build_action_order()
        for actor in actors:
            if self.finished:
                break
            if actor.downed:
                continue
            # 寝不足の行動スキップ
            if (
                actor.is_ally
                and actor.condition
                and random.random() < float(actor.condition.get("skip_chance", 0.0))
            ):
                await self._broadcast_action(
                    {
                        "kind": "skip",
                        "actor_id": actor.id,
                        "actor_name": actor.name,
                        "actor_is_ally": True,
                        "turn": self.turn,
                        "message": f"{actor.name} は寝不足で動けない…",
                    }
                )
                continue
            # 味方でゲージ満タンなら必殺技
            if actor.is_ally and actor.gauge >= actor.max_gauge and actor.ultimate:
                await self._act_ultimate(actor)
            elif (not actor.is_ally) and actor.is_boss:
                # ボスはターン頭で警告攻撃を発動するか抽選する
                fired_warning = await self._maybe_announce_warning(actor)
                if not fired_warning:
                    await self._act_normal(actor)
            else:
                await self._act_normal(actor)
            self._check_end()

        # 4) 警告攻撃で fires_on_turn を迎えたものをここで発動
        await self._fire_pending_warnings()
        self._check_end()

        # 5) 状態効果の turns_left を減算 (今ターンに付与された buff/debuff が
        #    当ターン中に効くよう、最後にまとめて減らす)
        for c in (*self.allies, *self.enemies):
            c.tick_status_effects()

    async def _maybe_announce_warning(self, boss: Combatant) -> bool:
        """ボスのターンに警告攻撃の予告を試みる。

        既に予告中なら今回は通常攻撃(SPEC §4.6 duplicate_prevention)。
        新規予告に踏み切ったら True を返す → 通常攻撃をスキップ。
        """
        if boss.id in self._pending_warnings:
            # 予告中の残カウントダウンを 1 進める告知だけ流して通常攻撃側に任せる
            await self._tick_warning_announce(boss.id)
            return False

        warn_cfg = boss.behavior.get("warning_attack")
        if not warn_cfg:
            return False
        prob = float(warn_cfg.get("probability_per_turn", 0.25))
        if random.random() >= prob:
            return False

        variants = warn_cfg.get("variants", [])
        if not variants:
            return False
        weights = [float(v.get("weight", 1.0)) for v in variants]
        variant = random.choices(variants, weights=weights, k=1)[0]
        warning_turns = int(warn_cfg.get("warning_turns", 2))
        damage_base = int(warn_cfg.get("damage_base", 50))

        ann = warn_cfg.get("announcement", {})
        msg_template = ann.get("turn_minus_2") or "⚠ 警告!"
        msg = msg_template.format(variant_name=variant.get("name", "?"))

        self._pending_warnings[boss.id] = {
            "boss_id": boss.id,
            "boss_name": boss.name,
            "variant_name": variant.get("name", "?"),
            "variant_kind": variant.get("kind", ""),
            "target_row": variant.get("target_row", "front"),
            "fires_on_turn": self.turn + warning_turns,
            "damage_base": damage_base,
        }
        await self._broadcast_action(
            {
                "kind": "warning_announce",
                "actor_id": boss.id,
                "actor_name": boss.name,
                "actor_is_ally": False,
                "variant_name": variant.get("name", "?"),
                "variant_kind": variant.get("kind", ""),
                "target_row": variant.get("target_row", "front"),
                "fires_on_turn": self.turn + warning_turns,
                "turns_left": warning_turns,
                "turn": self.turn,
                "message": msg,
            }
        )
        # 予告ターンはボスは通常攻撃しない
        return True

    async def _tick_warning_announce(self, boss_id: str) -> None:
        """既に予告中のボスについて、毎ターン頭にカウントダウン表示を流す。"""
        w = self._pending_warnings.get(boss_id)
        if not w:
            return
        turns_left = max(0, w["fires_on_turn"] - self.turn)
        if turns_left <= 0:
            return
        boss = next((e for e in self.enemies if e.id == boss_id), None)
        if boss is None:
            return
        warn_cfg = boss.behavior.get("warning_attack", {})
        ann = warn_cfg.get("announcement", {})
        key = "turn_minus_1" if turns_left == 1 else "turn_minus_2"
        tpl = ann.get(key) or "⚠ 警告!"
        await self._broadcast_action(
            {
                "kind": "warning_countdown",
                "actor_id": boss_id,
                "actor_name": w["boss_name"],
                "actor_is_ally": False,
                "variant_name": w["variant_name"],
                "target_row": w["target_row"],
                "turns_left": turns_left,
                "turn": self.turn,
                "message": tpl.format(variant_name=w["variant_name"]),
            }
        )

    async def _fire_pending_warnings(self) -> None:
        """発動ターンを迎えた警告攻撃を解決する。"""
        to_remove: list[str] = []
        for boss_id, w in list(self._pending_warnings.items()):
            if w["fires_on_turn"] != self.turn:
                continue
            boss = next((e for e in self.enemies if e.id == boss_id), None)
            target_row = w["target_row"]
            damage_base = int(w["damage_base"])
            variant_name = w["variant_name"]
            ann = (
                boss.behavior.get("warning_attack", {}).get("announcement", {})
                if boss
                else {}
            )

            # 該当列の生存味方を取得
            targets = [a for a in self.allies if a.row == target_row and not a.downed]
            on_fire = ann.get("on_fire", {})

            if not targets:
                # セーフ演出
                await self._broadcast_action(
                    {
                        "kind": "warning_safe",
                        "actor_id": boss_id,
                        "actor_name": w["boss_name"],
                        "actor_is_ally": False,
                        "variant_name": variant_name,
                        "target_row": target_row,
                        "turn": self.turn,
                        "message": on_fire.get("safe") or "ヒュー...セーフ!",
                    }
                )
            else:
                # 該当列全員にダメージ(防御差し引き、最低 1)
                damage_minimum = int(
                    self.game_state.characters_cfg.get("base_params", {}).get(
                        "damage_minimum", 1
                    )
                )
                victims: list[dict[str, Any]] = []
                for ally in targets:
                    final = max(damage_minimum, damage_base - ally.defense)
                    actual = ally.take_damage(final)
                    # 被弾の声援も加算
                    base = int(
                        self.game_state.characters_cfg.get("base_params", {}).get(
                            "gauge_per_hit_taken", 10
                        )
                    )
                    mult = (
                        float(ally.condition.get("gauge_multiplier", 1.0))
                        if ally.condition
                        else 1.0
                    )
                    ally.gain_gauge(int(round(base * mult)))
                    victims.append(
                        {
                            "ally_id": ally.id,
                            "ally_name": ally.name,
                            "damage": actual,
                            "downed": ally.downed,
                        }
                    )
                msg_tpl = on_fire.get("hit") or "💥 {variant_name}!"
                await self._broadcast_action(
                    {
                        "kind": "warning_fire",
                        "actor_id": boss_id,
                        "actor_name": w["boss_name"],
                        "actor_is_ally": False,
                        "variant_name": variant_name,
                        "target_row": target_row,
                        "victims": victims,
                        "turn": self.turn,
                        "message": msg_tpl.format(variant_name=variant_name),
                    }
                )
                # 倒れた味方の broadcast
                for v in victims:
                    if v["downed"]:
                        downed_msg = pick_dialogue(
                            self.game_state.dialogue_cfg, v["ally_id"], "downed"
                        )
                        await self._broadcast_action(
                            {
                                "kind": "downed",
                                "actor_id": v["ally_id"],
                                "actor_name": v["ally_name"],
                                "actor_is_ally": True,
                                "turn": self.turn,
                                "message": downed_msg or f"{v['ally_name']} ダウン...",
                            }
                        )

            to_remove.append(boss_id)

        for k in to_remove:
            self._pending_warnings.pop(k, None)

    async def _apply_dot_ticks(self) -> None:
        """DoT を全アクターに適用し、ダメージを broadcast。"""
        for c in (*self.allies, *self.enemies):
            if c.downed:
                continue
            applied = c.tick_dots()
            for name, dmg in applied:
                await self._broadcast_action(
                    {
                        "kind": "dot_tick",
                        "actor_id": c.id,
                        "actor_name": c.name,
                        "actor_is_ally": c.is_ally,
                        "dot_name": name,
                        "damage": dmg,
                        "target_downed": c.downed,
                        "turn": self.turn,
                        "message": f"{c.name} に {name} {dmg}",
                    }
                )

    def _build_action_order(self) -> list[Combatant]:
        combined: list[Combatant] = [
            c for c in (*self.allies, *self.enemies) if not c.downed
        ]
        # effective_speed でデバフ反映、同率はランダム並び替え
        combined.sort(key=lambda c: (-c.effective_speed(), random.random()))
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
            attacker_attack=int(round(actor.effective_attack())),
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

    async def _act_ultimate(self, actor: Combatant) -> None:
        """必殺技 1 発動。発動後ゲージ 0。"""
        position_modifiers = self.game_state.characters_cfg.get(
            "position_modifiers", {}
        )
        base_params = self.game_state.characters_cfg.get("base_params", {})

        line = pick_dialogue(
            self.game_state.dialogue_cfg, actor.id, "ultimate"
        )
        ult_name = (actor.ultimate or {}).get("name", "?")
        msg = (
            f"{actor.name}「{line}」"
            if line
            else f"{actor.name} の必殺技!{ult_name}!"
        )

        result = execute_ultimate(
            actor,
            self.allies,
            self.enemies,
            position_modifiers=position_modifiers,
            damage_minimum=int(base_params.get("damage_minimum", 1)),
            line_message=msg,
        )
        actor.reset_gauge()

        await self._broadcast_action(
            {
                "kind": "ultimate",
                "actor_id": actor.id,
                "actor_name": actor.name,
                "actor_is_ally": True,
                "turn": self.turn,
                **result.to_dict(),
            }
        )

        # 倒れた敵を broadcast
        for e in self.enemies:
            if e.id in result.targets_hit and e.downed:
                await self._broadcast_action(
                    {
                        "kind": "downed",
                        "actor_id": e.id,
                        "actor_name": e.name,
                        "actor_is_ally": False,
                        "turn": self.turn,
                        "message": f"{e.name} を撃破!",
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
