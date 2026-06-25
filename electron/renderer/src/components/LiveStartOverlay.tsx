// 編成 → 戦闘の遷移時に被せる短いオーバーレイ。
// 画面が瞬間で切り替わるとボタン押下のフィードバックが弱いので、
// 「LIVE START」を 1.6 秒だけ被せて場面転換を演出する。
//
// アニメ本体は styles.css の .live-start-overlay / .live-start-text に定義。
// 親で onDone のタイミングでアンマウントする。

import { useEffect } from "react";

const DURATION_MS = 1600;

export function LiveStartOverlay(props: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(props.onDone, DURATION_MS);
    return () => window.clearTimeout(t);
  }, [props.onDone]);

  return (
    <div className="live-start-overlay">
      <div className="live-start-text">
        <div className="live-start-sub">NOW ON STAGE</div>
        <div className="live-start-main">LIVE&nbsp;START</div>
      </div>
    </div>
  );
}
