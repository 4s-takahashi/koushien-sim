'use client';
/**
 * CatcherMitt.tsx — ワイヤーフレームキャッチャーミット SVG コンポーネント
 *
 * v0.48 Phase 3: ストライクゾーン上に表示するミット。
 * キャッチャーの要求位置に構え、投球着弾時に捕球位置へ移動するアニメーションを行う。
 *
 * 設計書: SPEC_v0.48_BATTERY_AND_FIELDING.md Section 4.2-4.3
 */

import React from 'react';
import type { CatcherMittData } from '../projectors/view-state-types';

// ============================================================
// 型定義
// ============================================================

interface CatcherMittProps {
  /** ミット表示データ */
  data: CatcherMittData;
  /** 現在の投球アニメーション進行度 0-1 */
  pitchProgress: number;
  /** SVG描画エリアの幅 */
  svgW: number;
  /** SVG描画エリアの高さ */
  svgH: number;
  /** 描画エリアの左端オフセット（DRAW.left） */
  drawLeft?: number;
  /** 描画エリアの右端オフセット（DRAW.right） */
  drawRight?: number;
  /** 描画エリアの上端オフセット（DRAW.top） */
  drawTop?: number;
  /** 描画エリアの下端オフセット（DRAW.bottom） */
  drawBottom?: number;
}

// ============================================================
// 定数
// ============================================================

/** ミット外形サイズ */
const MITT_RX = 18;
const MITT_RY = 14;

/** ミットポケット（内側小楕円）サイズ */
const POCKET_RX = 8;
const POCKET_RY = 6;

/** ストローク幅 */
const STROKE_WIDTH = 1.5;

// ============================================================
// 内部ヘルパー
// ============================================================

/** UV座標 → SVG座標変換 */
function uvToSvgCoord(
  uvX: number,
  uvY: number,
  drawLeft: number,
  drawRight: number,
  drawTop: number,
  drawBottom: number,
): { x: number; y: number } {
  return {
    x: drawLeft + uvX * (drawRight - drawLeft),
    y: drawTop + uvY * (drawBottom - drawTop),
  };
}

/**
 * requestQuality に応じたミット色を返す
 * 首振り発生時は opacity を下げて「信頼度低い」感を表現
 */
function mittColor(quality: number, wasShakeOff: boolean): string {
  const alpha = wasShakeOff ? 0.5 : 0.7;
  if (quality >= 0.8) {
    return `rgba(100, 200, 255, ${alpha})`;  // 水色（高品質）
  } else if (quality >= 0.5) {
    return `rgba(255, 255, 255, ${alpha})`;  // 白（中品質）
  } else {
    return `rgba(255, 220, 100, ${alpha})`;  // 薄黄（低品質）
  }
}

// ============================================================
// メインコンポーネント
// ============================================================

/**
 * ワイヤーフレームキャッチャーミット
 *
 * アニメーション仕様（pitchProgress 0-1）:
 * Phase A（0-0.4）: requestPosition に静止表示（薄く）
 * Phase B（0.4-0.8）: requestPosition → catchPosition にゆっくり移動
 * Phase C（0.8-1.0）: catchPosition で捕球エフェクト（パルス）
 * Phase D（1.0 以降）: pitchProgress=0 のとき次の球の requestPosition に静止
 */
export function CatcherMitt({
  data,
  pitchProgress,
  svgW: _svgW,
  svgH: _svgH,
  drawLeft = 20,
  drawRight = 280,
  drawTop = 10,
  drawBottom = 250,
}: CatcherMittProps): React.ReactElement {
  const toSvg = (uv: { x: number; y: number }) =>
    uvToSvgCoord(uv.x, uv.y, drawLeft, drawRight, drawTop, drawBottom);

  const reqPos = toSvg(data.requestPosition);
  const catchPos = toSvg(data.catchPosition);

  // 現在のミット座標を計算（pitchProgress に応じて移動）
  let mittX: number;
  let mittY: number;
  let opacity: number;
  let isPulse = false;

  if (pitchProgress <= 0) {
    // 投球前: requestPosition に静止（薄く）
    mittX = reqPos.x;
    mittY = reqPos.y;
    opacity = 0.45;
  } else if (pitchProgress < 0.4) {
    // Phase A: requestPosition に静止（やや明るく）
    mittX = reqPos.x;
    mittY = reqPos.y;
    opacity = 0.55 + pitchProgress * 0.375;  // 0.55 → 0.7
  } else if (pitchProgress < 0.8) {
    // Phase B: requestPosition → catchPosition に移動
    const t = (pitchProgress - 0.4) / 0.4;  // 0-1
    const eased = t * t * (3 - 2 * t);  // smoothstep
    mittX = reqPos.x + (catchPos.x - reqPos.x) * eased;
    mittY = reqPos.y + (catchPos.y - reqPos.y) * eased;
    opacity = 0.7;
  } else {
    // Phase C: catchPosition でパルスエフェクト
    mittX = catchPos.x;
    mittY = catchPos.y;
    const pulseT = (pitchProgress - 0.8) / 0.2;  // 0-1
    opacity = 0.9 - pulseT * 0.3;  // フェードアウト
    isPulse = true;
  }

  const color = mittColor(data.requestQuality, data.wasShakeOff);
  // 首振り時は点線スタイル
  const strokeDash = data.wasShakeOff ? '4 3' : undefined;

  // パルス時の外側光彩サイズ
  const pulseScale = isPulse
    ? 1 + ((pitchProgress - 0.8) / 0.2) * 0.3
    : 1;

  return (
    <g opacity={opacity} aria-label="キャッチャーミット">
      {/* パルスエフェクト（着弾時） */}
      {isPulse && (
        <ellipse
          cx={mittX}
          cy={mittY}
          rx={MITT_RX * pulseScale * 1.5}
          ry={MITT_RY * pulseScale * 1.5}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.4 * (1 - (pitchProgress - 0.8) / 0.2)}
        />
      )}

      {/* ミット外形（半楕円） */}
      <ellipse
        cx={mittX}
        cy={mittY}
        rx={MITT_RX}
        ry={MITT_RY}
        fill="rgba(0,0,0,0.1)"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeDasharray={strokeDash}
      />

      {/* ミットポケット（内側小楕円、点線） */}
      <ellipse
        cx={mittX}
        cy={mittY}
        rx={POCKET_RX}
        ry={POCKET_RY}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH * 0.7}
        strokeDasharray="2 2"
      />

      {/* 構え線（ミット底部の紐表現） */}
      <line
        x1={mittX - MITT_RX * 0.4}
        y1={mittY + MITT_RY}
        x2={mittX - MITT_RX * 0.4}
        y2={mittY + MITT_RY + 5}
        stroke={color}
        strokeWidth={STROKE_WIDTH * 0.6}
      />
      <line
        x1={mittX + MITT_RX * 0.4}
        y1={mittY + MITT_RY}
        x2={mittX + MITT_RX * 0.4}
        y2={mittY + MITT_RY + 5}
        stroke={color}
        strokeWidth={STROKE_WIDTH * 0.6}
      />

      {/* 監督指示反映時: ミット外周に★を表示 */}
      {data.managerOrderApplied && (
        <text
          x={mittX + MITT_RX - 2}
          y={mittY - MITT_RY + 2}
          fontSize={8}
          textAnchor="middle"
          fill="rgba(255, 230, 50, 0.9)"
          aria-label="監督指示反映"
        >
          ★
        </text>
      )}
    </g>
  );
}
