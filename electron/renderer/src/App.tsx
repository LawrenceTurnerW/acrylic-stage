import { useEffect, useRef, useState } from "react";
import { TitleScreen } from "./components/TitleScreen";
import { BattleScreen } from "./components/BattleScreen";
import { CalibrationScreen } from "./components/CalibrationScreen";
import { PrepareScreen } from "./components/PrepareScreen";
import { ItemDropFlash } from "./components/ItemDropFlash";
import { StageIntroOverlay } from "./components/StageIntroOverlay";
import {
  UltimateFlash,
  type UltimateFlashPayload,
} from "./components/UltimateFlash";
import { WarningBanner, WarningFlash } from "./components/WarningOverlay";
import { useGameData } from "./hooks/useGameData";
import { rollDrop, useInventory } from "./hooks/useInventory";
import type { ItemInstance } from "./types/items";
import {
  connectLiveWS,
  type BattleStateSnapshot,
  type ServerEvent,
  type WSStatus,
} from "./ws";

type Screen = "title" | "calibration" | "prepare" | "battle";

const API_BASE = "http://127.0.0.1:8000";

export type Formation = { front: number[]; rear: number[] };

// 図鑑エントリ: 戦闘終了ごとに localStorage に積み上げてタイトル画面で履歴表示
export type DexiconEntry = {
  date: string;
  result: "win" | "lose";
  turn: number;
  mvp_id: string | null;
  stage_id: string;
};
const DEXICON_KEY = "acrylic-stage:dexicon";

export function loadDexicon(): DexiconEntry[] {
  try {
    return JSON.parse(
      window.localStorage.getItem(DEXICON_KEY) ?? "[]",
    ) as DexiconEntry[];
  } catch {
    return [];
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [status, setStatus] = useState<WSStatus>("connecting");
  const [lastHeartbeat, setLastHeartbeat] = useState<ServerEvent | null>(null);
  const [latestFrame, setLatestFrame] = useState<Extract<
    ServerEvent,
    { type: "aruco_frame" }
  > | null>(null);
  const [formation, setFormation] = useState<Formation>({ front: [], rear: [] });
  const [battleState, setBattleState] = useState<BattleStateSnapshot | null>(
    null,
  );
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<string[]>([]);
  // ステージ告知オーバーレイは初回 prepare 入場時に 1 度だけ出す。
  // 「見せたか」は useRef にしておけば再 render を誘発しない。
  const stageIntroShownRef = useRef(false);
  const [showingStageIntro, setShowingStageIntro] = useState(false);
  // 必殺技フラッシュは battle_action を受けた瞬間にキューに積み、表示が
  // 終わったら次へ進める(連続発動でも見落とさないように)
  const [ultimateQueue, setUltimateQueue] = useState<UltimateFlashPayload[]>(
    [],
  );
  // 進行中の警告攻撃 (1 件想定 / SPEC §4.6 duplicate_prevention)
  const [warning, setWarning] = useState<{
    variant_name: string;
    target_row: "front" | "rear";
    turns_left: number;
  } | null>(null);
  // 警告爆発のフルスクリーン演出(hit / safe を 900ms 表示)
  const [warningFlash, setWarningFlash] = useState<{
    kind: "hit" | "safe";
    message: string;
    variant_name: string;
    target_row: "front" | "rear";
  } | null>(null);
  // 戦闘終了情報(MVP 表示と「もう一度」ボタンで使う)
  const [battleEnd, setBattleEnd] = useState<{
    result: "win" | "lose";
    mvp_id: string | null;
    turn: number;
  } | null>(null);
  // 勝利時にドロップしたアイテムを 1 件保持して flash 表示
  const [dropItem, setDropItem] = useState<ItemInstance | null>(null);

  const gameData = useGameData();
  const inv = useInventory();
  // inv も WS クロージャから常に最新を参照したいので ref で併走
  const invRef = useRef(inv);
  useEffect(() => {
    invRef.current = inv;
  }, [inv]);
  // gameData は WS のクロージャから常に最新を参照したいので ref を併走させる
  const gameDataRef = useRef(gameData);
  useEffect(() => {
    gameDataRef.current = gameData;
  }, [gameData]);

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
            appendLog(`▶ battle_start front=${e.front} rear=${e.rear}`);
            break;
          case "battle_state": {
            const { turn, finished, result, allies, enemies } = e;
            setBattleState({ turn, finished, result, allies, enemies });
            break;
          }
          case "battle_action": {
            if (e.message) appendLog(`T${("turn" in e ? e.turn : "?")}: ${e.message}`);
            // 警告攻撃の状態管理
            if (e.kind === "warning_announce") {
              setWarning({
                variant_name: e.variant_name,
                target_row: e.target_row,
                turns_left: e.turns_left,
              });
            } else if (e.kind === "warning_countdown") {
              setWarning({
                variant_name: e.variant_name,
                target_row: e.target_row,
                turns_left: e.turns_left,
              });
            } else if (e.kind === "warning_fire") {
              setWarning(null);
              setWarningFlash({
                kind: "hit",
                message: e.message,
                variant_name: e.variant_name,
                target_row: e.target_row,
              });
            } else if (e.kind === "warning_safe") {
              setWarning(null);
              setWarningFlash({
                kind: "safe",
                message: e.message,
                variant_name: e.variant_name,
                target_row: e.target_row,
              });
            }
            // 必殺技なら派手なフラッシュ用にキューに積む
            if (e.kind === "ultimate") {
              const charsData = gameDataRef.current.characters;
              const char = charsData?.characters.find(
                (c) => c.id === e.actor_id,
              );
              const accent = char?.personal_color ?? "#7eb6ff";
              const attrColor =
                char && charsData
                  ? charsData.attributes[char.attribute]?.color ?? accent
                  : accent;
              setUltimateQueue((q) => [
                ...q,
                {
                  actor_name: e.actor_name,
                  ultimate_name: e.ultimate_name,
                  ultimate_type: e.ultimate_type,
                  accent_color: accent,
                  attribute_color: attrColor,
                  message: e.message,
                },
              ]);
            }
            break;
          }
          case "battle_end": {
            appendLog(
              `■ battle_end result=${e.result}${e.mvp_id ? ` MVP=${e.mvp_id}` : ""}`,
            );
            if (e.result) {
              setBattleEnd({
                result: e.result,
                mvp_id: e.mvp_id,
                turn: e.turn,
              });
              // 図鑑に記録(localStorage)
              try {
                const prev = loadDexicon();
                const entry: DexiconEntry = {
                  date: new Date().toISOString(),
                  result: e.result,
                  turn: e.turn,
                  mvp_id: e.mvp_id,
                  stage_id:
                    gameDataRef.current.stage?.current?.id ?? "stage_1",
                };
                window.localStorage.setItem(
                  DEXICON_KEY,
                  JSON.stringify([entry, ...prev].slice(0, 50)),
                );
              } catch (err) {
                console.warn("dexicon save failed", err);
              }
              // 勝利時はアクセサリーをドロップ
              if (e.result === "win" && gameDataRef.current.items) {
                const dropCount =
                  gameDataRef.current.items.drop_on_win ?? 1;
                for (let i = 0; i < dropCount; i++) {
                  const item = rollDrop(gameDataRef.current.items);
                  if (item) {
                    invRef.current.addItem(item);
                    if (i === 0) setDropItem(item);
                  }
                }
              }
            }
            break;
          }
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
    if (!stageIntroShownRef.current && gameData.stage?.current) {
      stageIntroShownRef.current = true;
      setShowingStageIntro(true);
    }
  };

  const handleReady = async (f: Formation) => {
    setFormation(f);
    setBattleState(null); // 前回の戦闘 state をクリア
    setBattleEnd(null);
    setWarning(null);
    setWarningFlash(null);
    setUltimateQueue([]);
    setDropItem(null);
    const equipment = inv.buildEquipmentPayload();
    try {
      const res = await fetch(`${API_BASE}/start_battle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, equipment: equipment ?? {} }),
      });
      if (!res.ok) {
        appendLog(`start_battle returned ${res.status}; staying on prepare`);
        return;
      }
    } catch (e) {
      appendLog(`start_battle failed: ${e}; staying on prepare`);
      return;
    }
    setScreen("battle");
  };

  // header は毎レンダー生成。useMemo 化していたが deps が gameData / refs を
  // 拾えず、初期レンダーの goToPrepare クロージャを抱え込んでナビ「編成」から
  // ステージ告知が出ないバグになっていたので memo を外した。
  // 中身は軽量(div + nav button 数個) なので render コストは無視できる。
  const header = (
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
              itemsCatalog={gameData.items}
              inventory={inv.inventory}
              equipment={inv.equipment}
              onEquip={inv.equip}
              onUnequip={inv.unequip}
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
            battleState={battleState}
            battleEnd={battleEnd}
            charsData={gameData.characters}
            onReturnToPrepare={async () => {
              try {
                await fetch(`${API_BASE}/reset`, { method: "POST" });
              } catch (e) {
                appendLog(`/reset failed: ${e}`);
              }
              setScreen("prepare");
            }}
          />
        )}
      </main>
      {showingStageIntro && gameData.stage?.current && (
        <StageIntroOverlay
          stage={gameData.stage.current}
          onDone={() => setShowingStageIntro(false)}
        />
      )}
      {ultimateQueue.length > 0 && (
        <UltimateFlash
          payload={ultimateQueue[0]}
          onDone={() => setUltimateQueue((q) => q.slice(1))}
        />
      )}
      {warning && screen === "battle" && (
        <WarningBanner
          variant_name={warning.variant_name}
          target_row={warning.target_row}
          turns_left={warning.turns_left}
        />
      )}
      {warningFlash && screen === "battle" && (
        <WarningFlash
          kind={warningFlash.kind}
          message={warningFlash.message}
          variant_name={warningFlash.variant_name}
          onDone={() => setWarningFlash(null)}
        />
      )}
      {dropItem && gameData.items && (
        <ItemDropFlash
          item={dropItem}
          def={gameData.items.items[dropItem.kind]}
          onDone={() => setDropItem(null)}
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
