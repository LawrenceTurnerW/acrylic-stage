import { useEffect, useState } from "react";
import type { ServerEvent } from "../ws";

type ArucoFrame = Extract<ServerEvent, { type: "aruco_frame" }>;

type CameraInfo = {
  uuid: string;
  name: string;
  index: number;
  available: boolean;
  active: boolean;
  thumbnail_jpeg_b64: string | null;
};

export function CalibrationScreen(props: { frame: ArucoFrame | null }) {
  const [ratio, setRatio] = useState<number>(0.5);
  const [sending, setSending] = useState(false);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [activeUuid, setActiveUuid] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (props.frame && ratio === 0.5) {
      setRatio(props.frame.calibration_y_ratio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.frame?.calibration_y_ratio]);

  const scanCameras = async () => {
    setScanning(true);
    try {
      const r = await fetch("http://127.0.0.1:8000/cameras");
      const data = await r.json();
      setCameras(data.cameras);
      setActiveUuid(data.active_uuid);
    } finally {
      setScanning(false);
    }
  };

  // 初回マウント時にカメラをスキャン
  useEffect(() => {
    scanCameras();
  }, []);

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

  const selectCamera = async (uuid: string) => {
    setSwitching(true);
    try {
      const r = await fetch(
        `http://127.0.0.1:8000/cameras/select?uuid=${encodeURIComponent(uuid)}`,
        { method: "POST" },
      );
      const data = await r.json();
      if (data.ok) {
        setActiveUuid(data.uuid);
        setCameras((cs) =>
          cs.map((c) => ({ ...c, active: c.uuid === data.uuid })),
        );
      }
    } finally {
      setSwitching(false);
    }
  };

  const detections = props.frame?.detections ?? [];
  const detectedIds = new Set(detections.map((d) => d.marker_id));
  void activeUuid; // 受信値は state に保持するだけ、UI は cameras[].active を見る

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
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <label style={{ fontSize: 13, opacity: 0.8 }}>
              カメラ(サムネイルで識別 / クリックで切替)
            </label>
            <button
              onClick={scanCameras}
              disabled={scanning || switching}
              style={{
                background: "transparent",
                color: "inherit",
                border: "1px solid #3a2d6b",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {scanning ? "スキャン中…" : "再スキャン"}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 8,
            }}
          >
            {cameras.length === 0 && (
              <span style={{ opacity: 0.5, fontSize: 12 }}>
                {scanning ? "スキャン中…" : "(候補なし)"}
              </span>
            )}
            {cameras.map((c) => (
              <CameraCard
                key={c.uuid}
                cam={c}
                liveThumbnail={
                  c.active ? props.frame?.frame_jpeg_b64 ?? null : null
                }
                disabled={switching || scanning || !c.available}
                onClick={() => selectCamera(c.uuid)}
              />
            ))}
          </div>

          <div>
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

function CameraCard(props: {
  cam: CameraInfo;
  liveThumbnail: string | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const { cam, liveThumbnail, disabled, onClick } = props;
  const thumb = cam.active ? liveThumbnail : cam.thumbnail_jpeg_b64;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: cam.active ? "rgba(126,231,135,0.12)" : "#1a1530",
        border: `1px solid ${cam.active ? "#7ee787" : "#3a2d6b"}`,
        color: "inherit",
        borderRadius: 6,
        padding: 6,
        cursor: cam.available && !cam.active ? "pointer" : "default",
        opacity: cam.available ? 1 : 0.4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        textAlign: "left",
      }}
    >
      <div
        style={{
          aspectRatio: "16 / 9",
          background: "#000",
          borderRadius: 4,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {thumb ? (
          <img
            src={`data:image/jpeg;base64,${thumb}`}
            alt={`camera ${cam.index}`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span style={{ fontSize: 10, opacity: 0.5 }}>
            {cam.available ? "no preview" : "未接続"}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.4 }}>
        <div
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontWeight: 600,
          }}
          title={cam.name}
        >
          {cam.name}
        </div>
        <div style={{ opacity: 0.5, fontFamily: "monospace", fontSize: 10 }}>
          idx {cam.index}
          {cam.active ? " ・使用中" : ""}
          {!cam.available && !cam.active ? " ・unavailable" : ""}
        </div>
      </div>
    </button>
  );
}
