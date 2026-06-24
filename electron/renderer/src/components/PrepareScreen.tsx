// 編成画面。
//
// SPEC §8 / §3.4 / §4.2 を踏まえ、以下の構成にする:
//  - 上段: 今日のステージ告知(推奨属性・敵情報)
//  - 中段左: ArUco ライブプレビュー (calibration の前列ラインも一緒に映る)
//  - 中段右: 編成スロット (前列 2 / 後列 2) — 検出位置に基づいて自動で埋まる
//  - 下段: 配置中キャラの紹介パネルを横並びに表示
//  - フッター: 準備OK ボタン (1 体以上配置されていれば押せる)
//
// 物理操作(アクスタを動かす)で前列/後列が決まる前提なので、編成スロットは
// クリックで入れ替える機能は持たない。ArUco の Y 座標 + キャリブレーション
// しきい値が真実(SPEC §3.5 / §4.2)。

import { useMemo } from "react";
import type { ServerEvent } from "../ws";
import type {
  Character,
  CharactersResponse,
  StageResponse,
} from "../types/character";
import { CharacterIntroPanel } from "./CharacterIntroPanel";

type ArucoFrame = Extract<ServerEvent, { type: "aruco_frame" }>;
type Detection = ArucoFrame["detections"][number];

export function PrepareScreen(props: {
  frame: ArucoFrame | null;
  charsData: CharactersResponse;
  stage: StageResponse | null;
  onReady: (formation: { front: number[]; rear: number[] }) => void;
}) {
  const { frame, charsData, stage, onReady } = props;

  // marker_id → Character 索引
  const charsById = useMemo(() => {
    const m = new Map<number, Character>();
    for (const c of charsData.characters) m.set(c.aruco_marker_id, c);
    return m;
  }, [charsData.characters]);

  // Backend は通常 marker_id ごとに 1 件しか送らないが、誤検出やデバウンスの
  // 都合で重複が出る可能性に備え、ここで dedupe する(同じ ID が front/rear に
  // またがって現れたら front を優先 = 直感寄り)。
  const detections = useMemo(() => {
    const seen = new Map<number, ArucoFrame["detections"][number]>();
    for (const d of frame?.detections ?? []) {
      const prev = seen.get(d.marker_id);
      if (!prev || (prev.row === "rear" && d.row === "front")) {
        seen.set(d.marker_id, d);
      }
    }
    return Array.from(seen.values());
  }, [frame?.detections]);

  // 左端 (cx 小) から右端 (cx 大) で安定ソート → 2 枠ずつ取る
  const front = useMemo(
    () =>
      detections.filter((d) => d.row === "front").sort((a, b) => a.cx - b.cx),
    [detections],
  );
  const rear = useMemo(
    () =>
      detections.filter((d) => d.row === "rear").sort((a, b) => a.cx - b.cx),
    [detections],
  );

  const placed = front.length + rear.length;
  const selectedFront = front.slice(0, 2);
  const selectedRear = rear.slice(0, 2);
  const overflow = front.length > 2 || rear.length > 2;

  const handleReady = () => {
    onReady({
      front: selectedFront.map((d) => d.marker_id),
      rear: selectedRear.map((d) => d.marker_id),
    });
  };

  const currentStage = stage?.current ?? null;
  const accent = currentStage?.theme.accent_color ?? "#FFB84D";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ステージ告知 */}
      {currentStage && (
        <header
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: `linear-gradient(90deg, ${accent}33, transparent 70%)`,
            border: `1px solid ${accent}88`,
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.65, letterSpacing: 2 }}>
            今日のステージ
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
            {currentStage.name}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            {currentStage.description}
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              marginTop: 6,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span>
              推奨属性:{" "}
              {currentStage.recommended_attributes
                .map((a) => {
                  const ai = charsData.attributes[a];
                  return ai ? `${ai.icon} ${ai.display}` : a;
                })
                .join(" / ")}
            </span>
            {currentStage.expected_turn_count && (
              <span>想定 {currentStage.expected_turn_count} ターン</span>
            )}
            <span>敵 {currentStage.enemies.length} 体</span>
          </div>
        </header>
      )}

      {/* カメラプレビュー + 編成スロット */}
      <div style={{ display: "flex", gap: 14 }}>
        <section style={{ flex: 1.1, minWidth: 0 }}>
          <CameraPanel frame={frame} />
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>
            アクスタを机に置くと前列/後列が自動で決まる。
            画面の黄色ラインから下が前列、上が後列。
          </p>
        </section>
        <section
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <FormationRow
            title="前列"
            slots={selectedFront}
            charsById={charsById}
            overflowCount={Math.max(0, front.length - 2)}
          />
          <FormationRow
            title="後列"
            slots={selectedRear}
            charsById={charsById}
            overflowCount={Math.max(0, rear.length - 2)}
          />
          <FormationFooter
            placed={placed}
            overflow={overflow}
            onReady={handleReady}
            disabled={placed === 0}
          />
        </section>
      </div>

      {/* キャラ紹介パネル */}
      <section>
        <h3
          style={{
            margin: "8px 0 10px",
            fontSize: 12,
            opacity: 0.65,
            letterSpacing: 2,
          }}
        >
          配置中のキャラクター ({placed} 体)
        </h3>
        {placed === 0 ? (
          <EmptyHint />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 10,
            }}
          >
            {detections.map((d) => {
              const c = charsById.get(d.marker_id);
              if (!c) return null;
              return (
                <CharacterIntroPanel
                  key={d.marker_id}
                  character={c}
                  unit={charsData.units[c.unit]}
                  attribute={charsData.attributes[c.attribute]}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function CameraPanel(props: { frame: ArucoFrame | null }) {
  return (
    <div
      style={{
        background: "#000",
        borderRadius: 10,
        overflow: "hidden",
        aspectRatio: "16 / 9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid #2a2440",
      }}
    >
      {props.frame ? (
        <img
          src={`data:image/jpeg;base64,${props.frame.frame_jpeg_b64}`}
          alt="aruco preview"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <span style={{ opacity: 0.5, fontSize: 13 }}>カメラ映像待機中…</span>
      )}
    </div>
  );
}

function FormationRow(props: {
  title: string;
  slots: Detection[];
  charsById: Map<number, Character>;
  overflowCount: number;
}) {
  const filled: (Detection | null)[] = [
    props.slots[0] ?? null,
    props.slots[1] ?? null,
  ];
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          opacity: 0.7,
          marginBottom: 4,
          letterSpacing: 1,
        }}
      >
        <span>{props.title}</span>
        {props.overflowCount > 0 && (
          <span style={{ color: "#f0a774" }}>
            +{props.overflowCount} 体は超過(左 2 体のみ採用)
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {/* 外側のラッパーは位置で安定キー化(2 スロット固定で stale 防止)、
            内側の filled/empty 要素には character.id ベースの key を付けて
            React の reconciliation に unmount/remount させる。
            これだけで CSS の slot-fill アニメは自動で再生される。 */}
        {[0, 1].map((i) => {
          const d = filled[i] ?? null;
          return (
            <div
              key={i}
              style={{ flex: 1, display: "flex" }}
            >
              <FormationSlot
                key={d ? `c-${d.marker_id}` : "empty"}
                detection={d}
                character={d ? props.charsById.get(d.marker_id) : null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormationSlot(props: {
  detection: Detection | null;
  character: Character | null | undefined;
}) {
  const { detection, character: c } = props;

  if (!c || !detection) {
    return (
      <div
        className="empty-pulse"
        style={{
          flex: 1,
          height: 88,
          borderRadius: 8,
          border: "1px dashed #3a2d6b",
          background: "rgba(255,255,255,0.02)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
        }}
      >
        空きスロット
      </div>
    );
  }
  const accent = c.personal_color;
  return (
    <div
      className="slot-fill"
      style={{
        flex: 1,
        height: 88,
        borderRadius: 8,
        background: `linear-gradient(135deg, ${accent}44, ${accent}11)`,
        border: `1.5px solid ${accent}`,
        color: accent,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 10px",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: accent,
          color: "#0f0f14",
          fontWeight: 800,
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {c.aruco_marker_id}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {c.name}
        </div>
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{c.role}</div>
      </div>
    </div>
  );
}

function FormationFooter(props: {
  placed: number;
  overflow: boolean;
  disabled: boolean;
  onReady: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 4,
        padding: 10,
        borderRadius: 8,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid #2a2440",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.7 }}>
        配置中 {props.placed} 体
        {props.overflow && (
          <span style={{ color: "#f0a774" }}> ・5体目以降は未使用</span>
        )}
      </div>
      <button
        onClick={props.onReady}
        disabled={props.disabled}
        style={{
          padding: "10px 22px",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 2,
          background: props.disabled
            ? "#3a2d6b"
            : "linear-gradient(90deg, #ff7eb6, #7eb6ff)",
          color: props.disabled ? "#888" : "#0f0f14",
          border: "none",
          borderRadius: 8,
          cursor: props.disabled ? "default" : "pointer",
          opacity: props.disabled ? 0.6 : 1,
        }}
      >
        準備 OK
      </button>
    </div>
  );
}

function EmptyHint() {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        background: "rgba(255,255,255,0.02)",
        borderRadius: 10,
        border: "1px dashed #3a2d6b",
        opacity: 0.55,
        fontSize: 13,
      }}
    >
      アクスタを机に置くと、ここにキャラ紹介パネルが並びます
      <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
        マーカー ID 0〜6 がそれぞれのキャラに対応
      </div>
    </div>
  );
}
