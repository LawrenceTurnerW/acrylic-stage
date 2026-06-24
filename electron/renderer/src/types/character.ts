// バックエンド /characters /stage のレスポンス型。
// SPEC.md と backend/config/*.yaml の構造に対応している。

export type UnitId = "RouteHeart" | "REGALILIA" | "Sputrip";

export type AttributeId =
  | "light"
  | "sound"
  | "fire"
  | "dark"
  | "ice"
  | "wind"
  | "water";

export type PositionPreference = "front" | "rear" | "either" | "front_risk";

export type RowId = "front" | "rear";

export type Unit = {
  display_name: string;
  display_name_jp: string;
  genre: string;
  icon: string;
  role_tendency: string;
};

export type Attribute = {
  display: string;
  icon: string;
  color: string;
};

export type Condition = {
  id: string;
  display: string;
  icon: string;
  probability: number;
  attack_multiplier: number;
  gauge_multiplier: number;
  skip_chance: number;
};

// 必殺技の効果は kind ごとに異なる payload を持つ。データ駆動の体裁を保つため
// unknown フィールドは Record<string, unknown> で受け、UI 側は description で
// 表現する(SPEC §5)。
export type UltimateEffect = {
  kind: string;
  [k: string]: unknown;
};

export type Ultimate = {
  name: string;
  type: string;
  description: string;
  effects: UltimateEffect[];
};

export type Character = {
  id: string;
  name: string;
  aruco_marker_id: number;
  unit: UnitId;
  attribute: AttributeId;
  personal_color: string;
  role: string;
  role_description: string;
  stats: {
    attack: number;
    defense: number;
    speed: number;
  };
  position_preference: PositionPreference;
  ultimate: Ultimate;
  voice_style: string;
  condition?: Condition;
  // /assets/characters/{id}.png の相対パス、ファイルが無い場合は null
  // (frontend で API_BASE を prepend して使う、404 時はフォールバック表示)
  cast_image_url?: string | null;
};

export type CharactersResponse = {
  characters: Character[];
  units: Record<UnitId, Unit>;
  attributes: Record<AttributeId, Attribute>;
  stat_to_stars: {
    attack: Record<string, number>;
    defense: Record<string, number>;
    speed: Record<string, number>;
  };
  conditions: Condition[];
  position_modifiers: Record<string, unknown>;
  base_params: Record<string, number>;
};

export type StageEnemy = {
  id: string;
  type: string;
  position: string;
  is_boss?: boolean;
};

export type Stage = {
  id: string;
  name: string;
  description: string;
  recommended_attributes: AttributeId[];
  expected_turn_count?: string;
  reward_message?: string;
  theme: {
    background?: string;
    bgm?: string | null;
    accent_color?: string;
  };
  enemies: StageEnemy[];
  victory_condition: string;
  defeat_condition: string;
};

export type StageResponse = {
  current: Stage | null;
  enemy_types: Record<string, unknown>;
  warning_attack_defaults: Record<string, unknown>;
};
