// 警告攻撃の UI 一式 (SPEC §4.6 / §10):
//   - WarningBanner: 画面上部の赤い帯(2 ターン or 1 ターン残)
//   - WarningFlash : 発動時のフルスクリーン(HIT は赤、SAFE は青)。900ms で fade
//
// プレイヤーがアクスタを物理的に動かして該当列を空にできれば SAFE。

import { useEffect } from "react";

export function WarningBanner(props: {
  variant_name: string;
  target_row: "front" | "rear";
  turns_left: number;
}) {
  const urgent = props.turns_left <= 1;
  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        left: 0,
        right: 0,
        margin: "0 auto",
        maxWidth: 720,
        padding: "10px 18px",
        background: urgent
          ? "linear-gradient(90deg, #ff3a3acc, #ff7b72cc)"
          : "linear-gradient(90deg, #b53a3acc, #d05050cc)",
        border: `2px solid ${urgent ? "#ff3a3a" : "#d05050"}`,
        borderRadius: 8,
        color: "#fff",
        fontWeight: 800,
        letterSpacing: 2,
        textAlign: "center",
        fontSize: 18,
        zIndex: 90,
        animation: urgent ? "warning-pulse 600ms ease-in-out infinite" : "none",
        boxShadow: "0 0 24px rgba(255,80,80,0.6)",
      }}
    >
      ⚠ {props.variant_name} ・ あと {props.turns_left} ターン
      <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>
        {props.target_row === "front" ? "前列を後ろへ!" : "後列を前へ!"}
      </div>
    </div>
  );
}

const FLASH_DURATION_MS = 900;

export function WarningFlash(props: {
  kind: "hit" | "safe";
  message: string;
  variant_name: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(props.onDone, FLASH_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [props.onDone]);

  const hit = props.kind === "hit";
  return (
    <div
      className="warning-flash"
      style={{
        position: "fixed",
        inset: 0,
        background: hit
          ? "radial-gradient(circle at center, rgba(255,60,60,0.7), rgba(120,0,0,0.95))"
          : "radial-gradient(circle at center, rgba(120,200,255,0.5), rgba(0,30,60,0.9))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 250,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: "#fff",
          textShadow: hit
            ? "0 0 32px #ff3a3a, 0 0 64px #ff3a3a"
            : "0 0 32px #7eb6ff, 0 0 64px #7eb6ff",
          letterSpacing: 4,
        }}
      >
        {hit ? "💥" : "✨"}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: "#fff",
          marginTop: 12,
          letterSpacing: 2,
        }}
      >
        {props.message}
      </div>
    </div>
  );
}
