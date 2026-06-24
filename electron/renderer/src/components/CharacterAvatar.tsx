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
    return (
      <img
        src={`${API_BASE}${url}`}
        alt={c.id}
        onError={() => setErrored(true)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          objectPosition: "center top",
          background: accent,
          flexShrink: 0,
          border: `2px solid ${accent}`,
          boxShadow: glow ? `0 0 12px ${accent}66` : "none",
        }}
        title={`ArUco marker id ${c.aruco_marker_id}`}
      />
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
