import { useEffect, useMemo, useRef, useState } from "react";
import { TitleScreen } from "./components/TitleScreen";
import { BattleScreen } from "./components/BattleScreen";
import { CalibrationScreen } from "./components/CalibrationScreen";
import { connectLiveWS, type ServerEvent, type WSStatus } from "./ws";

type Screen = "title" | "calibration" | "battle";

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [status, setStatus] = useState<WSStatus>("connecting");
  const [lastHeartbeat, setLastHeartbeat] = useState<ServerEvent | null>(null);
  const [latestFrame, setLatestFrame] = useState<Extract<
    ServerEvent,
    { type: "aruco_frame" }
  > | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<string[]>([]);

  const appendLog = (line: string) => {
    logRef.current = [
      ...logRef.current.slice(-200),
      `[${new Date().toLocaleTimeString()}] ${line}`,
    ];
    setLog(logRef.current);
  };

  useEffect(() => {
    const close = connectLiveWS({
      onStatus: (s) => {
        setStatus(s);
        appendLog(`ws: ${s}`);
      },
      onEvent: (e) => {
        switch (e.type) {
          case "heartbeat":
            setLastHeartbeat(e);
            break;
          case "aruco_frame":
            setLatestFrame(e);
            break;
          case "battle_start":
            appendLog(`battle_start front=${e.front} rear=${e.rear}`);
            break;
          case "camera_error":
            appendLog(`camera_error: ${e.message}`);
            break;
        }
      },
    });
    return close;
  }, []);

  const header = useMemo(
    () => (
      <header
        style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          borderBottom: "1px solid #2a2440",
          background: "#0c0c12",
        }}
      >
        <strong style={{ letterSpacing: 1 }}>Acrylic Stage</strong>
        <span style={{ opacity: 0.6, fontSize: 12 }}>v0.1.0 (skeleton)</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color:
              status === "open"
                ? "#7ee787"
                : status === "connecting"
                  ? "#f0d774"
                  : "#ff7b72",
          }}
        >
          WS: {status}
          {lastHeartbeat && lastHeartbeat.type === "heartbeat"
            ? ` (seq=${lastHeartbeat.seq})`
            : ""}
        </span>
        <nav style={{ display: "flex", gap: 8 }}>
          <NavBtn active={screen === "title"} onClick={() => setScreen("title")}>
            タイトル
          </NavBtn>
          <NavBtn
            active={screen === "calibration"}
            onClick={() => setScreen("calibration")}
          >
            キャリブレーション
          </NavBtn>
          <NavBtn
            active={screen === "battle"}
            onClick={() => setScreen("battle")}
          >
            戦闘(空)
          </NavBtn>
        </nav>
      </header>
    ),
    [status, lastHeartbeat, screen],
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {header}
      <main style={{ flex: 1, padding: 24 }}>
        {screen === "title" && (
          <TitleScreen onStart={() => setScreen("battle")} />
        )}
        {screen === "calibration" && <CalibrationScreen frame={latestFrame} />}
        {screen === "battle" && (
          <BattleScreen heartbeat={lastHeartbeat} log={log} />
        )}
      </main>
    </div>
  );
}

function NavBtn(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      style={{
        background: props.active ? "#3a2d6b" : "transparent",
        color: "inherit",
        border: "1px solid #3a2d6b",
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {props.children}
    </button>
  );
}
