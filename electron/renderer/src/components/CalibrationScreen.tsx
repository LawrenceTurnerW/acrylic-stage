import { useEffect, useState } from "react";
import type { ServerEvent } from "../ws";

type ArucoFrame = Extract<ServerEvent, { type: "aruco_frame" }>;

export function CalibrationScreen(props: { frame: ArucoFrame | null }) {
  const [ratio, setRatio] = useState<number>(0.5);
  const [sending, setSending] = useState(false);

  // バックエンドが ratio を持つので、初期値を最新フレームから引いてくる
  useEffect(() => {
    if (props.frame && ratio === 0.5) {
      setRatio(props.frame.calibration_y_ratio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.frame?.calibration_y_ratio]);

  const applyRatio = async (value: number) => {
    setRatio(value);
    setSending(true);
    try {
      await fetch(`http://127.0.0.1:8000/calibration?y_ratio=${value}`, {
        method: "POST",
      });
    } finally {
      setSending(false);
    }
  };

  const detections = props.frame?.detections ?? [];
  const detectedIds = new Set(detections.map((d) => d.marker_id));

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 130px)" }}>
      <section style={{ flex: 2, display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            background: "#000",
            borderRadius: 12,
            overflow: "hidden",
            flex: 1,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {props.frame ? (
            <img
              src={`data:image/jpeg;base64,${props.frame.frame_jpeg_b64}`}
              alt="camera preview"
              style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
            />
          ) : (
            <span style={{ opacity: 0.5 }}>
              カメラ映像待機中…(バックエンドがカメラを開けない場合は権限を確認)
            </span>
          )}
        </div>
        <div
          style={{
            background: "#0c0c12",
            border: "1px solid #2a2440",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <label style={{ fontSize: 13, opacity: 0.8 }}>
            前列ライン: 画面下から {(ratio * 100).toFixed(0)}%
            {sending ? " (送信中…)" : ""}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={ratio}
            onChange={(e) => applyRatio(parseFloat(e.target.value))}
            style={{ width: "100%", marginTop: 8 }}
          />
        </div>
      </section>
      <aside
        style={{
          flex: 1,
          background: "#0c0c12",
          borderRadius: 12,
          padding: 16,
          border: "1px solid #2a2440",
          overflow: "auto",
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.7 }}>
          検出マーカー
        </h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((id) => {
            const d = detections.find((x) => x.marker_id === id);
            return (
              <li
                key={id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  marginBottom: 4,
                  borderRadius: 6,
                  background: detectedIds.has(id)
                    ? "rgba(126,231,135,0.12)"
                    : "rgba(255,255,255,0.03)",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                <span>ID {id}</span>
                {d ? (
                  <span>
                    {d.row} (x={d.cx}, y={d.cy})
                  </span>
                ) : (
                  <span style={{ opacity: 0.4 }}>未検出</span>
                )}
              </li>
            );
          })}
        </ul>
        <p style={{ fontSize: 11, opacity: 0.5, marginTop: 16 }}>
          ※ マーカー ID と キャラの対応は characters.yaml 参照
        </p>
      </aside>
    </div>
  );
}
