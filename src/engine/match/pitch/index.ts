/**
 * match/pitch/ — 1球処理の責務分割モジュール
 *
 * 各モジュールの責務:
 * - select-pitch.ts: 球種・コース選択
 * - control-error.ts: 制球誤差適用
 * - batter-action.ts: 打者の反応決定
 * - swing-result.ts: スイング結果（空振り/ファウル/インプレー判定）
 * - bat-contact.ts: 打球生成（打球種類・方向・速度・飛距離）
 * - field-result.ts: 守備結果の判定
 * - process-pitch.ts: オーケストレーター（上記を順に呼ぶ）
 */

export {
  selectPitch,
  type SelectPitchResult,
} from './select-pitch';

export {
  applyControlError,
} from './control-error';

export {
  decideBatterAction,
} from './batter-action';

export {
  calculateSwingResult,
  type SwingResultDetail,
} from './swing-result';

export {
  generateBatContact,
} from './bat-contact';

export {
  resolveFieldResult,
  getNearestFielder,
} from './field-result';

export {
  processPitch,
  getEffectivePitcherParams,
  getEffectiveBatterParams,
} from './process-pitch';
