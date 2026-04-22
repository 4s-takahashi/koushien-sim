'use client';
/**
 * Phase 12-A/B: ストライクゾーン SVG コンポーネント
 *
 * 3×3 グリッドに投球マーカー（◯/△）を表示する
 * - ◯: ストレート系
 * - △: 変化球系（頂点が変化方向を向く）
 * - 色分け: ストライク=赤、ボール=緑、ファウル=灰、インプレー=黄
 * - 番号表示（①②③...）
 *
 * Phase 12-G 追加:
 * - 投球軌道アニメーション: リリース瞬間に白い ◯ が出現し、着弾点まで移動
 * - 変化球: breakDirection に応じて軌道が曲がる
 * - ストレート（高速）: 微妙にホップする
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
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

// ===== Phase 12-G: 投球軌道アニメーション =====

/** 投球ボールアニメーション状態 */
interface PitchBallState {
  /** 現在のSVG座標 */
  x: number;
  y: number;
  /** アニメーション進行度 (0-1) */
  progress: number;
  /** 着弾点 */
  targetX: number;
  targetY: number;
  /** 開始点 */
  startX: number;
  startY: number;
  /** 変化方向 */
  breakDir: { dx: number; dy: number } | null;
  /** ストレート系か */
  isFastball: boolean;
}

/** 投球軌道のアニメーション時間 (ms) */
const PITCH_TRAJ_DURATION = 380;

/**
 * 投球軌道上の座標を計算する
 *
 * @param startX 開始SVG X
 * @param startY 開始SVG Y
 * @param endX 着弾SVG X
 * @param endY 着弾SVG Y
 * @param breakDir 変化方向 (dx>0=右, dy>0=下)
 * @param isFastball ストレート系か（ホップ演出用）
 * @param t 進行度 (0-1)
 */
export function computePitchTrajPos(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  breakDir: { dx: number; dy: number } | null,
  isFastball: boolean,
  t: number,
): { x: number; y: number } {
  // イーズイン（投球は加速して来る）
  const eased = t * t;

  // 基本軌跡: 始点 → 着弾点への直線補間
  const bx = startX + (endX - startX) * eased;
  const by = startY + (endY - startY) * eased;

  // 変化量オフセット（放物線的に中間で最大、着弾点でほぼ0に収束）
  // sin(π*t) でt=0.5が最大、t=0,1でゼロ
  const curveFactor = Math.sin(Math.PI * t);

  // 変化球の曲がり: breakDir に応じてオフセット
  const BREAK_SCALE = 28; // SVG px 単位での最大変化量
  let offsetX = 0;
  let offsetY = 0;

  if (breakDir) {
    offsetX = breakDir.dx * BREAK_SCALE * curveFactor;
    offsetY = breakDir.dy * BREAK_SCALE * curveFactor;
  } else if (isFastball) {
    // ストレート: 少しホップ（Y を上=負方向にオフセット）
    offsetY = -10 * curveFactor;
  }

  return {
    x: bx + offsetX,
    y: by + offsetY,
  };
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

/**
 * Phase 12-G: バットスイング位置マーカー（バット形状）
 *
 * ストレートのアッパースイングを模した細長いバット形状を描画する。
 * バットの中央（コンタクトゾーン）がスイング位置に来るように配置。
 * - 長さ: 約 80px（SVG 座標系）
 * - 角度: -25° (アッパースイング)
 * - 末端（グリップ側）は細く、先端（バレル側）は少し太い
 */
function SwingMarkerSvg({ marker }: { marker: SwingMarker }): React.ReactElement {
  const { x: svgX, y: svgY } = uvToSvg(marker.position.x, marker.position.y);
  const color = swingResultToColor(marker.swingResult);

  // バットのサイズ
  const batLen = 80;   // バット全長 (SVG px)
  const barrelW = 8;   // バレル端の太さ
  const gripW = 3;     // グリップ端の太さ
  const angle = -25;   // アッパースイング角度（度）

  // バット形状: 台形（trapezoid）をパスで描く
  // バットの中心をスイング位置に合わせ、-25° に傾ける
  // グリップ側 (-batLen/2, 0)、バレル側 (+batLen/2, 0) の局所座標で台形
  const half = batLen / 2;
  // 4頂点 (局所座標: バット長軸 = X軸)
  // バレル側: (+half, ±barrelW/2)
  // グリップ側: (-half, ±gripW/2)
  const pts = [
    { x: -half, y: -gripW / 2 },
    { x:  half, y: -barrelW / 2 },
    { x:  half, y:  barrelW / 2 },
    { x: -half, y:  gripW / 2 },
  ];

  // 回転行列 (angle 度)
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotated = pts.map(({ x, y }) => ({
    rx: svgX + x * cos - y * sin,
    ry: svgY + x * sin + y * cos,
  }));

  const pointsStr = rotated.map(({ rx, ry }) => `${rx.toFixed(1)},${ry.toFixed(1)}`).join(' ');

  // バレル端に丸みをつけるため小さい円を追加
  const barrel = rotated[1] && rotated[2] ? {
    cx: (rotated[1].rx + rotated[2].rx) / 2,
    cy: (rotated[1].ry + rotated[2].ry) / 2,
  } : null;

  return (
    <g>
      <polygon
        points={pointsStr}
        fill={color}
        fillOpacity={marker.swingResult === 'in_play' ? 0.6 : 0.35}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* バレル端の丸み */}
      {barrel && (
        <circle
          cx={barrel.cx}
          cy={barrel.cy}
          r={barrelW / 2}
          fill={color}
          fillOpacity={marker.swingResult === 'in_play' ? 0.6 : 0.35}
          stroke={color}
          strokeWidth={1}
        />
      )}
    </g>
  );
}

/**
 * Phase 12-G: 投球中ボールアニメーション SVG
 * 白い ◯ が出現してから着弾点に向かって移動する
 */
function PitchBallAnimSvg({
  state,
}: {
  state: PitchBallState;
}): React.ReactElement {
  if (state.progress <= 0 || state.progress >= 1) return <g />;

  // フェードイン/アウト: 最初は薄く、途中から濃く、着弾前にフェードアウト
  const alphaIn = Math.min(state.progress * 6, 1);
  const alphaOut = state.progress > 0.85 ? 1 - (state.progress - 0.85) / 0.15 : 1;
  const alpha = alphaIn * alphaOut;

  // ボールが近づくにつれて少し大きくなる（遠近感）
  const r = 4 + state.progress * 4;

  return (
    <g opacity={alpha}>
      {/* 白い発光ボール */}
      <circle
        cx={state.x}
        cy={state.y}
        r={r + 3}
        fill="rgba(255,255,255,0.15)"
      />
      <circle
        cx={state.x}
        cy={state.y}
        r={r}
        fill="rgba(255,255,255,0.9)"
        stroke="rgba(200,220,255,0.7)"
        strokeWidth={1}
      />
    </g>
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
  // Phase 12-G: 投球軌道アニメーション中に隠すマーカーの seq
  const [hiddenSeq, setHiddenSeq] = useState<number>(-1);
  const prevLengthRef = useRef<number>(history.pitchMarkers.length);

  // Phase 12-G: 投球軌道アニメーション
  const [pitchBall, setPitchBall] = useState<PitchBallState | null>(null);
  const pitchRafRef = useRef<number | null>(null);

  const stopPitchAnim = useCallback(() => {
    if (pitchRafRef.current !== null) {
      cancelAnimationFrame(pitchRafRef.current);
      pitchRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const currentLength = history.pitchMarkers.length;
    if (currentLength > prevLengthRef.current) {
      const newest = history.pitchMarkers[currentLength - 1];
      if (newest) {
        // 投球軌道アニメーション開始
        stopPitchAnim();

        // 開始座標: ゾーン中央上部（投手方向）
        const startX = (ZONE.left + ZONE.right) / 2;
        const startY = DRAW.top - 5; // ゾーン上部のやや外

        // 着弾座標
        const { x: endX, y: endY } = uvToSvg(newest.position.x, newest.position.y);

        const isFastball = newest.pitchClass === 'fastball';
        const breakDir = newest.breakDirection;

        // アニメーション中は最新マーカーを非表示にする
        setHiddenSeq(newest.seq);
        setLatestSeq(-1);

        const startMs = performance.now();

        const animate = (now: number) => {
          const elapsed = now - startMs;
          const t = Math.min(elapsed / PITCH_TRAJ_DURATION, 1);

          const pos = computePitchTrajPos(startX, startY, endX, endY, breakDir, isFastball, t);

          setPitchBall({
            x: pos.x,
            y: pos.y,
            progress: t,
            startX,
            startY,
            targetX: endX,
            targetY: endY,
            breakDir,
            isFastball,
          });

          if (t < 1) {
            pitchRafRef.current = requestAnimationFrame(animate);
          } else {
            pitchRafRef.current = null;
            // アニメーション終了後にボールを消す
            setPitchBall(null);
            // 最新マーカーを表示（スケールインアニメーション付き）
            setHiddenSeq(-1);
            setLatestSeq(newest.seq);
            setTimeout(() => setLatestSeq(-1), 600);
          }
        };

        pitchRafRef.current = requestAnimationFrame(animate);
      }
    }
    prevLengthRef.current = currentLength;
  }, [history.pitchMarkers, stopPitchAnim]);

  // アンマウント時クリーンアップ
  useEffect(() => {
    return () => stopPitchAnim();
  }, [stopPitchAnim]);

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
          // Phase 12-G: アニメーション中は最新マーカーを非表示
          m.seq === hiddenSeq ? null : (
            <PitchMarkerSvg
              key={`${m.seq}`}
              marker={m}
              isNew={m.seq === latestSeq}
            />
          )
        ))}

        {/* Phase 12-G: 投球軌道アニメーション（最前面） */}
        {pitchBall && <PitchBallAnimSvg state={pitchBall} />}
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
