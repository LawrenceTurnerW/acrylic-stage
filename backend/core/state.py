"""ゲーム状態管理。

Day 1-2 では YAML を読み込んで保持するだけ。
後で battle engine から書き換えられるよう、シンプルな in-memory dict にしておく。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"


def _load_yaml(name: str) -> dict[str, Any]:
    with (CONFIG_DIR / name).open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


class GameState:
    def __init__(self) -> None:
        self.characters_cfg = _load_yaml("characters.yaml")
        self.stages_cfg = _load_yaml("stages.yaml")
        self.dialogue_cfg = _load_yaml("dialogue.yaml")

        # ランタイム状態(Day 1-2 では placeholder)
        self.phase: str = "idle"  # idle / prepare / battle / result
        self.detections: list[dict[str, Any]] = []  # 最新の ArUco 検出結果

    def snapshot(self) -> dict[str, Any]:
        """/state で返す現在状態。"""
        return {
            "phase": self.phase,
            "detections": self.detections,
            "character_count": len(self.characters_cfg.get("characters", [])),
            "stage_count": len(self.stages_cfg.get("stages", [])),
        }
