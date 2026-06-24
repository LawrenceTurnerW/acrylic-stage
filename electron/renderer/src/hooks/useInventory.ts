// インベントリと装備状態を localStorage で永続化するフック。
//
// データ構造:
//   "acrylic-stage:inventory"  → ItemInstance[]
//   "acrylic-stage:equipment"  → EquipmentMap (character_id → instance_id)
//
// 1 アイテムは 1 キャラまで。別キャラに付け替えると元のキャラから自動で外れる。
// localStorage に直接書く + window.dispatchEvent('storage') で他タブにも反映、
// だが Electron 単一ウィンドウなので実用上は単独タブで動く想定。

import { useCallback, useEffect, useState } from "react";
import type {
  EquipmentMap,
  ItemInstance,
  ItemKind,
  ItemRarity,
  ItemsCatalog,
} from "../types/items";

const INVENTORY_KEY = "acrylic-stage:inventory";
const EQUIPMENT_KEY = "acrylic-stage:equipment";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`localStorage write failed for ${key}`, e);
  }
}

// 単純なグローバル listener。useInventory を複数所で使う場合に同期させる
type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  for (const l of listeners) l();
}

export function rollDrop(catalog: ItemsCatalog): ItemInstance | null {
  const weights = catalog.drop_rarity_weights;
  const rarities = Object.keys(weights) as ItemRarity[];
  const total = rarities.reduce((s, r) => s + (weights[r] ?? 0), 0);
  if (total <= 0) return null;
  // 1) レアリティ抽選
  let roll = Math.random() * total;
  let chosenRarity: ItemRarity = rarities[0];
  for (const r of rarities) {
    roll -= weights[r] ?? 0;
    if (roll <= 0) {
      chosenRarity = r;
      break;
    }
  }
  // 2) 種類は均等 1/3 で抽選
  const kinds = Object.keys(catalog.items) as ItemKind[];
  const chosenKind = kinds[Math.floor(Math.random() * kinds.length)];
  return {
    instance_id: crypto.randomUUID(),
    kind: chosenKind,
    rarity: chosenRarity,
    acquired_at: new Date().toISOString(),
  };
}

export function useInventory() {
  const [inventory, setInventory] = useState<ItemInstance[]>(() =>
    readJSON<ItemInstance[]>(INVENTORY_KEY, []),
  );
  const [equipment, setEquipment] = useState<EquipmentMap>(() =>
    readJSON<EquipmentMap>(EQUIPMENT_KEY, {}),
  );

  // 他コンポーネントからの更新を反映する
  useEffect(() => {
    const onChange = () => {
      setInventory(readJSON<ItemInstance[]>(INVENTORY_KEY, []));
      setEquipment(readJSON<EquipmentMap>(EQUIPMENT_KEY, {}));
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const addItem = useCallback((item: ItemInstance) => {
    const next = [...readJSON<ItemInstance[]>(INVENTORY_KEY, []), item];
    writeJSON(INVENTORY_KEY, next);
    notify();
  }, []);

  const equip = useCallback((characterId: string, instanceId: string) => {
    const next = { ...readJSON<EquipmentMap>(EQUIPMENT_KEY, {}) };
    // 別キャラが同じ instance を装備してたら自動で外す(1 instance = 1 キャラ)
    for (const cid of Object.keys(next)) {
      if (next[cid] === instanceId && cid !== characterId) {
        delete next[cid];
      }
    }
    next[characterId] = instanceId;
    writeJSON(EQUIPMENT_KEY, next);
    notify();
  }, []);

  const unequip = useCallback((characterId: string) => {
    const next = { ...readJSON<EquipmentMap>(EQUIPMENT_KEY, {}) };
    delete next[characterId];
    writeJSON(EQUIPMENT_KEY, next);
    notify();
  }, []);

  // /start_battle に渡す形 (character_id → {kind, rarity})
  const buildEquipmentPayload = useCallback(():
    | Record<string, { kind: ItemKind; rarity: ItemRarity }>
    | undefined => {
    const inv = readJSON<ItemInstance[]>(INVENTORY_KEY, []);
    const eq = readJSON<EquipmentMap>(EQUIPMENT_KEY, {});
    const byInstance = new Map(inv.map((i) => [i.instance_id, i]));
    const out: Record<string, { kind: ItemKind; rarity: ItemRarity }> = {};
    for (const [cid, instId] of Object.entries(eq)) {
      const item = byInstance.get(instId);
      if (item) out[cid] = { kind: item.kind, rarity: item.rarity };
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }, []);

  return {
    inventory,
    equipment,
    addItem,
    equip,
    unequip,
    buildEquipmentPayload,
  };
}
