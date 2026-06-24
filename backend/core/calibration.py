"""キャリブレーション値の永続化。

frontend のスライダー操作で /calibration が呼ばれるたびに
backend/config/calibration.local.json に書き込み、起動時に読み戻す。
ハッカソン会場で毎回 0.5 から調整し直さなくて済むようにするのが目的。

ファイル本体は .gitignore 済み (calibration.local.json)。
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
CALIBRATION_FILE = CONFIG_DIR / "calibration.local.json"

logger = logging.getLogger(__name__)


def load() -> dict[str, Any]:
    """保存済みキャリブレーションを読む。失敗時は {} を返す。"""
    if not CALIBRATION_FILE.exists():
        return {}
    try:
        return json.loads(CALIBRATION_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("calibration load failed: %s", e)
        return {}


def save(data: dict[str, Any]) -> None:
    """atomic write (一時ファイル → rename) で書き込む。

    スライダーのドラッグ中は秒間 10 回以上呼ばれる可能性があるが、
    ファイルが数十バイトなので同期 IO のオーバーヘッドは無視できる。
    """
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        prefix=".calibration.", suffix=".json", dir=str(CONFIG_DIR)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, CALIBRATION_FILE)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
