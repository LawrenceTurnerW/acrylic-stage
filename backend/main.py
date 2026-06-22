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

from core.camera import CameraLoop
from core.state import GameState
from core.ws_manager import WSManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
)
logger = logging.getLogger("acrylic")

ws_manager = WSManager()
game_state = GameState()
camera_loop = CameraLoop(ws_manager)


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


@app.post("/start_battle")
async def start_battle(req: StartBattleRequest) -> dict[str, Any]:
    """Day 1-2 では受信して phase を切り替えるだけのスタブ。"""
    logger.info("start_battle: front=%s rear=%s", req.front, req.rear)
    game_state.phase = "battle"
    await ws_manager.broadcast(
        {
            "type": "battle_start",
            "front": req.front,
            "rear": req.rear,
        }
    )
    return {"ok": True, "phase": game_state.phase}


@app.post("/calibration")
async def set_calibration(y_ratio: float) -> dict[str, Any]:
    camera_loop.set_calibration(y_ratio)
    return {"ok": True, "calibration_y_ratio": camera_loop.calibration_y_ratio}


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
