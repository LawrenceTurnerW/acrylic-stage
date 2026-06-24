// ドロップアクセサリーシステムの型定義。
// バックエンド /items エンドポイントの shape にそろえる(items.yaml と一致)。

export type ItemKind = "power_brooch" | "heart_charm" | "voice_ring";
export type ItemRarity = "N" | "R" | "SR";
export type ItemEffect = "attack" | "max_tension" | "gauge_per_turn_bonus";

// /items レスポンスの shape
export type ItemRarityDef = { value: number; label: string };
export type ItemDef = {
  name: string;
  icon: string;
  effect: ItemEffect;
  description: string;
  rarities: Record<ItemRarity, ItemRarityDef>;
};
export type ItemsCatalog = {
  items: Record<ItemKind, ItemDef>;
  drop_rarity_weights: Record<ItemRarity, number>;
  drop_on_win: number;
  drop_on_lose: number;
};

// localStorage に保存するアイテムインスタンス
export type ItemInstance = {
  instance_id: string; // crypto.randomUUID()
  kind: ItemKind;
  rarity: ItemRarity;
  acquired_at: string; // ISO date
};

// character_id → 装備中の instance_id
export type EquipmentMap = Record<string, string>;
