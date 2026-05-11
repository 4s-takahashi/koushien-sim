'use client';
/**
 * CatcherMitt.tsx — ワイヤーフレームキャッチャーミット SVG コンポーネント
 *
 * v0.48 Phase 3: ストライクゾーン上に表示するミット。
 * キャッチャーの要求位置に構え、投球着弾時に捕球位置へ移動するアニメーションを行う。
 *
 * v0.49.1 変更:
 * - ミットサイズを 1.5 倍に拡大
 * - 通常球: ミットが着弾位置に追従（捕球した感じ）
 * - WP/PB: ミットが要求位置に留まり着弾に追いつかない（取れなかった感じ）
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

/** ミット外形サイズ（v0.49.1: 1.5倍に拡大） */
const MITT_RX = 27;   // 18 * 1.5
const MITT_RY = 21;   // 14 * 1.5

/** ミットポケット（内側小楕円）サイズ（v0.49.1: 1.5倍に拡大） */
const POCKET_RX = 12;  // 8 * 1.5
const POCKET_RY = 9;   // 6 * 1.5

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
 * ワイヤーフレームキャッチャーミット（v0.49.1: 1.5x拡大 + 着弾追従 / WP/PB ズレ演出）
 *
 * アニメーション仕様（pitchProgress 0-1）:
 *
 * 【通常球（isWildPitch=false または未設定）】
 * Phase Pre（<= 0）: requestPosition に静止（構え、明確に表示）
 * Phase A（0-0.4）: requestPosition に静止（やや明るく）
 * Phase B（0.4-0.8）: requestPosition → catchPosition にゆっくり移動（捕球の動き）
 * Phase C（0.8-1.0）: catchPosition で捕球エフェクト（パルス）
 *
 * 【ワイルドピッチ・パスボール（isWildPitch=true）】
 * Phase Pre（<= 0）: requestPosition に静止（構え、明確に表示）
 * Phase A（0-0.4）: requestPosition に静止
 * Phase B（0.4-0.75）: requestPosition → 中間点（40%移動）に慌てて動くが追いつかない
 * Phase C（0.75-1.0）: 中間点で静止（取れなかった）
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

  const isWildPitch = data.isWildPitch === true;

  // 現在のミット座標を計算（pitchProgress に応じて移動）
  let mittX: number;
  let mittY: number;
  let opacity: number;
  let isPulse = false;

  if (isWildPitch) {
    // ===== WP/PB パス: ミットが追いつかない演出 =====
    // 最大で requestPos → catchPos の 40% までしか動かない
    const maxReach = 0.40;

    if (pitchProgress <= 0) {
      // 投球前（秒カウント中）: requestPosition に構えとして明確に表示
      // v0.50.0: opacity を 0.45 → 0.75 に引き上げてキャッチャーの構えを可視化
      mittX = reqPos.x;
      mittY = reqPos.y;
      opacity = 0.75;
    } else if (pitchProgress < 0.4) {
      // Phase A: requestPosition に静止
      mittX = reqPos.x;
      mittY = reqPos.y;
      opacity = 0.55 + pitchProgress * 0.375;
    } else if (pitchProgress < 0.75) {
      // Phase B: 慌てて伸ばすが届かない（40%地点まで）
      const t = (pitchProgress - 0.4) / 0.35;  // 0-1
      // 急加速してから止まる（easeOut: 始め速く、後半遅く）
      const eased = 1 - Math.pow(1 - t, 2);
      const reach = eased * maxReach;
      mittX = reqPos.x + (catchPos.x - reqPos.x) * reach;
      mittY = reqPos.y + (catchPos.y - reqPos.y) * reach;
      opacity = 0.7;
    } else {
      // Phase C: 届かなかった場所で静止（取れなかった）
      mittX = reqPos.x + (catchPos.x - reqPos.x) * maxReach;
      mittY = reqPos.y + (catchPos.y - reqPos.y) * maxReach;
      const fadeT = (pitchProgress - 0.75) / 0.25;
      opacity = 0.65 - fadeT * 0.25;  // 徐々に薄くなる
    }
  } else {
    // ===== 通常パス: 着弾追従 =====
    if (pitchProgress <= 0) {
      // 投球前（秒カウント中）: requestPosition に構えとして明確に表示
      // v0.50.0: opacity を 0.45 → 0.75 に引き上げてキャッチャーの構えを可視化
      mittX = reqPos.x;
      mittY = reqPos.y;
      opacity = 0.75;
    } else if (pitchProgress < 0.4) {
      // Phase A: requestPosition に静止（やや明るく）
      mittX = reqPos.x;
      mittY = reqPos.y;
      opacity = 0.55 + pitchProgress * 0.375;  // 0.55 → 0.7
    } else if (pitchProgress < 0.8) {
      // Phase B: requestPosition → catchPosition に移動（捕球）
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
  }

  const color = mittColor(data.requestQuality, data.wasShakeOff);
  // 首振り時は点線スタイル
  const strokeDash = data.wasShakeOff ? '4 3' : undefined;

  // パルス時の外側光彩サイズ（通常時のみ）
  const pulseScale = isPulse
    ? 1 + ((pitchProgress - 0.8) / 0.2) * 0.3
    : 1;

  return (
    <g opacity={opacity} aria-label="キャッチャーミット">
      {/* パルスエフェクト（着弾時・通常球のみ） */}
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

      {/* ミット外形（楕円） */}
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
        y2={mittY + MITT_RY + 7}
        stroke={color}
        strokeWidth={STROKE_WIDTH * 0.6}
      />
      <line
        x1={mittX + MITT_RX * 0.4}
        y1={mittY + MITT_RY}
        x2={mittX + MITT_RX * 0.4}
        y2={mittY + MITT_RY + 7}
        stroke={color}
        strokeWidth={STROKE_WIDTH * 0.6}
      />

      {/* 監督指示反映時: ミット外周に★を表示 */}
      {data.managerOrderApplied && (
        <text
          x={mittX + MITT_RX - 2}
          y={mittY - MITT_RY + 2}
          fontSize={9}
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
