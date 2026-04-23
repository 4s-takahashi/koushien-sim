'use client';

/**
 * SoundControl.tsx — v0.34.0
 *
 * 画面右上に固定表示される効果音コントロールパネル。
 *  - 🔊 アイコン: ポップオーバーを開閉（ミュート時は 🔇）
 *  - ポップオーバー内: ミュートトグル + 音量スライダー
 */

import { useState, useEffect, useRef } from 'react';
import styles from './soundControl.module.css';

interface SoundControlProps {
  volume: number;
  muted: boolean;
  onSetVolume: (v: number) => void;
  onToggleMuted: () => void;
}

export function SoundControl({ volume, muted, onSetVolume, onToggleMuted }: SoundControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 外部クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const icon = muted || volume === 0 ? '🔇' : volume < 0.34 ? '🔈' : volume < 0.67 ? '🔉' : '🔊';
  const percent = Math.round(volume * 100);

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={`${styles.trigger} ${muted ? styles.triggerMuted : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="効果音設定"
        title={muted ? '効果音: ミュート中' : `効果音: ${percent}%`}
      >
        <span className={styles.triggerIcon}>{icon}</span>
      </button>

      {open && (
        <div className={styles.popover}>
          <div className={styles.popoverHeader}>効果音</div>

          <button
            type="button"
            className={styles.muteButton}
            onClick={onToggleMuted}
          >
            {muted ? '🔇 ミュート中（タップで解除）' : '🔊 ON（タップでミュート）'}
          </button>

          <div className={styles.volumeRow}>
            <span className={styles.volumeLabel}>音量</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(volume * 100)}
              onChange={(e) => onSetVolume(Number(e.target.value) / 100)}
              className={styles.volumeSlider}
              disabled={muted}
            />
            <span className={styles.volumePercent}>{percent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
