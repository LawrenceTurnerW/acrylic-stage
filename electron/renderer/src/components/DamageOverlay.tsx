// カード上に被弾フラッシュとダメージポップアップを重ねる共通コンポーネント。
//
// 親(AllyCard / EnemyCard)は position: relative を持たせる必要がある。
// props.recentDamage の seq が変わった瞬間に flash と popup を 1 つ生成する。
// 同じ seq では発火しないので props を再渡ししても安全。
// popup は 1.4 秒で自動退場、flash は ~380ms。

import { useEffect, useRef, useState } from "react";

type Popup = { key: number; damage: number };

export function DamageOverlay(props: {
  recentDamage: { damage: number; seq: number } | null;
}) {
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flashKey, setFlashKey] = useState<number>(0);
  const lastSeq = useRef<number>(0);

  useEffect(() => {
    const rd = props.recentDamage;
    if (!rd || rd.seq === lastSeq.current) return;
    lastSeq.current = rd.seq;
    const id = rd.seq;
    setPopups((p) => [...p, { key: id, damage: rd.damage }]);
    setFlashKey(id);
    const t = window.setTimeout(() => {
      setPopups((p) => p.filter((x) => x.key !== id));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [props.recentDamage]);

  return (
    <>
      {/* key を変えて再マウントすることで毎回アニメを再生 */}
      {flashKey > 0 && <div key={flashKey} className="damage-flash-overlay" />}
      {popups.map((p) => (
        <div key={p.key} className="damage-popup">
          -{p.damage}
        </div>
      ))}
    </>
  );
}
