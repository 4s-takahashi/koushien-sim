/**
 * Phase 12-B: 試合ビジュアルストア
 *
 * ストライクゾーンマーカーの状態管理
 * - 打席内の投球マーカー履歴
 * - バットスイング位置マーカー
 * - 打者交代時にリセット
 *
 * ※ localStorage に保存しない（セッション限定）
 */

import { create } from 'zustand';
import type { PitchMarker, SwingMarker } from '../ui/match-visual/pitch-marker-types';

export interface MatchVisualState {
  /** 現在打席のマーカー（最大10球） */
  currentAtBatMarkers: PitchMarker[];
  /** 現在のスイング位置マーカー */
  swingMarker: SwingMarker | null;
  /** 前打席のマーカー（次打席の参考用） */
  prevAtBatMarkers: PitchMarker[];
  /** ハイライトセル（ホバー等） */
  highlightedCell: { row: number; col: number } | null;
}

export interface MatchVisualActions {
  /** 投球マーカーを追加 */
  addPitchMarker: (marker: Omit<PitchMarker, 'seq' | 'opacity'>) => void;
  /** スイング位置マーカーを設定 */
  setSwingMarker: (marker: SwingMarker) => void;
  /** 打者交代時に現打席をクリア、前打席履歴として保存 */
  clearForNextBatter: () => void;
  /** 試合リセット時に全クリア */
  resetVisual: () => void;
}

type MatchVisualStore = MatchVisualState & MatchVisualActions;

const INITIAL_STATE: MatchVisualState = {
  currentAtBatMarkers: [],
  swingMarker: null,
  prevAtBatMarkers: [],
  highlightedCell: null,
};

export const useMatchVisualStore = create<MatchVisualStore>()((set, get) => ({
  ...INITIAL_STATE,

  addPitchMarker: (rawMarker) => {
    const { currentAtBatMarkers } = get();
    const seq = currentAtBatMarkers.length + 1;

    // 古いマーカーを薄くする
    const updated = currentAtBatMarkers.map((m, i) => ({
      ...m,
      opacity: Math.max(0.3, 1 - (currentAtBatMarkers.length - i) * 0.12),
    }));

    const newMarker: PitchMarker = {
      ...rawMarker,
      seq,
      opacity: 1.0,
    };

    // 最大10球まで保持
    set({
      currentAtBatMarkers: [...updated, newMarker].slice(-10),
    });
  },

  setSwingMarker: (marker) => set({ swingMarker: marker }),

  clearForNextBatter: () => {
    const { currentAtBatMarkers } = get();
    set({
      prevAtBatMarkers: currentAtBatMarkers,
      currentAtBatMarkers: [],
      swingMarker: null,
    });
  },

  resetVisual: () => set({ ...INITIAL_STATE }),
}));
