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
  DotState,
  ServerEvent,
  StatusEffect,
} from "../ws";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import type {
  Attribute,
  Character,
  CharactersResponse,
  RowId,
  Unit,
} from "../types/character";
import { CharacterAvatar } from "./CharacterAvatar";
import { DamageOverlay } from "./DamageOverlay";
import { SpeechBubble } from "./SpeechBubble";

type DamageMap = Record<string, { damage: number; seq: number }>;
type SpeechMap = Record<string, { text: string; seq: number }>;
type SeqMap = Record<string, number>;

export type ActionCaption = {
  attacker_name: string;
  attacker_color: string;
  action_label: string;
  target_name: string | null;
  seq: number;
};

type Formation = { front: number[]; rear: number[] };

export function BattleScreen(props: {
  heartbeat: ServerEvent | null;
  log: string[];
  formation: Formation;
  battleState: BattleStateSnapshot | null;
  battleEnd: { result: "win" | "lose"; mvp_id: string | null; turn: number } | null;
  charsData: CharactersResponse | null;
  damageBy: DamageMap;
  speechBy: SpeechMap;
  actingBy: SeqMap;
  actionCaption: ActionCaption | null;
  onReturnToPrepare: () => void;
}) {
  const {
    heartbeat,
    log,
    formation,
    battleState,
    battleEnd,
    charsData,
    damageBy,
    speechBy,
    actingBy,
    actionCaption,
    onReturnToPrepare,
  } = props;

  // 描画用に String キーで引きやすい辞書に。useGameData が来てなくても空 {} で動く。
  const attrs: Record<string, Attribute> = charsData?.attributes ?? {};
  const units: Record<string, Unit> = charsData?.units ?? {};
  // Combatant は cast_image_url を持たないので、marker_id 経由で静的キャラ定義
  // を引けるよう Map を作る (AllyCard 内で参照)
  const charsById = useMemo(() => {
    const m = new Map<number, Character>();
    if (charsData) {
      for (const c of charsData.characters) m.set(c.aruco_marker_id, c);
    }
    return m;
  }, [charsData]);

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
            <ActionCaptionBar caption={actionCaption} />
            <EnemyArea
              enemies={enemies}
              damageBy={damageBy}
              actingBy={actingBy}
            />
            <FormationVisual
              row="front"
              allies={allies.filter((a) => a.row === "front")}
              attrs={attrs}
              units={units}
              charsById={charsById}
              damageBy={damageBy}
              speechBy={speechBy}
              actingBy={actingBy}
            />
            <FormationVisual
              row="rear"
              allies={allies.filter((a) => a.row === "rear")}
              attrs={attrs}
              units={units}
              charsById={charsById}
              damageBy={damageBy}
              speechBy={speechBy}
              actingBy={actingBy}
            />
          </>
        )}

        {finished && (
          <ResultBanner
            result={battleEnd?.result ?? result}
            mvpId={battleEnd?.mvp_id ?? null}
            turn={battleEnd?.turn ?? battleState?.turn ?? 0}
            allies={allies}
            onRestart={onReturnToPrepare}
          />
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

function EnemyArea(props: {
  enemies: Combatant[];
  damageBy: DamageMap;
  actingBy: SeqMap;
}) {
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
          <EnemyCard
            key={e.id}
            enemy={e}
            recentDamage={props.damageBy[e.id] ?? null}
            actingSeq={props.actingBy[e.id] ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function EnemyCard(props: {
  enemy: Combatant;
  recentDamage: { damage: number; seq: number } | null;
  actingSeq: number | null;
}) {
  const e = props.enemy;
  const haloColor = e.is_boss ? "#f0a774" : "#ff9b8b";
  return (
    <div
      style={{
        flex: e.is_boss ? "2 1 0" : "1 1 0",
        minWidth: 110,
        padding: 10,
        borderRadius: 8,
        position: "relative", // damage popup の基準
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
      <StatusBadges effects={e.status_effects} dots={e.dots} />
      {e.downed && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>撃破</div>
      )}
      <ActingHalo actingSeq={props.actingSeq} color={haloColor} />
      <DamageOverlay recentDamage={props.recentDamage} />
    </div>
  );
}

// 攻撃中のキャラのカード周囲にリング状のハロを出す。
// actingSeq が変わる度に再マウントしてアニメを再生する。
function ActingHalo(props: { actingSeq: number | null; color: string }) {
  if (props.actingSeq == null) return null;
  return (
    <div
      key={`act-${props.actingSeq}`}
      className="acting-halo"
      style={{ ["--halo-color" as string]: props.color } as CSSProperties}
    />
  );
}

// 画面上部に出す「攻撃者 → 行動 → 対象」キャプション。
// seq が変わる度に再マウントしてポップインアニメが再生される。
function ActionCaptionBar(props: { caption: ActionCaption | null }) {
  if (!props.caption) {
    return (
      <div
        style={{
          minHeight: 28,
          opacity: 0.35,
          fontSize: 11,
          letterSpacing: 1,
          textAlign: "center",
        }}
      >
        ・・・
      </div>
    );
  }
  const c = props.caption;
  return (
    <div
      key={`cap-${c.seq}`}
      className="action-caption"
      style={{ borderColor: `${c.attacker_color}88` }}
    >
      <span
        style={{
          color: c.attacker_color,
          fontWeight: 800,
        }}
      >
        {c.attacker_name}
      </span>
      <span className="action-caption-sep">の</span>
      <span style={{ opacity: 0.95 }}>{c.action_label}</span>
      {c.target_name && (
        <>
          <span className="action-caption-arrow">→</span>
          <span style={{ fontWeight: 800 }}>{c.target_name}</span>
        </>
      )}
    </div>
  );
}

function FormationVisual(props: {
  row: RowId;
  allies: Combatant[];
  attrs: Record<string, Attribute>;
  units: Record<string, Unit>;
  charsById: Map<number, Character>;
  damageBy: DamageMap;
  speechBy: SpeechMap;
  actingBy: SeqMap;
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
            // key を `<id>-<row>` にして列移動で必ず再マウント → fade-in で
            // 視覚的に「移動した」ことが分かるようにする
            key={ally ? `${ally.id}-${props.row}` : `empty-${props.row}-${i}`}
            ally={ally}
            attrs={props.attrs}
            units={props.units}
            charsById={props.charsById}
            recentDamage={ally ? props.damageBy[ally.id] ?? null : null}
            recentSpeech={ally ? props.speechBy[ally.id] ?? null : null}
            actingSeq={ally ? props.actingBy[ally.id] ?? null : null}
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
  charsById: Map<number, Character>;
  recentDamage: { damage: number; seq: number } | null;
  recentSpeech: { text: string; seq: number } | null;
  actingSeq: number | null;
}) {
  const a = props.ally;
  const CARD_HEIGHT = 132;
  if (!a) {
    return (
      <div
        style={{
          flex: 1,
          height: CARD_HEIGHT,
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
  // 左に大きく顔を出すキャラゲー風レイアウト。avatar は card 高さに合わせる。
  const avatarSize = CARD_HEIGHT - 16; // padding 8 × 2 を引いた値
  return (
    <div
      className="fade-in"
      style={{
        flex: 1,
        height: CARD_HEIGHT,
        padding: 8,
        borderRadius: 8,
        position: "relative", // damage popup の基準
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
        flexDirection: "row",
        gap: 10,
        opacity: a.downed ? 0.35 : 1,
        filter: a.downed ? "grayscale(0.7)" : "none",
        transition:
          "opacity 220ms, filter 220ms, box-shadow 240ms ease-in-out",
      }}
    >
      <CharacterAvatar
        character={{
          id: a.id,
          aruco_marker_id: a.marker_id ?? 0,
          personal_color: accent,
          // Combatant 自体は cast_image_url を持たないので、静的キャラ定義から引く
          cast_image_url:
            a.marker_id != null
              ? props.charsById.get(a.marker_id)?.cast_image_url ?? null
              : null,
        }}
        size={avatarSize}
        shape="rounded"
        glow={false}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          paddingTop: 2,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            letterSpacing: 0.5,
          }}
        >
          {a.name}
        </div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>
          {unit?.icon} {attr?.icon} {a.role}
          {a.condition?.icon ? ` ${a.condition.icon}` : ""}
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
        <StatusBadges effects={a.status_effects} dots={a.dots} />
      </div>
      <ActingHalo actingSeq={props.actingSeq} color={accent} />
      <DamageOverlay recentDamage={props.recentDamage} />
      <SpeechBubble recentSpeech={props.recentSpeech} />
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
  turn: number;
  allies: Combatant[];
  onRestart: () => void;
}) {
  if (!props.result) return null;
  const win = props.result === "win";
  const mvp = props.allies.find((a) => a.id === props.mvpId);
  return (
    <div
      className="fade-in"
      style={{
        marginTop: "auto",
        padding: 20,
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
      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>
        {win ? "大成功!" : "今日はここまで..."}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
        {props.turn} ターンで {win ? "ステージ制覇" : "撤退"}
      </div>
      {mvp && (
        <div
          style={{
            fontSize: 14,
            marginTop: 10,
            padding: "4px 12px",
            display: "inline-block",
            borderRadius: 16,
            background: mvp.personal_color
              ? `${mvp.personal_color}44`
              : "rgba(255,255,255,0.08)",
            border: `1px solid ${mvp.personal_color ?? "#888"}`,
          }}
        >
          ✨ ベストパフォーマンス: {mvp.name}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <button
          onClick={props.onRestart}
          style={{
            padding: "8px 22px",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2,
            background: "linear-gradient(90deg, #ff7eb6, #7eb6ff)",
            color: "#0f0f14",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          もう一度
        </button>
      </div>
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

function StatusBadges(props: { effects: StatusEffect[]; dots: DotState[] }) {
  const items = [
    ...props.effects.map((e) => ({
      key: `eff-${e.kind}-${e.source}`,
      label:
        e.kind === "attack_buff"
          ? `攻↑×${e.multiplier.toFixed(1)}`
          : e.kind === "speed_debuff"
            ? `速↓×${e.multiplier.toFixed(1)}`
            : e.kind,
      turns: e.turns_left,
      color:
        e.kind === "attack_buff"
          ? "#ffd86b"
          : e.kind === "speed_debuff"
            ? "#7eb6ff"
            : "#aaa",
    })),
    ...props.dots.map((d) => ({
      key: `dot-${d.name}`,
      label: `${d.name} -${d.damage}`,
      turns: d.turns_left,
      color: "#ff7b72",
    })),
  ];
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        marginTop: 2,
      }}
    >
      {items.map((b) => (
        <span
          key={b.key}
          className="status-badge"
          style={{
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 4,
            background: `${b.color}33`,
            border: `1px solid ${b.color}88`,
            color: b.color,
            whiteSpace: "nowrap",
          }}
          title={`残 ${b.turns} ターン`}
        >
          {b.label}({b.turns}T)
        </span>
      ))}
    </div>
  );
}
