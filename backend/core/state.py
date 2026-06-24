"""ゲーム状態管理。

YAML を読み込み、起動時に各キャラのコンディションを 1 回だけ抽選する。
コンディションは SPEC §4.4 の確率に従う(絶好調 10% / 好調 25% / 普通 30% /
緊張気味 25% / 寝不足 10%)。再抽選はプロセス再起動で発生。

実行時に書き換わる状態は phase と formation のみ。戦闘ロジックは engine/
側に置き、ここはセッション全体を通じてのスナップショットを保持する役。
"""

from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import Any

import yaml

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

logger = logging.getLogger(__name__)


def _load_yaml(name: str) -> dict[str, Any]:
    with (CONFIG_DIR / name).open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


class GameState:
    def __init__(self) -> None:
        self.characters_cfg = _load_yaml("characters.yaml")
        self.stages_cfg = _load_yaml("stages.yaml")
        self.dialogue_cfg = _load_yaml("dialogue.yaml")

        # ランタイム状態
        self.phase: str = "idle"  # idle / prepare / battle / result
        self.formation: dict[str, list[int]] = {"front": [], "rear": []}

        # コンディションは起動時に 1 度だけ抽選
        self._character_conditions: dict[str, dict[str, Any]] = {}
        self._roll_conditions()

    def _roll_conditions(self) -> None:
        conditions = self.characters_cfg.get("conditions", [])
        if not conditions:
            return
        weights = [float(c.get("probability", 0)) for c in conditions]
        # 全 0 weight だと random.choices が ValueError を投げて起動に失敗する。
        # 設定ミス時は均等抽選にフォールバックして起動は通す。
        if sum(weights) <= 0:
            logger.warning(
                "all condition weights are zero; falling back to uniform"
            )
            weights = [1.0] * len(conditions)
        for ch in self.characters_cfg.get("characters", []):
            chosen = random.choices(conditions, weights=weights, k=1)[0]
            self._character_conditions[ch["id"]] = chosen
            logger.info(
                "condition rolled: %s -> %s", ch["id"], chosen.get("id")
            )

    def characters_with_conditions(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for ch in self.characters_cfg.get("characters", []):
            out.append(
                {**ch, "condition": self._character_conditions.get(ch["id"])}
            )
        return out

    def snapshot(self) -> dict[str, Any]:
        return {
            "phase": self.phase,
            "formation": self.formation,
            "character_count": len(self.characters_cfg.get("characters", [])),
            "stage_count": len(self.stages_cfg.get("stages", [])),
        }
