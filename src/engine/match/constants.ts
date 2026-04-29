export const MATCH_CONSTANTS = {
  // === 投球 ===
  FASTBALL_BASE_RATIO: 0.40,
  // v0.40.0: 0.745 → 0.68（投手が積極的にゾーンを攻めすぎていたのを緩和、四球率向上）
  STRIKE_ZONE_TARGET_BASE: 0.68,
  CONTROL_ERROR_SCALE: 2.0,

  // === 打撃 ===
  // R8-3: 接触率を 0.85 → 0.81 に調整（三振率 18-25% の目標へ）
  // 0.80 だと打率 0.232 と低すぎた、0.81 で 0.245 程度に
  BASE_CONTACT_RATE: 0.81,       // R8-3: 0.85 → 0.81
  BREAK_CONTACT_PENALTY: 0.04,   // R8-3: was 0.03 → 0.04（変化球ペナルティ強化）
  VELOCITY_CONTACT_PENALTY: 0.0015,
  FAIR_BASE_RATE: 0.54,
  TECHNIQUE_FAIR_BONUS: 0.15,    // was 0.25

  // === 打球 ===
  // R8-3: HR距離調整
  // 目標 HR/試合 = 0.4-1.5
  // 旧 105m → 95m（少し下げてHRが若干出るように）
  HOME_RUN_DISTANCE: 95,         // R8-3: 105 → 95m
  FLY_MAX_DISTANCE: 130,

  // === 守備 ===
  // R8-3: エラー率を上げて 0.3-1.0/試合 の目標範囲へ
  // 旧 GROUND_OUT_BASE=0.55 → 0.50（ゴロのヒット率 UP、エラー機会も増加）
  // 旧 ERROR_POPUP_RATE=0.03 → 0.06（ポップフライのエラー率を現実的に）
  FLY_CATCH_BASE: 0.80,          // 据え置き（フライのヒット率）
  GROUND_OUT_BASE: 0.50,         // was 0.55 (R8-3: ゴロアウト率を下げてエラー機会増)
  DOUBLE_PLAY_BASE: 0.25,
  ERROR_POPUP_RATE: 0.06,        // was 0.03 (R8-3: ポップフライエラー率 UP)

  // === 投手スタミナ ===
  STAMINA_PER_PITCH_BASE: 1.0,
  STAMINA_VELOCITY_LOW: 0.85,
  STAMINA_BREAK_LOW: 0.70,

  // === 自信 ===
  CONFIDENCE_HIT_GAIN: 10,
  CONFIDENCE_HR_GAIN: 20,
  CONFIDENCE_WALK_GAIN: 5,
  CONFIDENCE_STRIKEOUT_LOSS: -8,
  CONFIDENCE_POPUP_LOSS: -3,
  CONFIDENCE_DP_LOSS: -10,
  CONFIDENCE_CLUTCH_FAIL_LOSS: -12,

  CONFIDENCE_PITCHER_K_GAIN: 5,
  CONFIDENCE_PITCHER_OUT_GAIN: 2,
  CONFIDENCE_PITCHER_HIT_LOSS: -5,
  CONFIDENCE_PITCHER_HR_LOSS: -15,
  CONFIDENCE_PITCHER_WALK_LOSS: -8,
  CONFIDENCE_PITCHER_CLEAN_INNING: 8,

  // === プレッシャー ===
  PRESSURE_SCORING_POS: 20,
  PRESSURE_CLOSE_GAME: 15,
  PRESSURE_LATE_INNING: 10,
  PRESSURE_NINTH: 20,
  PRESSURE_KOSHIEN: 15,
  PRESSURE_BASES_LOADED: 10,

  // === サイン ===
  SIGN_COMPLIANCE_BASE: 0.90,

  // === 試合設定 ===
  DEFAULT_INNINGS: 9,
  DEFAULT_MAX_EXTRAS: 3,
  MOUND_VISIT_LIMIT: 3,
  MOUND_VISIT_CONFIDENCE_GAIN: 15,

  // === HBP ===
  HIT_BY_PITCH_BASE_RATE: 0.008,
} as const;
