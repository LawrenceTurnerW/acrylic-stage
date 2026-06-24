"""Acrylic Stage backend エントリーポイント。

FastAPI で /ws/live (WebSocket), /start_battle (POST), /state (GET) を提供。
起動時に ArUco カメラループとハートビートタスクを開始する。

開発実行: cd backend && uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

# macOS: OpenCV のカメラ認可リクエストはメインスレッドからしか走らせられないので、
# ここで明示的にスキップし、認可はターミナルアプリ(プロセス親)のものに委ねる。
# 初回起動時に macOS のカメラ許可ダイアログが出るので、ターミナル(または Claude
# が起動した親アプリ)に対して許可すること。
os.environ.setdefault("OPENCV_AVFOUNDATION_SKIP_AUTH", "1")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.camera import CameraLoop, probe_cameras
from core.state import GameState
from core.ws_manager import WSManager
from engine.battle import BattleEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
)
logger = logging.getLogger("acrylic")

ws_manager = WSManager()
game_state = GameState()
camera_loop = CameraLoop(ws_manager)
battle_engine = BattleEngine(ws_broadcast=ws_manager.broadcast, game_state=game_state)

# 戦闘中にアクスタが物理的に動かされたら、ArUco の検出結果を engine に流す
# (row 変化があった時だけ即時 battle_state を broadcast、SPEC §4.6 警告攻撃)
camera_loop.on_detections = battle_engine.schedule_row_sync


async def _heartbeat_task() -> None:
    """Day 1-2 の疎通確認用に 2 秒ごとに簡易メッセージを流す。"""
    n = 0
    while True:
        n += 1
        await ws_manager.broadcast(
            {
                "type": "heartbeat",
                "ts": time.time(),
                "seq": n,
                "phase": game_state.phase,
            }
        )
        await asyncio.sleep(2.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("starting backend services")
    heartbeat = asyncio.create_task(_heartbeat_task())
    camera_loop.start()
    try:
        yield
    finally:
        logger.info("stopping backend services")
        heartbeat.cancel()
        await battle_engine.stop()
        await camera_loop.stop()


app = FastAPI(title="Acrylic Stage", lifespan=lifespan)

# Electron の開発時 (localhost:5173) から叩けるように
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartBattleRequest(BaseModel):
    front: list[int] = []  # marker_id の配列
    rear: list[int] = []


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True}


@app.get("/state")
async def state() -> dict[str, Any]:
    return game_state.snapshot()


@app.get("/characters")
async def characters_endpoint() -> dict[str, Any]:
    """7 キャラの全情報 + ユニット/属性メタデータ + 起動時抽選済みコンディションを返す。

    レスポンスは Electron 側の編成画面・戦闘画面で参照する。
    再フェッチしてもコンディションは変わらない(プロセス再起動で再抽選)。
    """
    cfg = game_state.characters_cfg
    return {
        "characters": game_state.characters_with_conditions(),
        "units": cfg.get("units", {}),
        "attributes": cfg.get("attributes", {}),
        "stat_to_stars": cfg.get("stat_to_stars", {}),
        "position_modifiers": cfg.get("position_modifiers", {}),
        "base_params": cfg.get("base_params", {}),
        "conditions": cfg.get("conditions", []),
    }


@app.get("/stage")
async def stage_endpoint() -> dict[str, Any]:
    """現在進行予定のステージを返す(ハッカソン版ではステージ1固定)。"""
    stages = game_state.stages_cfg.get("stages", [])
    return {
        "current": stages[0] if stages else None,
        "enemy_types": game_state.stages_cfg.get("enemy_types", {}),
        "warning_attack_defaults": game_state.stages_cfg.get(
            "warning_attack_defaults", {}
        ),
    }


@app.post("/start_battle")
async def start_battle(req: StartBattleRequest) -> dict[str, Any]:
    """編成を確定して BattleEngine を起動する。"""
    logger.info("start_battle: front=%s rear=%s", req.front, req.rear)
    game_state.phase = "battle"
    game_state.formation = {"front": req.front, "rear": req.rear}
    await ws_manager.broadcast(
        {"type": "battle_start", "front": req.front, "rear": req.rear}
    )
    result = await battle_engine.start({"front": req.front, "rear": req.rear})
    return {"ok": True, "phase": game_state.phase, **result}


@app.post("/reset")
async def reset_to_prepare() -> dict[str, Any]:
    """戦闘を停止して編成画面に戻る。"""
    await battle_engine.stop()
    game_state.phase = "prepare"
    game_state.formation = {"front": [], "rear": []}
    return {"ok": True, "phase": game_state.phase}


@app.post("/calibration")
async def set_calibration(y_ratio: float) -> dict[str, Any]:
    # set_calibration は内部で同期 file IO を行うので、スライダードラッグ中の
    # 高頻度呼び出しがイベントループをブロックしないよう to_thread で逃がす。
    await asyncio.to_thread(camera_loop.set_calibration, y_ratio)
    return {"ok": True, "calibration_y_ratio": camera_loop.calibration_y_ratio}


@app.get("/cameras")
async def list_cameras() -> dict[str, Any]:
    """利用可能なカメラを UUID 付きで列挙して返す。

    プローブ前に realign を実行し、active_uuid の現在の index と稼働中の
    cap がズレていれば張り直す(USB 抜き差しによる index 変動への対応)。
    プローブは数秒かかることがある。
    """
    realign_result = await camera_loop.realign()
    cams = await asyncio.to_thread(probe_cameras, camera_loop.active_uuid)
    return {
        "active_uuid": camera_loop.active_uuid,
        "cameras": cams,
        "realign": realign_result,
    }


@app.post("/cameras/select")
async def select_camera(uuid: str) -> dict[str, Any]:
    return await camera_loop.switch_camera(uuid)


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    await ws_manager.connect(ws)
    try:
        # クライアントからの ping/コマンドは Day 1-2 では受け流すだけ
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)
    except Exception as e:
        logger.warning("ws_live error: %s", e)
        await ws_manager.disconnect(ws)
