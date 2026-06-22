// Backend WebSocket クライアント。
// 切断時は 1 秒待って再接続する単純なリトライ実装。

export type ServerEvent =
  | { type: "heartbeat"; ts: number; seq: number; phase: string }
  | { type: "battle_start"; front: number[]; rear: number[] }
  | { type: "camera_error"; message: string }
  | {
      type: "aruco_frame";
      ts: number;
      calibration_y_ratio: number;
      frame_jpeg_b64: string;
      detections: ArucoDetection[];
      active_uuid: string | null;
    };

export type ArucoDetection = {
  marker_id: number;
  cx: number;
  cy: number;
  row: "front" | "rear";
};

export type WSStatus = "connecting" | "open" | "closed";

export function connectLiveWS(opts: {
  onEvent: (e: ServerEvent) => void;
  onStatus?: (s: WSStatus) => void;
  url?: string;
}): () => void {
  const url = opts.url ?? "ws://127.0.0.1:8000/ws/live";
  let closed = false;
  let ws: WebSocket | null = null;
  let retryTimer: number | null = null;

  const open = () => {
    opts.onStatus?.("connecting");
    ws = new WebSocket(url);
    ws.onopen = () => opts.onStatus?.("open");
    ws.onclose = () => {
      opts.onStatus?.("closed");
      if (!closed) retryTimer = window.setTimeout(open, 1000);
    };
    ws.onerror = () => ws?.close();
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ServerEvent;
        opts.onEvent(data);
      } catch (e) {
        console.warn("ws parse failed", e, ev.data);
      }
    };
  };

  open();

  return () => {
    closed = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    ws?.close();
  };
}
