// キャラ画像 (cast_image_url) を表示する共通コンポーネント。
// 画像が無い / 404 時は個人カラー + marker_id のカラーチップにフォールバック。
//
// 画像は本リポジトリには含めない方針 (README §キャラクター画像)。
// scripts/download_character_images.sh で取得して backend/assets/characters/
// に置く前提。

import { useState } from "react";
import type { Character } from "../types/character";

const API_BASE = "http://127.0.0.1:8000";

export function CharacterAvatar(props: {
  character: Pick<
    Character,
    "id" | "aruco_marker_id" | "personal_color" | "cast_image_url"
  >;
  size?: number;
  shape?: "rounded" | "circle";
  glow?: boolean;
}) {
  const { character: c, size = 52, shape = "rounded", glow = true } = props;
  const [errored, setErrored] = useState(false);

  const radius = shape === "circle" ? size / 2 : Math.max(6, size * 0.18);
  const accent = c.personal_color;
  const url = c.cast_image_url;
  const showImage = !!url && !errored;

  if (showImage) {
    // 公式 cast 画像は縦長の全身ショットなので、wrapper で overflow:hidden しつつ
    // img を scale(1.7) で拡大して顔だけが大きく見えるようにクロップする。
    // origin: center top で「上端を固定したまま下方向に拡大」=「画像の下半分が
    // 視界外に押し出されて頭部だけ残る」効果。scale 値はキャラ毎に微調整したく
    // なったら CSS 変数化を検討する。
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
          background: accent,
          border: `2px solid ${accent}`,
          boxShadow: glow ? `0 0 12px ${accent}66` : "none",
          flexShrink: 0,
        }}
        title={`ArUco marker id ${c.aruco_marker_id}`}
      >
        <img
          src={`${API_BASE}${url}`}
          alt={c.id}
          onError={() => setErrored(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
            transform: "scale(1.7)",
            transformOrigin: "center top",
            display: "block",
          }}
        />
      </div>
    );
  }

  // フォールバック: カラーチップ + marker_id
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0f0f14",
        fontWeight: 800,
        fontSize: Math.max(12, size * 0.42),
        letterSpacing: 1,
        flexShrink: 0,
        boxShadow: glow ? `0 0 12px ${accent}66` : "none",
      }}
      title={`ArUco marker id ${c.aruco_marker_id}`}
    >
      {c.aruco_marker_id}
    </div>
  );
}
