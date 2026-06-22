import { useEffect, useMemo, useRef, useState } from "react";
import { TitleScreen } from "./components/TitleScreen";
import { BattleScreen } from "./components/BattleScreen";
import { CalibrationScreen } from "./components/CalibrationScreen";
import { PrepareScreen } from "./components/PrepareScreen";
import { StageIntroOverlay } from "./components/StageIntroOverlay";
import { useGameData } from "./hooks/useGameData";
import { connectLiveWS, type ServerEvent, type WSStatus } from "./ws";

type Screen = "title" | "calibration" | "prepare" | "battle";

const API_BASE = "http://127.0.0.1:8000";

export type Formation = { front: number[]; rear: number[] };

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [status, setStatus] = useState<WSStatus>("connecting");
  const [lastHeartbeat, setLastHeartbeat] = useState<ServerEvent | null>(null);
  const [latestFrame, setLatestFrame] = useState<Extract<
    ServerEvent,
    { type: "aruco_frame" }
  > | null>(null);
  const [formation, setFormation] = useState<Formation>({ front: [], rear: [] });
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<string[]>([]);
  // ステージ告知オーバーレイは初回 prepare 入場時に 1 度だけ出す
  const [stageIntroShown, setStageIntroShown] = useState(false);
  const [showingStageIntro, setShowingStageIntro] = useState(false);

  const gameData = useGameData();

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

  const goToPrepare = () => {
    setScreen("prepare");
    if (!stageIntroShown && gameData.stage?.current) {
      setShowingStageIntro(true);
      setStageIntroShown(true);
    }
  };

  const handleReady = async (f: Formation) => {
    setFormation(f);
    try {
      await fetch(`${API_BASE}/start_battle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
    } catch (e) {
      appendLog(`start_battle failed: ${e}`);
    }
    setScreen("battle");
  };

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
        <span style={{ opacity: 0.6, fontSize: 12 }}>v0.2.0 (day-3)</span>
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
        <nav style={{ display: "flex", gap: 6 }}>
          <NavBtn active={screen === "title"} onClick={() => setScreen("title")}>
            タイトル
          </NavBtn>
          <NavBtn
            active={screen === "calibration"}
            onClick={() => setScreen("calibration")}
          >
            キャリブレーション
          </NavBtn>
          <NavBtn active={screen === "prepare"} onClick={goToPrepare}>
            編成
          </NavBtn>
          <NavBtn
            active={screen === "battle"}
            onClick={() => setScreen("battle")}
          >
            戦闘
          </NavBtn>
        </nav>
      </header>
    ),
    [status, lastHeartbeat, screen],
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {header}
      <main style={{ flex: 1, padding: 20 }}>
        {screen === "title" && <TitleScreen onStart={goToPrepare} />}
        {screen === "calibration" && <CalibrationScreen frame={latestFrame} />}
        {screen === "prepare" &&
          (gameData.characters ? (
            <PrepareScreen
              frame={latestFrame}
              charsData={gameData.characters}
              stage={gameData.stage}
              onReady={handleReady}
            />
          ) : (
            <LoadingPanel error={gameData.error} />
          ))}
        {screen === "battle" && (
          <BattleScreen
            heartbeat={lastHeartbeat}
            log={log}
            formation={formation}
            charsData={gameData.characters}
            onReturnToPrepare={() => setScreen("prepare")}
          />
        )}
      </main>
      {showingStageIntro && gameData.stage?.current && (
        <StageIntroOverlay
          stage={gameData.stage.current}
          onDone={() => setShowingStageIntro(false)}
        />
      )}
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

function LoadingPanel(props: { error: string | null }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        opacity: 0.7,
        fontSize: 14,
      }}
    >
      {props.error ? (
        <>
          <div style={{ color: "#ff7b72" }}>データ取得失敗</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>{props.error}</div>
        </>
      ) : (
        "キャラデータ取得中…"
      )}
    </div>
  );
}
