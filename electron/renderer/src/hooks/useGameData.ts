import { useEffect, useState } from "react";
import type { CharactersResponse, StageResponse } from "../types/character";
import type { ItemsCatalog } from "../types/items";

const API_BASE = "http://127.0.0.1:8000";

export type GameData = {
  characters: CharactersResponse | null;
  stage: StageResponse | null;
  items: ItemsCatalog | null;
  error: string | null;
};

// 初期データ(キャラ定義+ステージ)を 1 度だけ取得する。
// バックエンドのコンディションはプロセス再起動で再抽選なので、ここでも
// 再フェッチは行わない(ページ操作のたびに変わるのは混乱の元)。
export function useGameData(): GameData {
  const [characters, setCharacters] = useState<CharactersResponse | null>(null);
  const [stage, setStage] = useState<StageResponse | null>(null);
  const [items, setItems] = useState<ItemsCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [charsRes, stageRes, itemsRes] = await Promise.all([
          fetch(`${API_BASE}/characters`),
          fetch(`${API_BASE}/stage`),
          fetch(`${API_BASE}/items`),
        ]);
        if (!charsRes.ok || !stageRes.ok || !itemsRes.ok) {
          throw new Error(
            `fetch failed: characters=${charsRes.status} stage=${stageRes.status} items=${itemsRes.status}`,
          );
        }
        const chars = (await charsRes.json()) as CharactersResponse;
        const st = (await stageRes.json()) as StageResponse;
        const it = (await itemsRes.json()) as ItemsCatalog;
        if (!cancelled) {
          setCharacters(chars);
          setStage(st);
          setItems(it);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { characters, stage, items, error };
}
