// 勝利時のアクセサリードロップ通知。2.4 秒で自動退場、クリックでも閉じる。

import { useEffect } from "react";
import type { ItemDef, ItemInstance, ItemRarity } from "../types/items";

const DURATION_MS = 2400;

const RARITY_COLORS: Record<ItemRarity, string> = {
  N: "#aaa",
  R: "#7eb6ff",
  SR: "#ffd86b",
};

const RARITY_GLOW: Record<ItemRarity, string> = {
  N: "rgba(170,170,170,0.4)",
  R: "rgba(126,182,255,0.7)",
  SR: "rgba(255,216,107,0.9)",
};

export function ItemDropFlash(props: {
  item: ItemInstance;
  def: ItemDef;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(props.onDone, DURATION_MS);
    return () => window.clearTimeout(t);
  }, [props.onDone]);

  const color = RARITY_COLORS[props.item.rarity];
  const glow = RARITY_GLOW[props.item.rarity];
  const rarityDef = props.def.rarities[props.item.rarity];

  return (
    <div
      onClick={props.onDone}
      className="ultimate-flash"
      style={{
        position: "fixed",
        inset: 0,
        background: `radial-gradient(circle at center, ${color}44 0%, rgba(0,0,0,0.85) 80%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 220,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: 8,
          opacity: 0.7,
          marginBottom: 12,
        }}
      >
        DROP!
      </div>
      <div
        style={{
          padding: "28px 40px",
          borderRadius: 16,
          background: "rgba(20,20,30,0.85)",
          border: `3px solid ${color}`,
          boxShadow: `0 0 48px ${glow}`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 72 }}>{props.def.icon}</div>
        <div
          style={{
            fontSize: 12,
            opacity: 0.7,
            letterSpacing: 4,
            marginTop: 8,
            color,
          }}
        >
          ★ {props.item.rarity}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            margin: "6px 0",
            color: "#fff",
          }}
        >
          {props.def.name}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          {effectLabel(props.def.effect)} +{rarityDef.value}
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 16 }}>
        クリックで閉じる
      </div>
    </div>
  );
}

function effectLabel(effect: string): string {
  switch (effect) {
    case "attack":
      return "攻撃";
    case "max_tension":
      return "HP";
    case "gauge_per_turn_bonus":
      return "声援/turn";
    default:
      return effect;
  }
}
