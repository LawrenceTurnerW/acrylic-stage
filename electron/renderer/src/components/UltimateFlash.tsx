// 必殺技発動時のフルスクリーンフラッシュ(SPEC §10)。
//
// 親側 (App or BattleScreen) で battle_action.kind === "ultimate" を検知して
// このオーバーレイを 1.2 秒だけマウントする。属性カラーで派手に。
//
// useEffect で setTimeout して props.onDone() で自動アンマウント。

import { useEffect } from "react";

const DURATION_MS = 1200;

export type UltimateFlashPayload = {
  actor_name: string;
  ultimate_name: string;
  ultimate_type: string;
  accent_color: string; // 個人カラー
  attribute_color: string; // 属性カラー
  message: string; // 実況テキスト
};

export function UltimateFlash(props: {
  payload: UltimateFlashPayload;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(props.onDone, DURATION_MS);
    return () => window.clearTimeout(t);
  }, [props.onDone]);

  const { payload } = props;

  return (
    <div
      className="ultimate-flash"
      style={{
        position: "fixed",
        inset: 0,
        background: `radial-gradient(circle at center, ${payload.attribute_color}88 0%, ${payload.attribute_color}33 35%, rgba(0,0,0,0.85) 80%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: 8,
          opacity: 0.7,
          marginBottom: 8,
        }}
      >
        ULTIMATE / {payload.ultimate_type}
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 900,
          letterSpacing: 4,
          background: `linear-gradient(90deg, ${payload.accent_color}, #fff, ${payload.attribute_color})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          padding: "0 24px",
          textShadow: `0 0 24px ${payload.attribute_color}`,
        }}
      >
        {payload.ultimate_name}
      </div>
      <div
        style={{
          fontSize: 16,
          marginTop: 18,
          color: "#fff",
          opacity: 0.9,
          maxWidth: "70vw",
          textAlign: "center",
        }}
      >
        {payload.message}
      </div>
      <div
        style={{
          fontSize: 12,
          marginTop: 8,
          opacity: 0.6,
        }}
      >
        — {payload.actor_name} —
      </div>
    </div>
  );
}
