"""ArUco マーカー認識ループ + macOS カメラ識別。

DICT_4X4_50 のマーカー ID 0〜6 を 5fps で検出し、検出結果と JPEG エンコードした
フレームを WebSocket でブロードキャストする。

カメラ識別は AVFoundation の uniqueID (UUID) で行う。OpenCV の整数 index は
USB の抜き差しで意味が変わるが、UUID はデバイスに紐付くので安定。
- macOS: pyobjc-framework-AVFoundation で UUID と名前を取得
- 非 macOS: UUID が無いので index ベースのフォールバックのみ

Y 座標で前列/後列を判定する閾値は calibration_y_ratio (0.0-1.0)。
画面高さ × 比率より下なら前列、上なら後列。
"""

from __future__ import annotations

import asyncio
import base64
import logging
import platform
import time
from dataclasses import dataclass
from typing import Callable

import cv2
import numpy as np

from . import calibration as calibration_store
from .ws_manager import WSManager

logger = logging.getLogger(__name__)

ARUCO_DICT = cv2.aruco.DICT_4X4_50
TARGET_FPS = 5
TARGET_IDS = set(range(0, 7))
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
JPEG_QUALITY = 70
FALLBACK_PROBE_MAX_INDEX = 4  # macOS 以外で AVFoundation 列挙できない時用


@dataclass
class Detection:
    marker_id: int
    cx: float
    cy: float
    row: str  # "front" / "rear"

    def to_dict(self) -> dict:
        return {
            "marker_id": self.marker_id,
            "cx": round(self.cx, 1),
            "cy": round(self.cy, 1),
            "row": self.row,
        }


# ---------------------------------------------------------------------------
# AVFoundation device discovery (macOS)
# ---------------------------------------------------------------------------


def discover_devices() -> list[dict]:
    """現在接続中のカメラ一覧を返す。

    macOS: AVFoundation で UUID + ローカライズ名 + OpenCV index (列挙順)。
    その他: index のみのフォールバック。
    """
    if platform.system() == "Darwin":
        try:
            from AVFoundation import (  # type: ignore[import-not-found]
                AVCaptureDeviceDiscoverySession,
                AVCaptureDeviceTypeBuiltInWideAngleCamera,
                AVCaptureDeviceTypeExternalUnknown,
                AVCaptureDevicePositionUnspecified,
                AVMediaTypeVideo,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("AVFoundation import failed, falling back: %s", e)
        else:
            types = [
                AVCaptureDeviceTypeBuiltInWideAngleCamera,
                AVCaptureDeviceTypeExternalUnknown,
            ]
            sess = AVCaptureDeviceDiscoverySession.discoverySessionWithDeviceTypes_mediaType_position_(
                types, AVMediaTypeVideo, AVCaptureDevicePositionUnspecified
            )
            return [
                {
                    "uuid": str(d.uniqueID()),
                    "name": str(d.localizedName()),
                    "index": i,
                }
                for i, d in enumerate(sess.devices())
            ]

    # フォールバック: index で愚直に試す
    devices: list[dict] = []
    for i in range(FALLBACK_PROBE_MAX_INDEX):
        cap = cv2.VideoCapture(i)
        ok = cap.isOpened()
        cap.release()
        if ok:
            devices.append({"uuid": f"index:{i}", "name": f"Camera {i}", "index": i})
    return devices


def resolve_index_by_uuid(uuid: str) -> int | None:
    for d in discover_devices():
        if d["uuid"] == uuid:
            return int(d["index"])
    return None


# ---------------------------------------------------------------------------
# Probe (sambonail-aware)
# ---------------------------------------------------------------------------


def _thumbnail(frame: np.ndarray, max_width: int = 240) -> str:
    h, w = frame.shape[:2]
    if w > max_width:
        new_w = max_width
        new_h = int(h * max_width / w)
        frame = cv2.resize(frame, (new_w, new_h))
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("ascii")


def probe_cameras(active_uuid: str | None = None) -> list[dict]:
    """現在接続中の全カメラについて、UUID/名前/サムネイルを返す。

    active な UUID は二重 open を避けるためサムネイル無しで返す
    (UI 側でメインのライブ映像を流用すること)。
    """
    devices = discover_devices()
    results: list[dict] = []
    for d in devices:
        is_active = d["uuid"] == active_uuid
        if is_active:
            results.append(
                {
                    **d,
                    "available": True,
                    "active": True,
                    "thumbnail_jpeg_b64": None,
                }
            )
            continue
        cap = cv2.VideoCapture(int(d["index"]))
        thumb_b64: str | None = None
        ok = cap.isOpened()
        if ok:
            cap.read()  # AVFoundation のバッファ初期化を待つため捨て読み
            ok, frame = cap.read()
            if ok and frame is not None:
                thumb_b64 = _thumbnail(frame)
        cap.release()
        results.append(
            {
                **d,
                "available": bool(ok and thumb_b64),
                "active": False,
                "thumbnail_jpeg_b64": thumb_b64,
            }
        )
    return results


# ---------------------------------------------------------------------------
# CameraLoop
# ---------------------------------------------------------------------------


class CameraLoop:
    """カメラ取得→ ArUco 検出→ WebSocket ブロードキャストを 5fps で回す。

    `active_uuid` をキャノニカルな ID として保持し、実際の OpenCV index は
    起動時/切替時に AVFoundation から解決する。これにより USB 抜き差しで
    OpenCV index が変わってもデバイス追跡が壊れない。
    """

    def __init__(self, ws: WSManager) -> None:
        self.ws = ws
        self.active_uuid: str | None = None  # 起動時に最初のデバイスを採用
        self._task: asyncio.Task | None = None
        self._running = False
        self._opened_index: int | None = None  # 現在 cap が掴んでいる index
        self._switch_lock = asyncio.Lock()
        # 検出があるたびに呼ばれるフック (BattleEngine の row 追従用)。
        # 同期関数を想定。例外は内部で吸い込む。
        self.on_detections: "Callable[[list[dict]], None] | None" = None

        # 永続化されたキャリブレーションがあれば復元
        saved = calibration_store.load()
        try:
            self.calibration_y_ratio = float(saved.get("calibration_y_ratio", 0.5))
        except (TypeError, ValueError):
            self.calibration_y_ratio = 0.5
        self.calibration_y_ratio = max(0.0, min(1.0, self.calibration_y_ratio))
        if saved:
            logger.info(
                "calibration restored: y_ratio=%.3f",
                self.calibration_y_ratio,
            )

        self._aruco_dict = cv2.aruco.getPredefinedDictionary(ARUCO_DICT)
        self._aruco_params = cv2.aruco.DetectorParameters()
        self._detector = cv2.aruco.ArucoDetector(
            self._aruco_dict, self._aruco_params
        )

        # 初期 UUID: 接続中のカメラの先頭
        initial = discover_devices()
        if initial:
            self.active_uuid = initial[0]["uuid"]
            logger.info(
                "initial camera: %s (%s)", initial[0]["name"], initial[0]["uuid"]
            )
        else:
            logger.warning("no cameras detected at startup")

    def _start_unlocked(self) -> None:
        if self._running:
            return
        if self.active_uuid is None:
            logger.error("cannot start: no active uuid")
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def _stop_unlocked(self) -> None:
        self._running = False
        if self._task is not None:
            await self._task
            self._task = None

    def start(self) -> None:
        # lifespan からの起動時など、ロック取得不要のケース用
        self._start_unlocked()

    async def stop(self) -> None:
        async with self._switch_lock:
            await self._stop_unlocked()

    async def switch_camera(self, uuid: str) -> dict:
        async with self._switch_lock:
            if uuid == self.active_uuid and self._running:
                return {
                    "ok": True,
                    "uuid": uuid,
                    "changed": False,
                }
            was_running = self._running
            await self._stop_unlocked()
            self.active_uuid = uuid
            if was_running:
                self._start_unlocked()
            logger.info("camera switched to uuid=%s", uuid)
            return {"ok": True, "uuid": uuid, "changed": True}

    async def realign(self) -> dict:
        """active_uuid の現在 index と cap の index がズレてたら再 open。

        - active_uuid が見つからない → 切断とみなしてループを停止
        - 別 index に再割り当てされていた → 停止して新 index で再開
        - ループ停止中だが UUID のデバイスが復帰 → 再起動
        - 一致 → 何もしない
        """
        async with self._switch_lock:
            if self.active_uuid is None:
                return {"action": "noop", "reason": "no active uuid"}
            current_idx = resolve_index_by_uuid(self.active_uuid)
            if current_idx is None:
                if self._running:
                    logger.warning(
                        "active camera %s disappeared, stopping loop",
                        self.active_uuid,
                    )
                    await self._stop_unlocked()
                    await self.ws.broadcast(
                        {
                            "type": "camera_error",
                            "message": "active camera disconnected",
                        }
                    )
                    return {"action": "stopped", "reason": "device disappeared"}
                return {"action": "noop", "reason": "device not present"}
            if not self._running:
                logger.info(
                    "active camera %s is back, restarting loop", self.active_uuid
                )
                self._start_unlocked()
                return {"action": "restarted", "reason": "device returned"}
            if current_idx != self._opened_index:
                logger.info(
                    "active camera index changed %s -> %s, restarting",
                    self._opened_index,
                    current_idx,
                )
                await self._stop_unlocked()
                self._start_unlocked()
                return {
                    "action": "realigned",
                    "reason": "index changed",
                    "new_index": current_idx,
                }
            return {"action": "ok", "index": current_idx}

    def set_calibration(self, y_ratio: float) -> None:
        self.calibration_y_ratio = max(0.0, min(1.0, y_ratio))
        try:
            calibration_store.save(
                {"calibration_y_ratio": self.calibration_y_ratio}
            )
        except Exception as e:  # noqa: BLE001
            # 永続化失敗してもラン側は止めない(次回 0.5 に戻るだけ)
            logger.warning("calibration save failed: %s", e)

    async def _run(self) -> None:
        cap = await asyncio.to_thread(self._open_camera)
        if cap is None or not cap.isOpened():
            logger.error("camera open failed (uuid=%s)", self.active_uuid)
            await self.ws.broadcast(
                {"type": "camera_error", "message": "camera open failed"}
            )
            self._running = False
            return

        logger.info("camera loop started (uuid=%s)", self.active_uuid)
        interval = 1.0 / TARGET_FPS
        consecutive_failures = 0
        max_failures = TARGET_FPS * 3  # 3 秒分
        try:
            while self._running:
                t0 = time.perf_counter()
                frame = await asyncio.to_thread(self._read_frame, cap)
                if frame is None:
                    consecutive_failures += 1
                    if consecutive_failures >= max_failures:
                        logger.warning(
                            "camera read failed for 3s, stopping loop "
                            "(uuid=%s)",
                            self.active_uuid,
                        )
                        await self.ws.broadcast(
                            {
                                "type": "camera_error",
                                "message": "frame read failed; camera disconnected",
                            }
                        )
                        self._running = False
                        break
                    await asyncio.sleep(interval)
                    continue
                consecutive_failures = 0

                detections, annotated = await asyncio.to_thread(
                    self._process_frame, frame
                )
                jpeg_b64 = await asyncio.to_thread(self._encode_jpeg, annotated)

                detection_dicts = [d.to_dict() for d in detections]
                await self.ws.broadcast(
                    {
                        "type": "aruco_frame",
                        "ts": time.time(),
                        "calibration_y_ratio": self.calibration_y_ratio,
                        "frame_jpeg_b64": jpeg_b64,
                        "detections": detection_dicts,
                        "active_uuid": self.active_uuid,
                    }
                )

                # 戦闘中の列入れ替え検知用フック
                if self.on_detections is not None:
                    try:
                        self.on_detections(detection_dicts)
                    except Exception as e:  # noqa: BLE001
                        logger.warning("on_detections hook failed: %s", e)

                elapsed = time.perf_counter() - t0
                await asyncio.sleep(max(0.0, interval - elapsed))
        finally:
            await asyncio.to_thread(cap.release)
            self._opened_index = None
            logger.info("camera loop stopped")

    def _open_camera(self) -> cv2.VideoCapture | None:
        if self.active_uuid is None:
            return None
        idx = resolve_index_by_uuid(self.active_uuid)
        if idx is None:
            logger.error("uuid %s not found in current devices", self.active_uuid)
            return None
        logger.info(
            "opening camera index=%d for uuid=%s", idx, self.active_uuid
        )
        cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            return None
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
        self._opened_index = idx
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
        ok, buf = cv2.imencode(
            ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
        )
        if not ok:
            return ""
        return base64.b64encode(buf.tobytes()).decode("ascii")
