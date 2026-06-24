// 戦闘画面 (Day 4 以降)。
//
// バックエンドの BattleEngine が真実を持ち、battle_state 経由で全アクターの
// スナップショットを 5fps + ターン毎に送ってくる。ここはその描画だけ。
//
// SPEC §9 のレイアウト要件:
//  - 敵エリア(上)
//  - 戦闘ログ(右ペイン)
//  - 味方カード: 前列/後列 各2枠、HP / 声援ゲージ、ユニット + 属性表記、
//    コンディションアイコン、必殺技 ready ハイライト
//  - ピンチ警告 (HP 20% 以下) は赤点滅
//  - 必殺技発動可能 (声援 max) は派手にハイライト

import type {
  BattleStateSnapshot,
  Combatant,
  ServerEvent,
} from "../ws";
import type {
  Attribute,
  CharactersResponse,
  RowId,
  Unit,
} from "../types/character";

type Formation = { front: number[]; rear: number[] };

export function BattleScreen(props: {
  heartbeat: ServerEvent | null;
  log: string[];
  formation: Formation;
  battleState: BattleStateSnapshot | null;
  charsData: CharactersResponse | null;
  onReturnToPrepare: () => void;
}) {
  const {
    heartbeat,
    log,
    formation,
    battleState,
    charsData,
    onReturnToPrepare,
  } = props;

  // 描画用に String キーで引きやすい辞書に。useGameData が来てなくても空 {} で動く。
  const attrs: Record<string, Attribute> = charsData?.attributes ?? {};
  const units: Record<string, Unit> = charsData?.units ?? {};

  // battle_state がまだ届いていない時は formation だけで仮表示する
  // (start_battle → 最初の broadcast まで一瞬の窓)
  const allies = battleState?.allies ?? [];
  const enemies = battleState?.enemies ?? [];

  const isEmpty =
    !battleState &&
    formation.front.length === 0 &&
    formation.rear.length === 0;

  const finished = battleState?.finished ?? false;
  const result = battleState?.result ?? null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr",
        gap: 14,
        height: "calc(100vh - 100px)",
      }}
    >
      <section
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid #2a2440",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflow: "auto",
        }}
      >
        <header
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
            {battleState
              ? `Turn ${battleState.turn}${finished ? " ・FIN" : ""}`
              : "待機中"}
          </span>
          <button
            onClick={onReturnToPrepare}
            style={{
              background: "transparent",
              color: "inherit",
              border: "1px solid #3a2d6b",
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            編成画面へ戻る
          </button>
        </header>

        {isEmpty ? (
          <EmptyHint />
        ) : (
          <>
            <EnemyArea enemies={enemies} />
            <FormationVisual
              row="front"
              allies={allies.filter((a) => a.row === "front")}
              attrs={attrs}
              units={units}
            />
            <FormationVisual
              row="rear"
              allies={allies.filter((a) => a.row === "rear")}
              attrs={attrs}
              units={units}
            />
          </>
        )}

        {finished && (
          <ResultBanner result={result} mvpId={null} allies={allies} />
        )}
      </section>

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
          <h3 style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>戦闘ログ</h3>
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            fontSize: 12,
            lineHeight: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {log.slice(-80).map((line, i) => (
            <li
              key={i}
              style={{
                opacity: 0.85,
                paddingLeft: 6,
                borderLeft: "2px solid #3a2d6b",
              }}
            >
              {line}
            </li>
          ))}
        </ul>
        {heartbeat && heartbeat.type === "heartbeat" && (
          <div
            style={{
              padding: 8,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 6,
              fontFamily: "monospace",
              fontSize: 10,
              opacity: 0.7,
              marginTop: "auto",
            }}
          >
            heartbeat seq={heartbeat.seq} phase={heartbeat.phase}
          </div>
        )}
      </aside>
    </div>
  );
}

function EnemyArea(props: { enemies: Combatant[] }) {
  if (props.enemies.length === 0) {
    return (
      <div style={{ fontSize: 11, opacity: 0.5 }}>(敵情報待機中…)</div>
    );
  }
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {props.enemies.map((e) => (
          <EnemyCard key={e.id} enemy={e} />
        ))}
      </div>
    </div>
  );
}

function EnemyCard(props: { enemy: Combatant }) {
  const e = props.enemy;
  return (
    <div
      style={{
        flex: e.is_boss ? "2 1 0" : "1 1 0",
        minWidth: 110,
        padding: 10,
        borderRadius: 8,
        background: e.is_boss
          ? "linear-gradient(135deg, #f0a77433, #f0a77410)"
          : "rgba(255,255,255,0.04)",
        border: e.is_boss ? "1.5px solid #f0a774" : "1px solid #2a2440",
        textAlign: "center",
        opacity: e.downed ? 0.35 : 1,
        filter: e.downed ? "grayscale(0.8)" : "none",
        transition: "opacity 220ms, filter 220ms",
      }}
    >
      <div style={{ fontSize: 22 }}>{e.icon ?? "👹"}</div>
      <div style={{ fontSize: 11, marginTop: 4 }}>{e.name}</div>
      <Meter
        label="HP"
        value={e.tension}
        max={e.max_tension}
        color={e.is_boss ? "#f0a774" : "#9bd17e"}
      />
      {e.downed && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>撃破</div>
      )}
    </div>
  );
}

function FormationVisual(props: {
  row: RowId;
  allies: Combatant[];
  attrs: Record<string, Attribute>;
  units: Record<string, Unit>;
}) {
  const slots: (Combatant | null)[] = [
    props.allies[0] ?? null,
    props.allies[1] ?? null,
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
        {props.row === "front" ? "前列(被弾↑ / 火力↑)" : "後列(被弾↓)"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {slots.map((ally, i) => (
          <AllyCard
            key={ally?.id ?? `empty-${props.row}-${i}`}
            ally={ally}
            attrs={props.attrs}
            units={props.units}
          />
        ))}
      </div>
    </div>
  );
}

function AllyCard(props: {
  ally: Combatant | null;
  attrs: Record<string, Attribute>;
  units: Record<string, Unit>;
}) {
  const a = props.ally;
  if (!a) {
    return (
      <div
        style={{
          flex: 1,
          height: 116,
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
  const accent = a.personal_color ?? "#888";
  const pinch = a.tension > 0 && a.tension <= a.max_tension * 0.2;
  const ready = a.gauge >= a.max_gauge;
  const attr = a.attribute ? props.attrs[a.attribute] : undefined;
  const unit = a.unit ? props.units[a.unit] : undefined;
  return (
    <div
      style={{
        flex: 1,
        height: 116,
        padding: 10,
        borderRadius: 8,
        background: ready
          ? `linear-gradient(135deg, ${accent}88, ${accent}33)`
          : `linear-gradient(135deg, ${accent}33, ${accent}05)`,
        border: `1.5px solid ${accent}`,
        boxShadow: ready
          ? `0 0 16px ${accent}88`
          : pinch
            ? "0 0 8px #ff7b72cc"
            : "none",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: a.downed ? 0.35 : 1,
        filter: a.downed ? "grayscale(0.7)" : "none",
        transition:
          "opacity 220ms, filter 220ms, box-shadow 240ms ease-in-out",
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
            flexShrink: 0,
          }}
        >
          {a.marker_id ?? "?"}
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
            {a.name}
          </div>
          <div style={{ fontSize: 10, opacity: 0.65 }}>
            {unit?.icon} {attr?.icon} {a.role}
            {a.condition?.icon ? ` ${a.condition.icon}` : ""}
          </div>
        </div>
      </div>
      <Meter
        label="HP"
        value={a.tension}
        max={a.max_tension}
        color={pinch ? "#ff7b72" : "#ff95a4"}
      />
      <Meter
        label={ready ? "▶必殺可" : "声援"}
        value={a.gauge}
        max={a.max_gauge}
        color={ready ? "#ffd86b" : accent}
      />
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
          opacity: 0.75,
        }}
      >
        <span>{props.label}</span>
        <span>
          {props.value}/{props.max}
        </span>
      </div>
      <div
        style={{
          height: 5,
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
            transition: "width 360ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

function ResultBanner(props: {
  result: "win" | "lose" | null;
  mvpId: string | null;
  allies: Combatant[];
}) {
  if (!props.result) return null;
  const win = props.result === "win";
  const mvp = props.allies.find((a) => a.id === props.mvpId);
  return (
    <div
      className="fade-in"
      style={{
        marginTop: "auto",
        padding: 18,
        borderRadius: 10,
        background: win
          ? "linear-gradient(135deg, #ffd86b33, #7eb6ff22)"
          : "linear-gradient(135deg, #ff7b7233, #6b2d8c22)",
        border: `2px solid ${win ? "#ffd86b" : "#ff7b72"}`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 4 }}>
        {win ? "VICTORY" : "DEFEAT"}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
        {win ? "大成功!" : "今日はここまで..."}
      </div>
      {mvp && (
        <div style={{ fontSize: 13, marginTop: 8, opacity: 0.85 }}>
          MVP: {mvp.name}
        </div>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div
      style={{
        padding: 32,
        textAlign: "center",
        opacity: 0.6,
        fontSize: 13,
      }}
    >
      編成が空です。「編成画面へ戻る」でアクスタを配置してください。
    </div>
  );
}

// 備考: 現状 ResultBanner には mvp_id を渡せていない (App から battle_end を
// 取り回す配線が未完)。Day 5 で battle_end ハンドラを足して MVP を表示する。
