'use client';

/**
 * useSound.ts — v0.34.0
 *
 * 効果音の再生とユーザー設定（音量・ミュート）を管理するフック。
 *
 * 設計方針:
 *   - AudioBuffer を使わず HTML5 Audio 要素でシンプルに実装
 *   - 同時再生のため Audio オブジェクトを clone して使う
 *   - 音量・ミュート状態は LocalStorage に永続化
 *   - サウンドファイルは public/sounds/generated/ 配下に配置
 *   - 後で差し替える場合は同名ファイルで上書きすれば即反映
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================
// サウンド定義
// ============================================================

/** サウンドIDと物理ファイルパスの対応表 */
const SOUND_FILES = {
  // バット金属音 5段階（当たりの強さ）
  bat_metal_lv1: '/sounds/generated/bat_metal_lv1.mp3',
  bat_metal_lv2: '/sounds/generated/bat_metal_lv2.mp3',
  bat_metal_lv3: '/sounds/generated/bat_metal_lv3.mp3',
  bat_metal_lv4: '/sounds/generated/bat_metal_lv4.mp3',
  bat_metal_lv5: '/sounds/generated/bat_metal_lv5.mp3',
  // バント音
  bat_bunt: '/sounds/generated/bat_bunt.mp3',
  // 投球音
  pitch_throw: '/sounds/generated/pitch_throw.mp3',
  // キャッチャー捕球音 5段階（球速）
  catch_lv1: '/sounds/generated/catch_lv1.mp3',
  catch_lv2: '/sounds/generated/catch_lv2.mp3',
  catch_lv3: '/sounds/generated/catch_lv3.mp3',
  catch_lv4: '/sounds/generated/catch_lv4.mp3',
  catch_lv5: '/sounds/generated/catch_lv5.mp3',
} as const;

export type SoundId = keyof typeof SOUND_FILES;

// ============================================================
// LocalStorage キー
// ============================================================

const STORAGE_KEY = 'koushien-sound-settings';

interface SoundSettings {
  /** マスター音量 (0.0 - 1.0) */
  volume: number;
  /** ミュート状態 */
  muted: boolean;
}

const DEFAULT_SETTINGS: SoundSettings = {
  volume: 0.6,
  muted: false,
};

function loadSettings(): SoundSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_SETTINGS.volume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: SoundSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // noop
  }
}

// ============================================================
// サウンドマッピングヘルパー
// ============================================================

/**
 * 打球の強さから 1-5 のレベルを算出する。
 *
 * @param speed 打球速度区分 ('weak' | 'normal' | 'hard' | 'bullet')
 * @param contactType 打球種別 ('ground_ball' | 'line_drive' | 'fly_ball' | 'popup' | 'bunt_ground')
 */
export function hitContactToBatSoundId(
  speed: 'weak' | 'normal' | 'hard' | 'bullet',
  contactType: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup' | 'bunt_ground',
): SoundId {
  // バント系は専用音
  if (contactType === 'bunt_ground') return 'bat_bunt';

  // speed ベースでレベル決定、contactType で微調整
  const base: Record<typeof speed, number> = {
    weak: 1,
    normal: 3,
    hard: 4,
    bullet: 5,
  };
  let level = base[speed];

  // popup（凡フライ・ポップアップ）は 1段階下げる
  if (contactType === 'popup') level = Math.max(1, level - 1);
  // line_drive + hard 以上は 1段階上げる
  if (contactType === 'line_drive' && (speed === 'hard' || speed === 'bullet')) {
    level = Math.min(5, level + 0);
  }

  const clamped = Math.max(1, Math.min(5, level));
  return `bat_metal_lv${clamped}` as SoundId;
}

/**
 * 球速（km/h）から捕球音のレベル 1-5 を算出する。
 *
 * @param speedKmh 球速
 */
export function pitchSpeedToCatchSoundId(speedKmh: number): SoundId {
  // 110km/h 未満: Lv1 / 120km/h: Lv2 / 130km/h: Lv3 / 140km/h: Lv4 / 150km/h 以上: Lv5
  let level: number;
  if (speedKmh < 110) level = 1;
  else if (speedKmh < 120) level = 2;
  else if (speedKmh < 130) level = 3;
  else if (speedKmh < 140) level = 4;
  else level = 5;
  return `catch_lv${level}` as SoundId;
}

// ============================================================
// メインフック
// ============================================================

export interface UseSoundReturn {
  /** 音量 (0-1) */
  volume: number;
  /** ミュート状態 */
  muted: boolean;
  /** 音量を設定 */
  setVolume: (v: number) => void;
  /** ミュート切替 */
  toggleMuted: () => void;
  /** 効果音を再生 */
  play: (id: SoundId, options?: { volume?: number }) => void;
}

/**
 * 効果音フック
 *
 * 使用例:
 * ```tsx
 * const sound = useSound();
 * sound.play('bat_metal_lv3');
 * sound.play('catch_lv5', { volume: 0.8 });
 * ```
 */
export function useSound(): UseSoundReturn {
  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SETTINGS);
  // Audio 要素プール（id → Audio） -- preload 用
  const audioPoolRef = useRef<Map<SoundId, HTMLAudioElement>>(new Map());

  // 初期ロード（クライアント側のみ）
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // サウンドファイルをプリロード
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pool = audioPoolRef.current;
    (Object.keys(SOUND_FILES) as SoundId[]).forEach((id) => {
      if (!pool.has(id)) {
        const audio = new Audio(SOUND_FILES[id]);
        audio.preload = 'auto';
        pool.set(id, audio);
      }
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setSettings((prev) => {
      const next = { ...prev, volume: clamped };
      saveSettings(next);
      return next;
    });
  }, []);

  const toggleMuted = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, muted: !prev.muted };
      saveSettings(next);
      return next;
    });
  }, []);

  // 最新の settings を ref に保持（play() から参照）
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const play = useCallback((id: SoundId, options?: { volume?: number }) => {
    if (typeof window === 'undefined') return;
    const cur = settingsRef.current;
    if (cur.muted || cur.volume <= 0) return;

    const src = SOUND_FILES[id];
    if (!src) return;

    // 重複再生のため Audio を都度新規作成（プールから src だけ取得）
    try {
      const audio = new Audio(src);
      const opt = options?.volume ?? 1;
      audio.volume = Math.max(0, Math.min(1, cur.volume * opt));
      void audio.play().catch(() => {
        // Autoplay ブロック等でエラーになっても握りつぶす（ユーザー操作後に再生される）
      });
    } catch {
      // noop
    }
  }, []);

  return useMemo(
    () => ({
      volume: settings.volume,
      muted: settings.muted,
      setVolume,
      toggleMuted,
      play,
    }),
    [settings.volume, settings.muted, setVolume, toggleMuted, play],
  );
}
