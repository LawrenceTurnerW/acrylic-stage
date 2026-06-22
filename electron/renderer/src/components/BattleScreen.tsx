import type { ServerEvent } from "../ws";

export function BattleScreen(props: {
  heartbeat: ServerEvent | null;
  log: string[];
}) {
  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 130px)" }}>
      <section
        style={{
          flex: 2,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 12,
          padding: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, opacity: 0.5, fontSize: 18 }}>
          戦闘画面(Day 1-2 ではプレースホルダ)
        </h2>
        <p style={{ opacity: 0.6, margin: 0, fontSize: 13 }}>
          バックエンドの heartbeat を WebSocket で受信できているか確認するだけの画面
        </p>
        {props.heartbeat && props.heartbeat.type === "heartbeat" && (
          <div
            style={{
              marginTop: 24,
              fontFamily: "monospace",
              fontSize: 14,
              padding: 16,
              background: "#0c0c12",
              borderRadius: 8,
              border: "1px solid #2a2440",
              minWidth: 280,
            }}
          >
            <div>seq: {props.heartbeat.seq}</div>
            <div>phase: {props.heartbeat.phase}</div>
            <div>ts: {new Date(props.heartbeat.ts * 1000).toLocaleTimeString()}</div>
          </div>
        )}
      </section>
      <aside
        style={{
          flex: 1,
          background: "#0c0c12",
          borderRadius: 12,
          padding: 16,
          border: "1px solid #2a2440",
          overflow: "auto",
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.7 }}>
          イベントログ
        </h3>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.6,
          }}
        >
          {props.log.slice(-50).map((line, i) => (
            <li key={i} style={{ opacity: 0.8 }}>
              {line}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
