'use client';

/**
 * DetailedOrderModal.tsx
 *
 * Phase 7-C: 詳細采配モーダル
 * 打者向け: コース狙い・球種狙い・積極性
 * 投手向け: 配球・球種比率・内角攻め
 */

import { useState } from 'react';
import type {
  TacticalOrder,
  BatterFocusArea,
  BatterPitchType,
  PitcherFocusArea,
  PitcherPitchMix,
} from '../../../../engine/match/types';
import styles from './detailedOrderModal.module.css';

// ============================================================
// 型
// ============================================================

interface DetailedOrderModalProps {
  /** 打者への指示か投手への指示か */
  mode: 'batter' | 'pitcher';
  /** モーダルを閉じるコールバック */
  onClose: () => void;
  /** 指示を確定するコールバック */
  onApply: (order: TacticalOrder) => void;
}

// ============================================================
// オプション定義
// ============================================================

const BATTER_FOCUS_AREAS: { value: BatterFocusArea | 'any'; label: string }[] = [
  { value: 'outside', label: '外角' },
  { value: 'inside', label: '内角' },
  { value: 'low', label: '低め' },
  { value: 'high', label: '高め' },
  { value: 'middle', label: '真ん中' },
  { value: 'any', label: '任せる' },
];

const BATTER_PITCH_TYPES: { value: BatterPitchType; label: string }[] = [
  { value: 'fastball', label: '速球狙い' },
  { value: 'breaking', label: '変化球狙い' },
  { value: 'offspeed', label: '緩い球狙い' },
  { value: 'any', label: '任せる' },
];

const AGGRESSIVENESS: { value: 'passive' | 'normal' | 'aggressive'; label: string; desc: string }[] = [
  { value: 'passive', label: '消極的', desc: '四球を選ぶ' },
  { value: 'normal', label: '普通', desc: '状況に応じて' },
  { value: 'aggressive', label: '積極的', desc: '積極的に振る' },
];

const PITCHER_FOCUS_AREAS: { value: PitcherFocusArea | 'any'; label: string }[] = [
  { value: 'outside', label: '外角中心' },
  { value: 'inside', label: '内角中心' },
  { value: 'low', label: '低め' },
  { value: 'high', label: '高め' },
  { value: 'edge', label: 'コーナー攻め' },
  { value: 'any', label: '任せる' },
];

const PITCHER_PITCH_MIXES: { value: PitcherPitchMix; label: string; desc: string }[] = [
  { value: 'fastball_heavy', label: '速球多め', desc: 'ストレート中心' },
  { value: 'breaking_heavy', label: '変化球多め', desc: '変化球を多用' },
  { value: 'balanced', label: 'バランス', desc: '状況に応じて' },
];

const INTIMIDATION: { value: 'brush_back' | 'normal'; label: string; desc: string }[] = [
  { value: 'normal', label: '通常', desc: '普通の内角攻め' },
  { value: 'brush_back', label: 'ブラッシュバック', desc: '積極的内角攻め' },
];

// ============================================================
// 打者向けフォーム
// ============================================================

function BatterForm({ onApply, onClose }: {
  onApply: (order: TacticalOrder) => void;
  onClose: () => void;
}) {
  const [focusArea, setFocusArea] = useState<BatterFocusArea | 'any'>('any');
  const [pitchType, setPitchType] = useState<BatterPitchType>('any');
  const [aggressiveness, setAggressiveness] = useState<'passive' | 'normal' | 'aggressive'>('normal');

  const handleApply = () => {
    const order: TacticalOrder = {
      type: 'batter_detailed',
      focusArea: focusArea === 'any' ? undefined : focusArea,
      pitchType: pitchType === 'any' ? undefined : pitchType,
      aggressiveness,
    };
    onApply(order);
    onClose();
  };

  return (
    <div className={styles.form}>
      {/* 狙うコース */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>狙うコース</div>
        <div className={styles.radioGroup}>
          {BATTER_FOCUS_AREAS.map((opt) => (
            <label key={opt.value} className={`${styles.radioLabel} ${focusArea === opt.value ? styles.radioLabelActive : ''}`}>
              <input
                type="radio"
                name="focusArea"
                value={opt.value}
                checked={focusArea === opt.value}
                onChange={() => setFocusArea(opt.value as BatterFocusArea | 'any')}
                className={styles.radioInput}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* 狙う球種 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>狙う球種</div>
        <div className={styles.radioGroup}>
          {BATTER_PITCH_TYPES.map((opt) => (
            <label key={opt.value} className={`${styles.radioLabel} ${pitchType === opt.value ? styles.radioLabelActive : ''}`}>
              <input
                type="radio"
                name="pitchType"
                value={opt.value}
                checked={pitchType === opt.value}
                onChange={() => setPitchType(opt.value)}
                className={styles.radioInput}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* 積極性 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>積極性</div>
        <div className={styles.radioGroup}>
          {AGGRESSIVENESS.map((opt) => (
            <label key={opt.value} className={`${styles.radioLabel} ${aggressiveness === opt.value ? styles.radioLabelActive : ''}`}>
              <input
                type="radio"
                name="aggressiveness"
                value={opt.value}
                checked={aggressiveness === opt.value}
                onChange={() => setAggressiveness(opt.value)}
                className={styles.radioInput}
              />
              <span>{opt.label}</span>
              <span className={styles.optDesc}>{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.formBtns}>
        <button className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
        <button className={styles.applyBtn} onClick={handleApply}>指示を出す</button>
      </div>
    </div>
  );
}

// ============================================================
// 投手向けフォーム
// ============================================================

function PitcherForm({ onApply, onClose }: {
  onApply: (order: TacticalOrder) => void;
  onClose: () => void;
}) {
  const [focusArea, setFocusArea] = useState<PitcherFocusArea | 'any'>('any');
  const [pitchMix, setPitchMix] = useState<PitcherPitchMix>('balanced');
  const [intimidation, setIntimidation] = useState<'brush_back' | 'normal'>('normal');

  const handleApply = () => {
    const order: TacticalOrder = {
      type: 'pitcher_detailed',
      focusArea: focusArea === 'any' ? undefined : focusArea,
      pitchMix: pitchMix === 'balanced' ? undefined : pitchMix,
      intimidation: intimidation === 'normal' ? undefined : intimidation,
    };
    onApply(order);
    onClose();
  };

  return (
    <div className={styles.form}>
      {/* 配球コース */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>配球コース</div>
        <div className={styles.radioGroup}>
          {PITCHER_FOCUS_AREAS.map((opt) => (
            <label key={opt.value} className={`${styles.radioLabel} ${focusArea === opt.value ? styles.radioLabelActive : ''}`}>
              <input
                type="radio"
                name="pitcherFocusArea"
                value={opt.value}
                checked={focusArea === opt.value}
                onChange={() => setFocusArea(opt.value as PitcherFocusArea | 'any')}
                className={styles.radioInput}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* 球種比率 */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>球種比率</div>
        <div className={styles.radioGroup}>
          {PITCHER_PITCH_MIXES.map((opt) => (
            <label key={opt.value} className={`${styles.radioLabel} ${pitchMix === opt.value ? styles.radioLabelActive : ''}`}>
              <input
                type="radio"
                name="pitchMix"
                value={opt.value}
                checked={pitchMix === opt.value}
                onChange={() => setPitchMix(opt.value)}
                className={styles.radioInput}
              />
              <span>{opt.label}</span>
              <span className={styles.optDesc}>{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 内角攻め */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>威嚇</div>
        <div className={styles.radioGroup}>
          {INTIMIDATION.map((opt) => (
            <label key={opt.value} className={`${styles.radioLabel} ${intimidation === opt.value ? styles.radioLabelActive : ''}`}>
              <input
                type="radio"
                name="intimidation"
                value={opt.value}
                checked={intimidation === opt.value}
                onChange={() => setIntimidation(opt.value)}
                className={styles.radioInput}
              />
              <span>{opt.label}</span>
              <span className={styles.optDesc}>{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.formBtns}>
        <button className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
        <button className={`${styles.applyBtn} ${styles.applyBtnPitcher}`} onClick={handleApply}>指示を出す</button>
      </div>
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================

export function DetailedOrderModal({ mode, onClose, onApply }: DetailedOrderModalProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>{mode === 'batter' ? '⚾' : '🎯'}</span>
          <div className={styles.headerText}>
            <div className={styles.headerTitle}>
              {mode === 'batter' ? '打者への詳細指示' : '投手への詳細指示'}
            </div>
            <div className={styles.headerSub}>
              {mode === 'batter' ? 'コース・球種・積極性を指定します' : '配球・球種比率・内角攻めを指定します'}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {mode === 'batter' ? (
          <BatterForm onApply={onApply} onClose={onClose} />
        ) : (
          <PitcherForm onApply={onApply} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
