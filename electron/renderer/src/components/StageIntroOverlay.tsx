// ステージに入った瞬間に被せる「今日のステージ」オーバーレイ。
// SPEC §8 では 3 秒のステージ告知 → コンディション発表 と分かれているが、
// Day 3 では一緒くたに 2.4 秒で出して消す簡易版にしている。
//
// CSS keyframes (styles.css の .stage-intro) で fade in/out するだけ。
// 親側で `showingStageIntro && <StageIntroOverlay ...>` でマウント制御するので
// このコンポーネント自体は visible state を持たず、onDone でアンマウントされる。

import { useEffect } from "react";
import type { Stage } from "../types/character";

const DURATION_MS = 2400;

export function StageIntroOverlay(props: { stage: Stage; onDone: () => void }) {
  const { stage, onDone } = props;

  useEffect(() => {
    const t = window.setTimeout(onDone, DURATION_MS);
    return () => window.clearTimeout(t);
  }, [onDone]);

  const accent = stage.theme.accent_color ?? "#FFB84D";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(circle at center, rgba(0,0,0,0.7), rgba(0,0,0,0.95))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        pointerEvents: "none",
      }}
      className="stage-intro"
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 14,
            opacity: 0.6,
            letterSpacing: 6,
            marginBottom: 16,
          }}
        >
          TODAY'S STAGE
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            letterSpacing: 2,
            background: `linear-gradient(90deg, ${accent}, #fff, ${accent})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            padding: "0 40px",
          }}
        >
          {stage.name}
        </div>
        <div style={{ fontSize: 14, opacity: 0.7, marginTop: 16 }}>
          {stage.description}
        </div>
      </div>
    </div>
  );
}
