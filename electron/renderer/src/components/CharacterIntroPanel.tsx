// 編成画面で 1 キャラを紹介するパネル。
// SPEC §3.4 の要件: 名前 / ユニット / 属性 / ロール / ステータス★ / 必殺技カード /
// (本画面ではコンディションも併記)。
//
// キャラ画像は本リポジトリに含めない方針なので、個人カラーのカラーチップに
// マーカー ID を載せたフォールバック表示にしている (SPEC §3.3 / README)。

import type { Attribute, Character, Unit } from "../types/character";

const POS_LABEL: Record<string, string> = {
  front: "前列",
  rear: "後列",
  either: "どちらも",
  front_risk: "前列(ハイリスク)",
};

export function CharacterIntroPanel(props: {
  character: Character;
  unit?: Unit;
  attribute?: Attribute;
}) {
  const { character: c, unit, attribute } = props;
  const accent = c.personal_color;
  const attrColor = attribute?.color ?? "#888";

  return (
    <div
      className="fade-in"
      style={{
        borderRadius: 12,
        padding: 14,
        background: `linear-gradient(135deg, ${accent}22, ${accent}05)`,
        border: `1px solid ${accent}66`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* ヘッダー: カラーチップ + 名前 + ユニット/属性/ロール */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ColorChip color={accent} markerId={c.aruco_marker_id} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 0.5,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {c.name}
          </div>
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
            {unit?.icon} {unit?.display_name_jp ?? c.unit}
            <span style={{ opacity: 0.5 }}> ・ </span>
            {attribute?.icon} {attribute?.display ?? c.attribute}
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
            {c.role}
            <span style={{ opacity: 0.4 }}>
              {" / 適性: "}
              {POS_LABEL[c.position_preference] ?? c.position_preference}
            </span>
          </div>
        </div>
      </div>

      {/* ステータス★ */}
      <div style={{ display: "flex", gap: 6 }}>
        <StatPill label="攻撃" value={c.stats.attack} />
        <StatPill label="防御" value={c.stats.defense} />
        <StatPill label="素早" value={c.stats.speed} />
      </div>

      {/* コンディション */}
      {c.condition && (
        <div
          style={{
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ opacity: 0.65 }}>コンディション</span>
          <span>
            {c.condition.icon && <span>{c.condition.icon} </span>}
            {c.condition.display}
          </span>
        </div>
      )}

      {/* 必殺技カード(SPEC: 編成画面で大きく表示) */}
      <div
        style={{
          padding: 10,
          borderRadius: 8,
          background: `linear-gradient(110deg, ${attrColor}33, transparent 70%)`,
          border: `1px solid ${attrColor}66`,
        }}
      >
        <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 1 }}>
          必殺技 ・ {c.ultimate.type}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            margin: "3px 0 5px",
            color: "#fff",
          }}
        >
          {c.ultimate.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.5 }}>
          {c.ultimate.description}
        </div>
      </div>
    </div>
  );
}

function ColorChip(props: { color: string; markerId: number }) {
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 10,
        background: props.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0f0f14",
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: 1,
        flexShrink: 0,
        boxShadow: `0 0 12px ${props.color}66`,
      }}
      title={`ArUco marker id ${props.markerId}`}
    >
      {props.markerId}
    </div>
  );
}

function StatPill(props: { label: string; value: number }) {
  // 1..5 を ★ で表示。残りは ☆ で空欄を示す(視覚的にレベル感が分かる)。
  const filled = Math.max(0, Math.min(5, props.value));
  return (
    <div
      style={{
        flex: 1,
        fontSize: 10,
        padding: "4px 6px",
        background: "rgba(0,0,0,0.25)",
        borderRadius: 6,
      }}
    >
      <div style={{ opacity: 0.6 }}>{props.label}</div>
      <div style={{ color: "#ffd86b", letterSpacing: 1, fontSize: 11 }}>
        {"★".repeat(filled)}
        <span style={{ opacity: 0.25 }}>{"★".repeat(5 - filled)}</span>
      </div>
    </div>
  );
}
