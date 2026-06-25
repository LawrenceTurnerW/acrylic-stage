// キャラカード上に表示する吹き出し。
// seq が変わった時に key={seq} で再マウントされ、CSS animation が再生される。
// 親は position: relative であること。

export function SpeechBubble(props: {
  recentSpeech: { text: string; seq: number } | null;
}) {
  if (!props.recentSpeech || !props.recentSpeech.text) return null;
  return (
    <div
      key={props.recentSpeech.seq}
      className="speech-bubble"
      // 子ターゲット (アバター頭上) に固定する位置調整は親側で行う
    >
      {props.recentSpeech.text}
    </div>
  );
}
