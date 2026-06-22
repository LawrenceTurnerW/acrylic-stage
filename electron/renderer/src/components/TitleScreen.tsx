export function TitleScreen(props: { onStart: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 100px)",
        gap: 32,
      }}
    >
      <h1
        style={{
          fontSize: 64,
          margin: 0,
          background: "linear-gradient(90deg, #ffd86b, #ff7eb6, #7eb6ff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: 4,
        }}
      >
        Acrylic Stage
      </h1>
      <p style={{ opacity: 0.7, margin: 0, fontSize: 14 }}>
        机に置いたアクスタが、魔法アイドルとしてライブに出撃する
      </p>
      <button
        onClick={props.onStart}
        style={{
          padding: "16px 40px",
          fontSize: 20,
          background: "linear-gradient(90deg, #ff7eb6, #7eb6ff)",
          color: "#0f0f14",
          border: "none",
          borderRadius: 12,
          cursor: "pointer",
          fontWeight: "bold",
          letterSpacing: 2,
        }}
      >
        ライブ開始
      </button>
      <p style={{ opacity: 0.5, margin: 0, fontSize: 11 }}>
        編成画面でアクスタを並べてください
      </p>
    </div>
  );
}
