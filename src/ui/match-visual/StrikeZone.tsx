'use client';
/**
 * Phase 12-A/B: ストライクゾーン SVG コンポーネント
 *
 * 3×3 グリッドに投球マーカー（◯/△）を表示する
 * - ◯: ストレート系
 * - △: 変化球系（頂点が変化方向を向く）
 * - 色分け: ストライク=赤、ボール=緑、ファウル=灰、インプレー=黄
 * - 番号表示（①②③...）
 */

import React, { useEffect, useRef, useState } from 'react';
import type { AtBatMarkerHistory, PitchMarker, SwingMarker } from './pitch-marker-types';
import styles from './StrikeZone.module.css';

interface StrikeZoneProps {
  history: AtBatMarkerHistory;
  className?: string;
}

// SVG ビューボックスサイズ
const ZONE_SVG_W = 300;
const ZONE_SVG_H = 260;

// ストライクゾーン境界（ピクセル）
const ZONE = {
  left: 60,
  right: 240,
  top: 40,
  bottom: 220,
};

// マーカー描画エリア（ゾーン外ボールも含む）
const DRAW = {
  left: 20,
  right: 280,
  top: 10,
  bottom: 250,
};

/** UV座標 → SVG座標 */
function uvToSvg(uvX: number, uvY: number): { x: number; y: number } {
  return {
    x: DRAW.left + uvX * (DRAW.right - DRAW.left),
    y: DRAW.top + uvY * (DRAW.bottom - DRAW.top),
  };
}

/** 結果 → マーカー色 */
function resultToColor(result: PitchMarker['result']): string {
  switch (result) {
    case 'strike':
      return '#ef5350';
    case 'ball':
      return '#66bb6a';
    case 'foul':
      return '#78909c';
    case 'in_play':
      return '#ffd54f';
  }
}

/** スイング結果 → マーカー色 */
function swingResultToColor(swingResult: SwingMarker['swingResult']): string {
  switch (swingResult) {
    case 'in_play':
      return '#ffd54f';
    case 'foul':
      return '#78909c';
    case 'miss':
      return '#455a64';
  }
}

// ===== サブコンポーネント =====

/** 3×3 グリッド */
function StrikeZoneGrid(): React.ReactElement {
  const cellW = (ZONE.right - ZONE.left) / 3;
  const cellH = (ZONE.bottom - ZONE.top) / 3;

  return (
    <g>
      {/* 外枠 */}
      <rect
        x={ZONE.left}
        y={ZONE.top}
        width={ZONE.right - ZONE.left}
        height={ZONE.bottom - ZONE.top}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.5}
      />
      {/* 縦線 */}
      {[1, 2].map((i) => (
        <line
          key={`v${i}`}
          x1={ZONE.left + cellW * i}
          y1={ZONE.top}
          x2={ZONE.left + cellW * i}
          y2={ZONE.bottom}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />
      ))}
      {/* 横線 */}
      {[1, 2].map((i) => (
        <line
          key={`h${i}`}
          x1={ZONE.left}
          y1={ZONE.top + cellH * i}
          x2={ZONE.right}
          y2={ZONE.top + cellH * i}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />
      ))}
      {/* ラベル */}
      <text x={ZONE.left - 4} y={ZONE.top + 10} fontSize={9} fill="#607d8b" textAnchor="end">高</text>
      <text x={ZONE.left - 4} y={ZONE.bottom - 2} fontSize={9} fill="#607d8b" textAnchor="end">低</text>
      <text x={ZONE.left + 12} y={ZONE.top - 5} fontSize={9} fill="#607d8b">内</text>
      <text x={ZONE.right - 12} y={ZONE.top - 5} fontSize={9} fill="#607d8b" textAnchor="end">外</text>
    </g>
  );
}

/** ◯ マーカー（ストレート系） */
function CircleMarker({
  cx,
  cy,
  color,
  seq,
  opacity,
  isNew,
}: {
  cx: number;
  cy: number;
  color: string;
  seq: number;
  opacity: number;
  isNew: boolean;
}): React.ReactElement {
  return (
    <g opacity={opacity}>
      <circle
        cx={cx}
        cy={cy}
        r={11}
        fill={color}
        fillOpacity={0.25}
        stroke={color}
        strokeWidth={2}
        className={isNew ? styles.markerScaleIn : undefined}
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize={9}
        fill={color}
        fontWeight="bold"
      >
        {seq}
      </text>
    </g>
  );
}

/** △ マーカー（変化球系） */
function TriangleMarker({
  cx,
  cy,
  breakDir,
  color,
  seq,
  opacity,
  isNew,
}: {
  cx: number;
  cy: number;
  breakDir: { dx: number; dy: number } | null;
  color: string;
  seq: number;
  opacity: number;
  isNew: boolean;
}): React.ReactElement {
  const R = 11; // 外接円半径

  // 変化方向 or デフォルト（上向き）
  const angle =
    breakDir
      ? Math.atan2(breakDir.dy, breakDir.dx)
      : -Math.PI / 2; // デフォルト: 上

  // 三角形の3頂点（先端が変化方向を向く）
  const pts = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((offset) => {
    const a = angle + offset;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });

  const pointsStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <g opacity={opacity}>
      <polygon
        points={pointsStr}
        fill={color}
        fillOpacity={0.25}
        stroke={color}
        strokeWidth={2}
        className={isNew ? styles.markerScaleIn : undefined}
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize={9}
        fill={color}
        fontWeight="bold"
      >
        {seq}
      </text>
    </g>
  );
}

/** バットスイング位置マーカー */
function SwingMarkerSvg({ marker }: { marker: SwingMarker }): React.ReactElement {
  const { x: svgX, y: svgY } = uvToSvg(marker.position.x, marker.position.y);
  const color = swingResultToColor(marker.swingResult);

  return (
    <rect
      x={svgX - 9}
      y={svgY - 5}
      width={18}
      height={10}
      rx={2}
      fill={color}
      fillOpacity={0.35}
      stroke={color}
      strokeWidth={1.5}
      strokeDasharray="3 2"
    />
  );
}

/** 投球マーカー（◯ or △）を描画 */
function PitchMarkerSvg({
  marker,
  isNew,
}: {
  marker: PitchMarker;
  isNew: boolean;
}): React.ReactElement {
  const { x: svgX, y: svgY } = uvToSvg(marker.position.x, marker.position.y);
  const color = resultToColor(marker.result);

  if (marker.pitchClass === 'fastball') {
    return (
      <CircleMarker
        cx={svgX}
        cy={svgY}
        color={color}
        seq={marker.seq}
        opacity={marker.opacity}
        isNew={isNew}
      />
    );
  }

  return (
    <TriangleMarker
      cx={svgX}
      cy={svgY}
      breakDir={marker.breakDirection}
      color={color}
      seq={marker.seq}
      opacity={marker.opacity}
      isNew={isNew}
    />
  );
}

// ===== メインコンポーネント =====

export function StrikeZone({
  history,
  className,
}: StrikeZoneProps): React.ReactElement {
  // 最新マーカーのシーケンス番号（スケールインアニメーション用）
  const [latestSeq, setLatestSeq] = useState<number>(-1);
  const prevLengthRef = useRef<number>(history.pitchMarkers.length);

  useEffect(() => {
    const currentLength = history.pitchMarkers.length;
    if (currentLength > prevLengthRef.current) {
      const newest = history.pitchMarkers[currentLength - 1];
      if (newest) {
        setLatestSeq(newest.seq);
        // アニメーション後にリセット
        const timer = setTimeout(() => setLatestSeq(-1), 600);
        return () => clearTimeout(timer);
      }
    }
    prevLengthRef.current = currentLength;
  }, [history.pitchMarkers]);

  return (
    <div className={[styles.strikeZoneContainer, className].filter(Boolean).join(' ')}>
      <svg
        viewBox={`0 0 ${ZONE_SVG_W} ${ZONE_SVG_H}`}
        className={styles.strikeZoneSvg}
        role="img"
        aria-label="ストライクゾーン"
      >
        {/* 背景 */}
        <rect
          x={0}
          y={0}
          width={ZONE_SVG_W}
          height={ZONE_SVG_H}
          fill="rgba(10,22,40,0.9)"
          rx={4}
        />

        {/* 3×3 グリッド */}
        <StrikeZoneGrid />

        {/* スイング位置マーカー（最背面） */}
        {history.swingMarker && (
          <SwingMarkerSvg marker={history.swingMarker} />
        )}

        {/* 投球マーカー（古い順に描画し、新しいもので上書き） */}
        {history.pitchMarkers.map((m) => (
          <PitchMarkerSvg
            key={`${m.seq}`}
            marker={m}
            isNew={m.seq === latestSeq}
          />
        ))}
      </svg>

      {/* 凡例 */}
      <div className={styles.legend} aria-label="凡例">
        <span className={styles.legendStrike}>◯/△ ストライク</span>
        <span className={styles.legendBall}>◯/△ ボール</span>
        <span className={styles.legendFoul}>□ スイング位置</span>
      </div>
    </div>
  );
}
