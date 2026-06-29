// ターン開始時に画面中央へ流れる「Turn N」バナー。
// バックエンドの pre_turn_pause_sec (2.0s) と並走させて、考える間の演出を作る。
// seq を key にして同じターン番号でも再マウントすればアニメが再生される。

import { useEffect, useRef } from "react";

export type TurnBannerPayload = { turn: number; seq: number };

export function TurnBanner(props: {
  payload: TurnBannerPayload | null;
  onDone: () => void;
}) {
  const lastSeqRef = useRef<number | null>(null);
  useEffect(() => {
    if (!props.payload) return;
    // 同じ seq なら何もしない (React.StrictMode の二重実行ガード)
    if (lastSeqRef.current === props.payload.seq) return;
    lastSeqRef.current = props.payload.seq;
    const id = window.setTimeout(props.onDone, 1700);
    return () => window.clearTimeout(id);
  }, [props.payload, props.onDone]);
  if (!props.payload) return null;
  return (
    <div
      key={props.payload.seq}
      className="turn-banner"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      <div className="turn-banner-inner">
        <div className="turn-banner-label">TURN</div>
        <div className="turn-banner-number">{props.payload.turn}</div>
      </div>
    </div>
  );
}
