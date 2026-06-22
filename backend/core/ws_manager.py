"""WebSocket 接続管理。

複数クライアントを束ねて broadcast する最小実装。
Day 1-2 ではエコーや疎通確認用、後で battle イベントを流すのにも使う。
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WSManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        logger.info("ws client connected (total=%d)", len(self._clients))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)
        logger.info("ws client disconnected (total=%d)", len(self._clients))

    async def broadcast(self, message: dict[str, Any]) -> None:
        if not self._clients:
            return
        payload = json.dumps(message, ensure_ascii=False)
        async with self._lock:
            targets = list(self._clients)
        stale: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning("ws send failed, dropping client: %s", e)
                stale.append(ws)
        if stale:
            async with self._lock:
                for ws in stale:
                    self._clients.discard(ws)
