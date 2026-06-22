"""ArUco マーカー認識ループ。

DICT_4X4_50 のマーカー ID 0〜6 を 5fps で検出し、
検出結果と JPEG エンコードしたフレームを WebSocket でブロードキャストする。

Y 座標で前列/後列を判定する閾値は calibration_y_ratio (0.0-1.0) で持つ。
画面高さ × 比率より下なら前列、上なら後列。
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from dataclasses import dataclass

import cv2
import numpy as np

from .ws_manager import WSManager

logger = logging.getLogger(__name__)

ARUCO_DICT = cv2.aruco.DICT_4X4_50
TARGET_FPS = 5
TARGET_IDS = set(range(0, 7))  # 0..6 を 7 体に割り当て
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
JPEG_QUALITY = 70


@dataclass
class Detection:
    marker_id: int
    cx: float  # 中心 x (px)
    cy: float  # 中心 y (px)
    row: str  # "front" / "rear"

    def to_dict(self) -> dict:
        return {
            "marker_id": self.marker_id,
            "cx": round(self.cx, 1),
            "cy": round(self.cy, 1),
            "row": self.row,
        }


class CameraLoop:
    def __init__(self, ws: WSManager, camera_index: int = 0) -> None:
        self.ws = ws
        self.camera_index = camera_index
        self._task: asyncio.Task | None = None
        self._running = False
        # 画面の下から calibration_y_ratio までを前列扱い(0.5 なら下半分が前列)
        self.calibration_y_ratio: float = 0.5

        # OpenCV 4.7+ の新 API
        self._aruco_dict = cv2.aruco.getPredefinedDictionary(ARUCO_DICT)
        self._aruco_params = cv2.aruco.DetectorParameters()
        self._detector = cv2.aruco.ArucoDetector(self._aruco_dict, self._aruco_params)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            await self._task
            self._task = None

    def set_calibration(self, y_ratio: float) -> None:
        self.calibration_y_ratio = max(0.0, min(1.0, y_ratio))

    async def _run(self) -> None:
        cap = await asyncio.to_thread(self._open_camera)
        if cap is None or not cap.isOpened():
            logger.error("camera open failed (index=%d)", self.camera_index)
            await self.ws.broadcast(
                {"type": "camera_error", "message": "camera open failed"}
            )
            self._running = False
            return

        logger.info("camera loop started (%dfps target)", TARGET_FPS)
        interval = 1.0 / TARGET_FPS
        try:
            while self._running:
                t0 = time.perf_counter()
                frame = await asyncio.to_thread(self._read_frame, cap)
                if frame is None:
                    await asyncio.sleep(interval)
                    continue

                detections, annotated = await asyncio.to_thread(
                    self._process_frame, frame
                )
                jpeg_b64 = await asyncio.to_thread(self._encode_jpeg, annotated)

                await self.ws.broadcast(
                    {
                        "type": "aruco_frame",
                        "ts": time.time(),
                        "calibration_y_ratio": self.calibration_y_ratio,
                        "frame_jpeg_b64": jpeg_b64,
                        "detections": [d.to_dict() for d in detections],
                    }
                )

                elapsed = time.perf_counter() - t0
                await asyncio.sleep(max(0.0, interval - elapsed))
        finally:
            await asyncio.to_thread(cap.release)
            logger.info("camera loop stopped")

    def _open_camera(self) -> cv2.VideoCapture | None:
        cap = cv2.VideoCapture(self.camera_index)
        if not cap.isOpened():
            return None
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        return cap

    def _read_frame(self, cap: cv2.VideoCapture) -> np.ndarray | None:
        ok, frame = cap.read()
        if not ok:
            return None
        return frame

    def _process_frame(
        self, frame: np.ndarray
    ) -> tuple[list[Detection], np.ndarray]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        corners, ids, _ = self._detector.detectMarkers(gray)

        detections: list[Detection] = []
        h = frame.shape[0]
        threshold_y = h * (1.0 - self.calibration_y_ratio)

        annotated = frame.copy()
        # 前列ラインを描画
        cv2.line(
            annotated,
            (0, int(threshold_y)),
            (annotated.shape[1], int(threshold_y)),
            (0, 255, 255),
            2,
        )

        if ids is not None:
            cv2.aruco.drawDetectedMarkers(annotated, corners, ids)
            for i, marker_id_arr in enumerate(ids):
                marker_id = int(marker_id_arr[0])
                if marker_id not in TARGET_IDS:
                    continue
                pts = corners[i].reshape(-1, 2)
                cx = float(pts[:, 0].mean())
                cy = float(pts[:, 1].mean())
                row = "front" if cy >= threshold_y else "rear"
                detections.append(Detection(marker_id, cx, cy, row))

        return detections, annotated

    def _encode_jpeg(self, frame: np.ndarray) -> str:
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if not ok:
            return ""
        return base64.b64encode(buf.tobytes()).decode("ascii")
