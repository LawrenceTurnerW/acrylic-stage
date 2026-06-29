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
    }
  | ({ type: "battle_state"; ts: number } & BattleStateSnapshot)
  | ({ type: "battle_action"; ts: number } & BattleAction)
  | {
      type: "battle_end";
      ts: number;
      result: "win" | "lose" | null;
      mvp_id: string | null;
      turn: number;
      message: string;
    };

export type ArucoDetection = {
  marker_id: number;
  cx: number;
  cy: number;
  row: "front" | "rear";
};

export type StatusEffect = {
  kind: "attack_buff" | "speed_debuff" | string;
  multiplier: number;
  turns_left: number;
  source: string;
};

export type DotState = {
  name: string;
  damage: number;
  turns_left: number;
};

export type Combatant = {
  id: string;
  name: string;
  is_ally: boolean;
  attack: number;
  defense: number;
  speed: number;
  tension: number;
  max_tension: number;
  gauge: number;
  max_gauge: number;
  marker_id: number | null;
  row: "front" | "rear";
  unit: string | null;
  attribute: string | null;
  personal_color: string | null;
  role: string | null;
  position_preference: string | null;
  condition: {
    id: string;
    display: string;
    icon: string;
  } | null;
  ultimate: {
    name: string;
    type: string;
    description: string;
  } | null;
  icon: string | null;
  is_boss: boolean;
  downed: boolean;
  status_effects: StatusEffect[];
  dots: DotState[];
};

export type BattleStateSnapshot = {
  turn: number;
  finished: boolean;
  result: "win" | "lose" | null;
  allies: Combatant[];
  enemies: Combatant[];
};

export type BattleAction =
  | {
      kind: "normal_attack";
      actor_id: string;
      actor_name: string;
      actor_is_ally: boolean;
      target_id: string;
      target_name: string;
      damage: number;
      target_downed: boolean;
      turn: number;
      message: string;
      speech?: string;
    }
  | {
      kind: "ultimate";
      actor_id: string;
      actor_name: string;
      actor_is_ally: boolean;
      ultimate_name: string;
      ultimate_type: string;
      primary_target_id: string | null;
      primary_target_name: string | null;
      targets_hit: string[];
      total_damage: number;
      healed_count: number;
      healed_total: number;
      buffed_count: number;
      debuffed_count: number;
      dot_applied: string[];
      turn: number;
      message: string;
      speech?: string;
    }
  | {
      kind: "dot_tick";
      actor_id: string;
      actor_name: string;
      actor_is_ally: boolean;
      dot_name: string;
      damage: number;
      target_downed: boolean;
      turn: number;
      message: string;
    }
  | {
      kind: "skip";
      actor_id: string;
      actor_name: string;
      actor_is_ally: boolean;
      turn: number;
      message: string;
    }
  | {
      kind: "downed";
      actor_id: string;
      actor_name: string;
      actor_is_ally: boolean;
      turn: number;
      message: string;
      speech?: string;
    }
  | {
      kind: "row_changed";
      actor_id: string;
      actor_name: string;
      actor_is_ally: true;
      old_row: "front" | "rear";
      new_row: "front" | "rear";
      turn: number;
      message: string;
    }
  | {
      kind: "warning_announce";
      actor_id: string;
      actor_name: string;
      actor_is_ally: false;
      variant_name: string;
      variant_kind: string;
      target_row: "front" | "rear";
      fires_on_turn: number;
      turns_left: number;
      turn: number;
      message: string;
    }
  | {
      kind: "warning_countdown";
      actor_id: string;
      actor_name: string;
      actor_is_ally: false;
      variant_name: string;
      target_row: "front" | "rear";
      turns_left: number;
      turn: number;
      message: string;
    }
  | {
      kind: "warning_fire";
      actor_id: string;
      actor_name: string;
      actor_is_ally: false;
      variant_name: string;
      target_row: "front" | "rear";
      victims: Array<{
        ally_id: string;
        ally_name: string;
        damage: number;
        downed: boolean;
      }>;
      turn: number;
      message: string;
    }
  | {
      kind: "warning_safe";
      actor_id: string;
      actor_name: string;
      actor_is_ally: false;
      variant_name: string;
      target_row: "front" | "rear";
      turn: number;
      message: string;
    }
  | { kind: "turn_banner"; turn: number; message: string }
  | { kind: "system"; message: string };

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
