// Day 3 までの BattleScreen はバトル開始時の formation 確認用のプレースホルダ。
// 自動進行ロジック・声援ゲージ・必殺技演出は Day 4 以降で実装する。
//
// ここでは:
//  - 確定した編成(前列 / 後列)を視覚的に確認
//  - 全味方カードに HP/声援 のメーター(初期値) を出して UI のスケルトンを作る
//  - イベントログでバックエンドからの broadcast を確認
//
// すべて Day 4 で本物のデータに差し替える前提のスタブ。

import { useMemo } from "react";
import type { ServerEvent } from "../ws";
import type {
  Character,
  CharactersResponse,
  RowId,
} from "../types/character";

type Formation = { front: number[]; rear: number[] };

export function BattleScreen(props: {
  heartbeat: ServerEvent | null;
  log: string[];
  formation: Formation;
  charsData: CharactersResponse | null;
  onReturnToPrepare: () => void;
}) {
  const { heartbeat, log, formation, charsData, onReturnToPrepare } = props;

  const charsById = useMemo(() => {
    const m = new Map<number, Character>();
    if (charsData) {
      for (const c of charsData.characters) m.set(c.aruco_marker_id, c);
    }
    return m;
  }, [charsData]);

  const isEmpty = formation.front.length === 0 && formation.rear.length === 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr",
        gap: 14,
        height: "calc(100vh - 100px)",
      }}
    >
      {/* 戦場 */}
      <section
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid #2a2440",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, letterSpacing: 2 }}>
            戦闘エリア
          </h2>
          <span style={{ fontSize: 11, opacity: 0.55 }}>
            Day 3: 編成確認のみ (戦闘ロジックは Day 4 で実装)
          </span>
        </div>

        {isEmpty ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              opacity: 0.6,
              fontSize: 13,
            }}
          >
            編成が空です。タイトル → 編成画面で配置してください。
            <div style={{ marginTop: 10 }}>
              <button
                onClick={onReturnToPrepare}
                style={{
                  background: "#3a2d6b",
                  color: "inherit",
                  border: "1px solid #5a4d8b",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                編成画面へ戻る
              </button>
            </div>
          </div>
        ) : (
          <>
            <EnemyArea />
            <FormationVisual
              formation={formation}
              charsById={charsById}
              row="front"
            />
            <FormationVisual
              formation={formation}
              charsById={charsById}
              row="rear"
            />
          </>
        )}
      </section>

      {/* 戦闘ログ + heartbeat */}
      <aside
        style={{
          background: "#0c0c12",
          border: "1px solid #2a2440",
          borderRadius: 12,
          padding: 14,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
            戦闘ログ(プレースホルダ)
          </h3>
          <p style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
            Day 4 以降、ターンごとの実況テキストがここに流れる
          </p>
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.6,
            opacity: 0.75,
            maxHeight: 220,
            overflow: "auto",
          }}
        >
          {log.slice(-40).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        {heartbeat && heartbeat.type === "heartbeat" && (
          <div
            style={{
              padding: 10,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            <div style={{ opacity: 0.6 }}>backend heartbeat</div>
            <div>seq: {heartbeat.seq}</div>
            <div>phase: {heartbeat.phase}</div>
          </div>
        )}
      </aside>
    </div>
  );
}

function EnemyArea() {
  // SPEC §6 ステージ1: サマースライム ×3 + ヒートゴーレム。
  // Day 3 ではアイコンとプレースホルダ HP のみ。
  const enemies = [
    { id: "slime_a", name: "サマースライム", icon: "🟢", hp: 30 },
    { id: "slime_b", name: "サマースライム", icon: "🟢", hp: 30 },
    { id: "slime_c", name: "サマースライム", icon: "🟢", hp: 30 },
    { id: "boss", name: "ヒートゴーレム", icon: "🟠", hp: 120, boss: true },
  ];
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          opacity: 0.55,
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        敵エリア
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {enemies.map((e) => (
          <div
            key={e.id}
            style={{
              flex: e.boss ? 1.4 : 1,
              padding: 10,
              borderRadius: 8,
              background: e.boss
                ? "linear-gradient(135deg, #f0a77433, #f0a77410)"
                : "rgba(255,255,255,0.04)",
              border: e.boss ? "1.5px solid #f0a774" : "1px solid #2a2440",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22 }}>{e.icon}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>{e.name}</div>
            <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>
              HP {e.hp}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormationVisual(props: {
  formation: Formation;
  charsById: Map<number, Character>;
  row: RowId;
}) {
  const ids = props.row === "front" ? props.formation.front : props.formation.rear;
  const slots: (number | null)[] = [ids[0] ?? null, ids[1] ?? null];

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          opacity: 0.55,
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {props.row === "front" ? "前列(被弾↑ / 火力↑)" : "後列(被弾↓)"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {slots.map((id, i) => (
          <AllyCard
            key={i}
            character={id != null ? props.charsById.get(id) : null}
          />
        ))}
      </div>
    </div>
  );
}

function AllyCard(props: { character: Character | null | undefined }) {
  const c = props.character;
  if (!c) {
    return (
      <div
        style={{
          flex: 1,
          height: 110,
          borderRadius: 8,
          border: "1px dashed #3a2d6b",
          background: "rgba(255,255,255,0.02)",
          opacity: 0.4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
        }}
      >
        空きスロット
      </div>
    );
  }
  const accent = c.personal_color;
  return (
    <div
      style={{
        flex: 1,
        height: 110,
        padding: 10,
        borderRadius: 8,
        background: `linear-gradient(135deg, ${accent}33, ${accent}05)`,
        border: `1.5px solid ${accent}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: accent,
            color: "#0f0f14",
            fontWeight: 800,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {c.aruco_marker_id}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {c.name}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            {c.role}
            {c.condition?.icon ? ` ${c.condition.icon}` : ""}
          </div>
        </div>
      </div>
      <Meter label="HP" value={100} max={100} color="#ff7b72" />
      <Meter label="声援" value={0} max={100} color={accent} />
    </div>
  );
}

function Meter(props: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(1, props.value / props.max));
  return (
    <div style={{ fontSize: 9, lineHeight: 1.2 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          opacity: 0.7,
        }}
      >
        <span>{props.label}</span>
        <span>
          {props.value}/{props.max}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 2,
          overflow: "hidden",
          marginTop: 2,
        }}
      >
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: props.color,
          }}
        />
      </div>
    </div>
  );
}
