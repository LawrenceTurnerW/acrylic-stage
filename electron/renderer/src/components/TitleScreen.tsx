import { loadDexicon } from "../App";

export function TitleScreen(props: { onStart: () => void }) {
  const dex = loadDexicon();
  const recent = dex.slice(0, 5);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 100px)",
        gap: 24,
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

      {recent.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 12,
            border: "1px solid #2a2440",
            minWidth: 320,
          }}
        >
          <div
            style={{
              fontSize: 11,
              opacity: 0.6,
              letterSpacing: 3,
              marginBottom: 8,
            }}
          >
            最近のライブ ({dex.length} 戦)
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {recent.map((e, i) => {
              const d = new Date(e.date);
              const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(
                d.getHours(),
              ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              return (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "4px 8px",
                    borderRadius: 4,
                    background:
                      e.result === "win"
                        ? "rgba(126,231,135,0.08)"
                        : "rgba(255,123,114,0.08)",
                  }}
                >
                  <span style={{ opacity: 0.6 }}>{dateStr}</span>
                  <span
                    style={{
                      color: e.result === "win" ? "#7ee787" : "#ff7b72",
                      fontWeight: 700,
                    }}
                  >
                    {e.result === "win" ? "勝利" : "敗北"}
                  </span>
                  <span style={{ opacity: 0.7 }}>{e.turn}T</span>
                  {e.mvp_id && (
                    <span style={{ opacity: 0.7 }}>MVP: {e.mvp_id}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
