// 1 キャラに装備するアイテムを選ぶモーダル。
// インベントリ全件を表示し、種別でグループ化、レアリティバッジ付き。
// 既に他キャラが装備中のアイテムは「○○ 装備中」表示で、選ぶと自動的に
// そのキャラから外れて今選んでるキャラに装着される(1 instance = 1 キャラ)。

import type {
  EquipmentMap,
  ItemInstance,
  ItemKind,
  ItemRarity,
  ItemsCatalog,
} from "../types/items";

const RARITY_COLORS: Record<ItemRarity, string> = {
  N: "#aaa",
  R: "#7eb6ff",
  SR: "#ffd86b",
};

export function InventoryModal(props: {
  characterId: string;
  characterName: string;
  catalog: ItemsCatalog;
  inventory: ItemInstance[];
  equipment: EquipmentMap;
  charNamesById: Record<string, string>;
  onEquip: (instanceId: string) => void;
  onUnequip: () => void;
  onClose: () => void;
}) {
  const currentInstanceId = props.equipment[props.characterId];

  // instance_id → 装備中のキャラ ID (逆引き)
  const equippedToBy = new Map<string, string>();
  for (const [cid, instId] of Object.entries(props.equipment)) {
    equippedToBy.set(instId, cid);
  }

  // kind ごとにインベントリを束ねる
  const byKind = new Map<ItemKind, ItemInstance[]>();
  for (const item of props.inventory) {
    const arr = byKind.get(item.kind) ?? [];
    arr.push(item);
    byKind.set(item.kind, arr);
  }
  // 各 kind 内でレア順(SR → R → N)+ 取得順(新しい順)に並べ替え
  const rarityOrder: Record<ItemRarity, number> = { SR: 0, R: 1, N: 2 };
  for (const arr of byKind.values()) {
    arr.sort((a, b) => {
      const ro = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (ro !== 0) return ro;
      return b.acquired_at.localeCompare(a.acquired_at);
    });
  }

  return (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 150,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#15131f",
          border: "1px solid #3a2d6b",
          borderRadius: 12,
          padding: 20,
          width: "min(720px, 92vw)",
          maxHeight: "85vh",
          overflow: "auto",
          color: "#f5f5f5",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 3 }}>
              EQUIP
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {props.characterName} の装備を選ぶ
            </div>
          </div>
          <button
            onClick={props.onClose}
            style={{
              background: "transparent",
              color: "inherit",
              border: "1px solid #3a2d6b",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </header>

        {currentInstanceId && (
          <button
            onClick={() => {
              props.onUnequip();
              props.onClose();
            }}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              background: "rgba(255,123,114,0.15)",
              border: "1px solid #ff7b72",
              color: "#ff7b72",
              borderRadius: 6,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            装備を外す
          </button>
        )}

        {props.inventory.length === 0 ? (
          <EmptyHint />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {(Object.keys(props.catalog.items) as ItemKind[]).map((kind) => {
              const items = byKind.get(kind) ?? [];
              const def = props.catalog.items[kind];
              if (items.length === 0) return null;
              return (
                <section key={kind}>
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      letterSpacing: 1,
                      marginBottom: 6,
                    }}
                  >
                    {def.icon} {def.name}
                    <span style={{ opacity: 0.5 }}> ・ {items.length} 個</span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {items.map((it) => {
                      const owner = equippedToBy.get(it.instance_id);
                      const isMine = owner === props.characterId;
                      const ownerName = owner
                        ? props.charNamesById[owner] ?? owner
                        : null;
                      const rarityDef = def.rarities[it.rarity];
                      return (
                        <button
                          key={it.instance_id}
                          onClick={() => {
                            props.onEquip(it.instance_id);
                            props.onClose();
                          }}
                          disabled={isMine}
                          style={{
                            background: isMine
                              ? `${RARITY_COLORS[it.rarity]}33`
                              : "rgba(255,255,255,0.04)",
                            border: `1.5px solid ${RARITY_COLORS[it.rarity]}`,
                            borderRadius: 8,
                            padding: 10,
                            color: "inherit",
                            cursor: isMine ? "default" : "pointer",
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: RARITY_COLORS[it.rarity],
                                letterSpacing: 1,
                              }}
                            >
                              {it.rarity}
                            </span>
                            <span style={{ fontSize: 11, opacity: 0.85 }}>
                              +{rarityDef.value}
                            </span>
                          </div>
                          {owner && (
                            <div
                              style={{
                                fontSize: 10,
                                opacity: 0.65,
                                color: isMine
                                  ? RARITY_COLORS[it.rarity]
                                  : "#ffd86b",
                              }}
                            >
                              {isMine ? "✓ 装備中" : `${ownerName} 装備中`}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div
      style={{
        padding: 40,
        textAlign: "center",
        opacity: 0.5,
        fontSize: 13,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 8,
        border: "1px dashed #3a2d6b",
      }}
    >
      まだアイテムを持っていません
      <div style={{ fontSize: 11, marginTop: 4 }}>
        戦闘に勝利するとドロップします
      </div>
    </div>
  );
}
