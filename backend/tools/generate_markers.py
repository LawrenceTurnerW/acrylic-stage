"""ArUco マーカー画像を生成する。

DICT_4X4_50 の ID 0〜6 を 7 体に割り当て、それぞれ:
  - 単独 PNG (高解像度・余白付き)
  - キャラ名つきラベル PNG
  - A4 印刷用に並べた 1 枚の PNG (2cm 角を狙う)
を出力する。

Usage:
  cd backend && .venv/bin/python tools/generate_markers.py

Output:
  docs/aruco_markers/marker_{0..6}.png       … 単独
  docs/aruco_markers/labeled_{0..6}.png      … キャラ名つき
  docs/aruco_markers/print_sheet.png         … A4 印刷用シート
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG = ROOT / "backend" / "config" / "characters.yaml"
OUT = ROOT / "docs" / "aruco_markers"

# DICT_4X4_50 のビットサイズ
MARKER_PIXELS = 600  # 単独画像のマーカー部分のピクセル数
MARGIN = 60          # 単独画像のマージン
LABEL_BAND = 80      # ラベル帯の高さ

# A4 印刷シート: 21cm x 29.7cm。ピクセル換算は 300dpi 想定で 2480x3508。
# 2cm 角のマーカーを並べたい。300dpi で 2cm = 236px。
DPI = 300
A4_W_PX = int(8.27 * DPI)   # 2481
A4_H_PX = int(11.69 * DPI)  # 3507
MARKER_MM = 30              # 印刷時のマーカー実寸 (mm)。SPEC は 2cm だが切り抜き余裕で 3cm
SHEET_MARKER_PX = int(MARKER_MM / 25.4 * DPI)


def load_character_names() -> dict[int, tuple[str, str]]:
    with CONFIG.open("r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    by_id: dict[int, tuple[str, str]] = {}
    for ch in cfg["characters"]:
        by_id[ch["aruco_marker_id"]] = (ch["id"], ch["name"])
    return by_id


def gen_marker_image(marker_id: int) -> np.ndarray:
    """白マージン付きの単独マーカー画像を返す (1ch, uint8)。"""
    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    img = cv2.aruco.generateImageMarker(aruco_dict, marker_id, MARKER_PIXELS)
    canvas = np.full(
        (MARKER_PIXELS + MARGIN * 2, MARKER_PIXELS + MARGIN * 2), 255, dtype=np.uint8
    )
    canvas[MARGIN : MARGIN + MARKER_PIXELS, MARGIN : MARGIN + MARKER_PIXELS] = img
    return canvas


def gen_labeled_image(marker_id: int, char_name: str) -> np.ndarray:
    """マーカーの下にキャラ名を入れた画像 (3ch, BGR)。"""
    marker = gen_marker_image(marker_id)
    h, w = marker.shape
    canvas = np.full((h + LABEL_BAND, w, 3), 255, dtype=np.uint8)
    canvas[:h, :, 0] = marker
    canvas[:h, :, 1] = marker
    canvas[:h, :, 2] = marker

    label = f"ID {marker_id}  {char_name}"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.4
    thickness = 3
    (tw, th), _ = cv2.getTextSize(label, font, font_scale, thickness)
    # 英数字のみ確実に出るよう romanization 付きでなく、ID と原文を入れる
    cv2.putText(
        canvas,
        f"ID {marker_id}",
        (20, h + LABEL_BAND - 25),
        font,
        font_scale,
        (0, 0, 0),
        thickness,
        cv2.LINE_AA,
    )
    # OpenCV の putText は日本語が出ないので、英字 ID のみで表現
    _ = (tw, th, char_name)
    return canvas


def gen_print_sheet(by_id: dict[int, tuple[str, str]]) -> np.ndarray:
    """A4 1 枚に 7 体並べたシート。実寸 3cm 角を狙う。"""
    sheet = np.full((A4_H_PX, A4_W_PX, 3), 255, dtype=np.uint8)

    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)

    cols = 2
    rows = 4  # 7 体なので 2x4 で 1 つ余白
    cell_w = A4_W_PX // cols
    cell_h = A4_H_PX // rows
    inner_pad = 80  # セル内マージン

    for marker_id in range(7):
        r = marker_id // cols
        c = marker_id % cols
        cx = c * cell_w + cell_w // 2
        cy = r * cell_h + cell_h // 2

        marker = cv2.aruco.generateImageMarker(
            aruco_dict, marker_id, SHEET_MARKER_PX
        )
        marker_bgr = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)

        x0 = cx - SHEET_MARKER_PX // 2
        y0 = cy - SHEET_MARKER_PX // 2 - 40  # ラベル分上に
        sheet[y0 : y0 + SHEET_MARKER_PX, x0 : x0 + SHEET_MARKER_PX] = marker_bgr

        # ラベル(英字のみ)
        char_id, _name = by_id.get(marker_id, ("?", "?"))
        label = f"ID {marker_id}  ({char_id})"
        cv2.putText(
            sheet,
            label,
            (x0, y0 + SHEET_MARKER_PX + 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.2,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )

        # 切り抜きガイド線
        cv2.rectangle(
            sheet,
            (x0 - inner_pad, y0 - inner_pad),
            (x0 + SHEET_MARKER_PX + inner_pad, y0 + SHEET_MARKER_PX + inner_pad + 80),
            (200, 200, 200),
            1,
        )

    # タイトル
    cv2.putText(
        sheet,
        f"Acrylic Stage  ArUco markers (DICT_4X4_50, ~{MARKER_MM}mm each)",
        (60, 80),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.4,
        (0, 0, 0),
        2,
        cv2.LINE_AA,
    )
    return sheet


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    by_id = load_character_names()

    for mid in range(7):
        marker_img = gen_marker_image(mid)
        cv2.imwrite(str(OUT / f"marker_{mid}.png"), marker_img)

        char_id, name = by_id.get(mid, ("?", "?"))
        labeled = gen_labeled_image(mid, name)
        cv2.imwrite(str(OUT / f"labeled_{mid}.png"), labeled)

    sheet = gen_print_sheet(by_id)
    cv2.imwrite(str(OUT / "print_sheet.png"), sheet)

    print(f"wrote {len(list(OUT.glob('*.png')))} files to {OUT}")
    for mid in range(7):
        char_id, name = by_id.get(mid, ("?", "?"))
        print(f"  ID {mid}: {name} ({char_id})")


if __name__ == "__main__":
    main()
