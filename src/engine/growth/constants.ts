export const GROWTH_CONSTANTS = {
  // 能力値範囲
  STAT_MIN: 1,
  STAT_MAX: 100,
  VELOCITY_MIN: 80,
  VELOCITY_MAX: 160,
  PITCH_LEVEL_MIN: 1,
  PITCH_LEVEL_MAX: 7,

  // 成長
  RANDOM_VARIANCE_MIN: 0.7,
  RANDOM_VARIANCE_MAX: 1.3,

  // コンディション
  FATIGUE_MAX: 100,
  FATIGUE_NATURAL_RECOVERY: 8,
  FATIGUE_REST_RECOVERY: 20,

  // 怪我
  INJURY_BASE_RATE: 0.002,
  INJURY_DURATION: {
    minor: { min: 3, max: 7 },
    moderate: { min: 14, max: 30 },
    severe: { min: 30, max: 90 },
  },

  // 練習倍率
  CAMP_MULTIPLIER: 1.5,
  MATCH_GROWTH_MULTIPLIER: 2.0,
} as const;
