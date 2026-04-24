'use client';
/**
 * Phase 12-D/E/G/J: ボール・打球アニメーションフック
 *
 * requestAnimationFrame を使用して 60fps でボールを動かす
 * - 投球: マウンド → ホームプレート
 * - 打球: ホームプレート → 着弾点（ベジェ曲線）
 * - 影: 高さに応じてサイズ・透明度を変化
 *
 * Phase 12-E 追加:
 * - ホームランエフェクト進捗 (homeRunProgress) を返す
 * - triggerHomeRunEffect() でホームランパーティクルを起動
 *
 * Phase 12-J 追加:
 * - buildPlaySequence() 統一API: fieldResult.type に基づき適切なシーケンスを構築
 * - buildFlyoutSequence(): 外野フライ/ファウルフライ
 * - buildHitSequence(): シングルヒット（外野へ打球→カット→中継）
 * - buildDoubleSequence(): 二塁打（打者が二塁まで走塁）
 * - buildTripleSequence(): 三塁打（打者が三塁まで走塁）
 * - buildSacrificeFlySequence(): 犠牲フライ（バックホーム）
 * - buildInfieldHitSequence(): 内野安打
 * - buildPopupSequence(): ポップフライ（内野ポップアップ）
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { FieldPoint } from './field-coordinates';
import { FIELD_POSITIONS } from './field-coordinates';
import { pitchLocationToUV } from './pitch-marker-types';
import {
  ballFlightMs,
  batterRunTimes,
  distanceFt,
  etaMs,
  playerSpeedFtPerSec,
  throwSpeedFtPerSec,
} from './physics';

// ===== 型定義 =====

/** 現在のボールアニメーション状態 */
export interface BallAnimationState {
  /** フィールド上の現在位置 */
  currentPosition: FieldPoint;
  /** 高さ正規化（0=地上, 1=最高点） */
  heightNorm: number;
  /** アニメーション中かどうか */
  isAnimating: boolean;
  /** 軌跡情報（打球の場合） */
  trajectory?: BallTrajectory;
  /**
   * Phase 12-E: ホームランエフェクト進捗（0-1）
   * undefined/0 = エフェクトなし
   */
  homeRunProgress?: number;
  /**
   * Phase 12-G: プレイシーケンス（内野ゴロ等の複合アニメーション）
   * undefined = シーケンスなし
   */
  playSequenceState?: PlaySequenceState;
}

/** 打球軌跡 */
export interface BallTrajectory {
  startPos: FieldPoint;
  endPos: FieldPoint;
  /** ベジェ曲線のコントロールポイント */
  controlPoint: FieldPoint;
  /** 最大高さ正規化（0-1） */
  peakHeightNorm: number;
  /** アニメーション時間（ms） */
  durationMs: number;
  /** 打球種類 */
  type: 'fly' | 'grounder' | 'line_drive' | 'home_run';
}

/** 投球の視覚情報 */
export interface PitchResultVisual {
  actualLocation: { row: number; col: number };
  speedKmh: number;
  pitchType: string;
}

/** バットコンタクト情報（打球軌跡計算用） */
export interface BatContactForAnimation {
  contactType: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup' | 'bunt_ground';
  direction: number;    // 角度（0=LF, 45=CF, 90=RF）
  speed: 'weak' | 'normal' | 'hard' | 'bullet';
  distance: number;     // feet
  /** Phase 12-J: 守備結果タイプ（buildPlaySequence に渡す） */
  fieldResultType?: string;
  /** Phase 12-J: 処理選手のポジション名 */
  fielderPosition?: string;
  /** Phase 12-J: 塁上走者情報（送球先判断用） */
  runnersOnBase?: ('first' | 'second' | 'third')[];
}

/**
 * Phase 12-J: 将来の拡張用 — 選手能力値（型定義のみ）
 * 守備力・肩力・守備範囲が影響する将来の拡張に備えて定義
 */
export interface FielderAbility {
  /** 守備力 (1-100) */
  fielding: number;
  /** 肩の強さ (1-100) */
  throwing: number;
  /** 守備範囲 (1-100) */
  range: number;
  /** 勝負強さ（将来の拡張） */
  clutch?: number;
}

// ===== Phase 12-G: プレイシーケンス（内野ゴロ等の複合アニメーション）=====

/**
 * アニメーションフェーズの種類
 *
 * 各フェーズは t=0..1 の進行度で制御する
 */
export type PlayPhaseKind =
  | 'groundRoll'    // ボールがゴロで内野に転がる
  | 'flyBall'       // Phase 12-J: フライボール軌跡（高い弧）
  | 'fielderMove'   // 内野手/外野手がボールに向かって移動
  | 'throw'         // 送球（内野手→塁、外野手→カット、カット→本塁）
  | 'batterRun'     // バッターが走塁
  | 'result';       // アウト/セーフ判定フラッシュ

export interface PlayPhase {
  kind: PlayPhaseKind;
  /** フェーズ開始時刻（ms、シーケンス内相対時刻） */
  startMs: number;
  /** フェーズ終了時刻（ms、シーケンス内相対時刻） */
  endMs: number;
  /** フェーズ固有データ */
  data: PlayPhaseData;
}

export type PlayPhaseData =
  | { kind: 'groundRoll';  from: FieldPoint; to: FieldPoint }
  | { kind: 'flyBall';     from: FieldPoint; to: FieldPoint; peakHeight: number }
  | { kind: 'fielderMove'; from: FieldPoint; to: FieldPoint; fielderPosKey: string; noCatch?: boolean }
  | { kind: 'throw';       from: FieldPoint; to: FieldPoint }
  | { kind: 'batterRun';   from: FieldPoint; to: FieldPoint }
  | { kind: 'result';      text: string; isOut: boolean; baseKey?: string };

/** プレイシーケンス定義 */
export interface PlaySequence {
  phases: PlayPhase[];
  totalMs: number;
}

/** プレイシーケンスの現在状態（描画用） */
export interface PlaySequenceState {
  /** 現在アクティブなフェーズとその進行度 */
  activePhases: {
    phase: PlayPhase;
    /** フェーズ内の進行度 (0-1) */
    t: number;
  }[];
  /** 現在のボール位置 */
  ballPosition?: FieldPoint;
  /** ボールの高さ正規化（0=地上、1=最高点）Phase 12-J追加 */
  ballHeightNorm?: number;
  /** 動的フィールダー位置（posKey=ポジション名, pos=現在位置） */
  animatedFielder?: { posKey: string; pos: FieldPoint };
  /** バッター走者位置 */
  batterRunnerPos?: FieldPoint;
  /** 判定テキスト */
  resultText?: { text: string; isOut: boolean; baseKey?: string };
  /** シーケンス全体の進行度 (0-1) */
  totalProgress: number;
}

/**
 * Phase 12-G: 打球の着弾方向からどのポジションの選手が捕球するか判定（内野用）
 */
function getFielderForGroundBall(direction: number): {
  posKey: string;
  fieldPos: FieldPoint;
} {
  // direction: 0=LF, 45=CF, 90=RF
  // 内野ゴロの場合は 3B/SS/2B/1B のいずれか
  if (direction < 25) {
    return { posKey: 'third', fieldPos: FIELD_POSITIONS.thirdBase };
  } else if (direction < 45) {
    return { posKey: 'shortstop', fieldPos: FIELD_POSITIONS.shortstop };
  } else if (direction < 70) {
    return { posKey: 'second', fieldPos: FIELD_POSITIONS.secondBase };
  } else {
    return { posKey: 'first', fieldPos: FIELD_POSITIONS.firstBase };
  }
}

/**
 * Phase 12-J: 打球方向から外野手ポジションを判定
 */
function getFielderForOutfield(direction: number): {
  posKey: string;
  fieldPos: FieldPoint;
} {
  if (direction < 30) {
    return { posKey: 'left', fieldPos: FIELD_POSITIONS.leftField };
  } else if (direction < 60) {
    return { posKey: 'center', fieldPos: FIELD_POSITIONS.centerField };
  } else {
    return { posKey: 'right', fieldPos: FIELD_POSITIONS.rightField };
  }
}

/**
 * Phase 12-J: 走者状況に応じた送球先を決定
 * 優先順位: ホーム（得点阻止） > 二塁/三塁（追加進塁阻止） > 一塁
 */
function getThrowTarget(
  runnersOnBase: ('first' | 'second' | 'third')[],
  isHit: boolean,
): { posKey: string; fieldPos: FieldPoint } {
  // ヒット時: 走者が三塁にいればホームへ、二塁にいれば三塁/ホームへ
  if (isHit) {
    if (runnersOnBase.includes('third')) {
      // バックホーム
      return { posKey: 'catcher', fieldPos: FIELD_POSITIONS.catcher };
    }
    if (runnersOnBase.includes('second')) {
      return { posKey: 'catcher', fieldPos: FIELD_POSITIONS.catcher };
    }
    // 走者なし or 一塁のみ → カット(二塁方向)
    return { posKey: 'second', fieldPos: FIELD_POSITIONS.second };
  }
  // アウト時: 一塁または最もリードしている走者を刺す
  return { posKey: 'first', fieldPos: FIELD_POSITIONS.firstBase };
}

/**
 * Phase 12-J: 打球方向と飛距離から着弾位置を計算
 */
function calcLandingPos(direction: number, distance: number, scale = 0.8): FieldPoint {
  const adjustedDeg = direction - 45;
  const rad = (adjustedDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * distance * scale,
    y: Math.cos(rad) * distance * scale,
  };
}

/**
 * v0.41.0: 内野ゴロのプレイシーケンスを構築（物理ベース）
 *
 * 各 phase の時間を選手能力・打球速度から算出し、
 * 打球転がり・野手ダッシュ・送球・走者走塁が同じタイムラインで動く。
 *
 * @param contact バットコンタクト情報
 * @param isOut アウトかどうか
 * @param batterSpeed 打者走力 stat (0-100)。省略時は 50
 * @param fielderSpeed 内野手走力 stat (0-100)。省略時は 55
 * @param fielderArm  内野手肩力 stat (0-100)。省略時は 55
 */
export function buildGroundOutSequence(
  contact: BatContactForAnimation,
  isOut: boolean,
  batterSpeed = 50,
  fielderSpeed = 55,
  fielderArm = 55,
): PlaySequence {
  const { direction, speed, distance } = contact;

  // ゴロの着弾位置
  const groundDist = Math.min(distance, 80); // 内野手の範囲内に収める
  const adjustedDeg = direction - 45;
  const rad = (adjustedDeg * Math.PI) / 180;
  const ballLandPos: FieldPoint = {
    x: Math.sin(rad) * groundDist,
    y: Math.cos(rad) * groundDist,
  };

  const home: FieldPoint = FIELD_POSITIONS.home;
  const firstBase: FieldPoint = FIELD_POSITIONS.first;
  const firstBasePlayer: FieldPoint = FIELD_POSITIONS.firstBase;

  // 捕球する内野手
  const { posKey, fieldPos } = getFielderForGroundBall(direction);

  // ─── 物理時刻計算 ───
  // 打球転がり時間
  const rollDurationMs = ballFlightMs(contact.contactType ?? 'ground_ball', groundDist);

  // 内野手: 元位置→着弾点 移動時間 (捕球までの時間)
  const fielderDist = distanceFt(fieldPos, ballLandPos);
  const fielderMoveDurationMs = Math.max(
    80,
    etaMs(fieldPos, ballLandPos, playerSpeedFtPerSec(fielderSpeed)),
  );

  // 送球到着時刻: 捕球完了 + 0.3s 準備 + 送球時間
  const throwSpeed = throwSpeedFtPerSec(fielderArm);
  const throwDurationMs = etaMs(ballLandPos, firstBasePlayer, throwSpeed);
  const catchTime = Math.max(rollDurationMs, fielderMoveDurationMs + 50); // どちらか遅い方
  const throwStart = catchTime + 300; // 0.3s で送球準備
  const throwEnd = throwStart + throwDurationMs;

  // 打者走者: BATTER_START_DELAY_MS から走り出し
  const runTimes = batterRunTimes(batterSpeed);
  const batterStart = runTimes.start;
  const batterEnd = runTimes.t1; // 1塁到達

  // 判定: 送球到着 vs 打者走者1塁到達
  const resultStart = throwEnd;
  const resultEnd = resultStart + 600;
  const totalMs = Math.max(resultEnd, batterEnd + 200);

  const phases: PlayPhase[] = [
    {
      kind: 'groundRoll',
      startMs: 0,
      endMs: rollDurationMs,
      data: { kind: 'groundRoll', from: home, to: ballLandPos },
    },
    {
      kind: 'fielderMove',
      startMs: 80, // ゴロがスタートしたら即反応
      endMs: 80 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: fieldPos, to: ballLandPos, fielderPosKey: posKey },
    },
    {
      kind: 'throw',
      startMs: throwStart,
      endMs: throwEnd,
      data: { kind: 'throw', from: ballLandPos, to: firstBasePlayer },
    },
    {
      kind: 'batterRun',
      startMs: batterStart,
      endMs: batterEnd,
      data: { kind: 'batterRun', from: home, to: firstBase },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: isOut ? 'アウト！' : 'セーフ！', isOut },
    },
  ];

  return { phases, totalMs };
}

// ===== Phase 12-J: 新しいシーケンス構築関数 =====

/**
 * v0.41.0: 外野フライ / ポップフライアウトのシーケンス（物理ベース）
 *
 * フライ打球 → 外野手（または内野手）がキャッチ → アウト
 *
 * @param contact    バットコンタクト情報
 * @param isOutfield true=外野フライ, false=ポップフライ（内野手が捕球）
 * @param fielderSpeed 守備選手の走力 stat (0-100)
 */
export function buildFlyoutSequence(
  contact: BatContactForAnimation,
  isOutfield: boolean,
  fielderSpeed = 55,
): PlaySequence {
  const { direction, distance, contactType } = contact;
  const landPos = calcLandingPos(direction, distance);
  const fielder = isOutfield
    ? getFielderForOutfield(direction)
    : getFielderForGroundBall(direction);

  const home: FieldPoint = FIELD_POSITIONS.home;

  // ─── 物理時刻 ───
  // 打球滞空時間
  const flyDurationMs = ballFlightMs(contactType ?? 'fly_ball', distance);

  // 野手がボール落下点へ到達する時間（スタートは反応遅延 150ms）
  const fielderMoveDurationMs = Math.max(
    80,
    etaMs(fielder.fieldPos, landPos, playerSpeedFtPerSec(fielderSpeed)),
  );

  const resultStart = flyDurationMs;
  const resultEnd = resultStart + 600;
  const totalMs = Math.max(resultEnd, 150 + fielderMoveDurationMs + 100);

  const phases: PlayPhase[] = [
    {
      kind: 'flyBall',
      startMs: 0,
      endMs: flyDurationMs,
      data: { kind: 'flyBall', from: home, to: landPos, peakHeight: isOutfield ? 0.85 : 0.95 },
    },
    {
      kind: 'fielderMove',
      startMs: 150,
      endMs: 150 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: fielder.fieldPos, to: landPos, fielderPosKey: fielder.posKey },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: 'アウト！', isOut: true },
    },
  ];

  return { phases, totalMs };
}

/**
 * v0.41.0: ポップフライアウトのシーケンス（内野ポップアップ・物理ベース）
 *
 * @param contact      バットコンタクト情報
 * @param fielderSpeed 内野手走力 stat (0-100)
 */
export function buildPopupSequence(contact: BatContactForAnimation, fielderSpeed = 55): PlaySequence {
  const { direction } = contact;
  // ポップアップは内野近く（短距離固定 ~40ft）
  const popupDist = 40;
  const landPos = calcLandingPos(direction, popupDist, 0.8);
  const fielder = getFielderForGroundBall(direction);
  const home: FieldPoint = FIELD_POSITIONS.home;

  // ─── 物理時刻 ───
  const flyDurationMs = ballFlightMs('popup', popupDist); // 1200〜2500ms
  const fielderMoveDurationMs = Math.max(
    80,
    etaMs(fielder.fieldPos, landPos, playerSpeedFtPerSec(fielderSpeed)),
  );

  const resultStart = flyDurationMs;
  const resultEnd = resultStart + 600;
  const totalMs = Math.max(resultEnd, 50 + fielderMoveDurationMs + 100);

  const phases: PlayPhase[] = [
    {
      kind: 'flyBall',
      startMs: 0,
      endMs: flyDurationMs,
      data: { kind: 'flyBall', from: home, to: landPos, peakHeight: 0.95 },
    },
    {
      kind: 'fielderMove',
      startMs: 50,
      endMs: 50 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: fielder.fieldPos, to: landPos, fielderPosKey: fielder.posKey },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: 'アウト！', isOut: true },
    },
  ];

  return { phases, totalMs };
}

/**
 * v0.41.0: シングルヒット（外野安打）のシーケンス（物理ベース）
 *
 * 打球 → 外野に落下 → 外野手が追う → カット（中継手）→ 内野へ返球
 * 走者・打球・守備が同じタイムラインで動く。
 *
 * @param contact      バットコンタクト情報
 * @param batterSpeed  打者走力 stat (0-100)
 * @param fielderSpeed 外野手走力 stat (0-100)
 * @param fielderArm   外野手肩力 stat (0-100)
 */
export function buildHitSequence(
  contact: BatContactForAnimation,
  batterSpeed = 50,
  fielderSpeed = 55,
  fielderArm = 55,
): PlaySequence {
  const { direction, distance, contactType } = contact;
  const landPos = calcLandingPos(direction, distance);
  const outfielder = getFielderForOutfield(direction);

  // カット（中継）ポジション
  const cutoff: FieldPoint = direction < 45
    ? FIELD_POSITIONS.shortstop
    : FIELD_POSITIONS.secondBase;

  const home: FieldPoint = FIELD_POSITIONS.home;
  const first: FieldPoint = FIELD_POSITIONS.first;

  // ─── 物理時刻 ───
  // 打球滞空時間
  const flyDurationMs = ballFlightMs(contactType ?? 'fly_ball', distance);

  // 外野手→着弾点（スタート反応 200ms）
  const fielderMoveDurationMs = etaMs(outfielder.fieldPos, landPos, playerSpeedFtPerSec(fielderSpeed));
  const fielderArriveMs = 200 + fielderMoveDurationMs;

  // 捕球タイム: ボール着弾 と 野手到着 のどちらか遅い方 + 0.2s 捕球準備
  const catchTimeMs = Math.max(flyDurationMs, fielderArriveMs) + 200;

  // 送球: 着弾点→カット
  const throwDurationMs = etaMs(landPos, cutoff, throwSpeedFtPerSec(fielderArm));
  const throwStart = catchTimeMs;
  const throwEnd = throwStart + throwDurationMs;

  // 打者走塁: BATTER_START_DELAY_MS から走り出し、1塁で止まる
  const runTimes = batterRunTimes(batterSpeed);

  const resultStart = runTimes.t1; // 1塁到達したら結果表示
  const resultEnd = resultStart + 600;
  const totalMs = Math.max(resultEnd, throwEnd + 200);

  const phases: PlayPhase[] = [
    {
      kind: 'flyBall',
      startMs: 0,
      endMs: flyDurationMs,
      data: { kind: 'flyBall', from: home, to: landPos, peakHeight: 0.6 },
    },
    {
      kind: 'fielderMove',
      startMs: 200,
      endMs: 200 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: outfielder.fieldPos, to: landPos, fielderPosKey: outfielder.posKey },
    },
    {
      kind: 'throw',
      startMs: throwStart,
      endMs: throwEnd,
      data: { kind: 'throw', from: landPos, to: cutoff },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.start,
      endMs: runTimes.t1,
      data: { kind: 'batterRun', from: home, to: first },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: 'ヒット！', isOut: false, baseKey: 'first' },
    },
  ];

  return { phases, totalMs };
}

/**
 * v0.41.0: ホームランのシーケンス（物理ベース）
 *
 * 打球・外野手追走・打者走塁が同じタイムラインで動く。
 * 打球は場外まで飛ぶ（長い弧）、外野手はフェンス前で停止（noCatch=true）。
 *
 * @param contact      バットコンタクト情報
 * @param batterSpeed  打者走力 stat (0-100)
 * @param fielderSpeed 外野手走力 stat (0-100)
 */
export function buildHomeRunSequence(
  contact: BatContactForAnimation,
  batterSpeed = 50,
  fielderSpeed = 55,
): PlaySequence {
  const { direction, distance } = contact;
  const adjustedDeg = direction - 45;
  const rad = (adjustedDeg * Math.PI) / 180;

  const outfielder = getFielderForOutfield(direction);

  // 打球の着弾点: 場外（2.6 倍遠く）
  const homeRunDist = Math.max(380, distance) * 2.6;
  const ballEndPos: FieldPoint = {
    x: Math.sin(rad) * homeRunDist,
    y: Math.cos(rad) * homeRunDist,
  };
  const ballFromPos: FieldPoint = FIELD_POSITIONS.home;

  // 打球速度は bullet 相当 (140ft/s)、距離 homeRunDist の弧を描く
  const flyDurationMs = Math.max(2000, ballFlightMs('fly_ball', Math.max(380, distance)) * 1.5);

  // 外野手の追走先: 元位置から打球方向へ (フェンス前で停止)
  const fielderFrom = outfielder.fieldPos;
  const fenceDist = 90;
  const fielderTo: FieldPoint = {
    x: fielderFrom.x + Math.sin(rad) * fenceDist * 0.4,
    y: fielderFrom.y + Math.cos(rad) * fenceDist * 0.5,
  };
  const fielderMoveDurationMs = etaMs(fielderFrom, fielderTo, playerSpeedFtPerSec(fielderSpeed));

  // 打者走塁
  const runTimes = batterRunTimes(batterSpeed);

  const resultStart = flyDurationMs;
  const resultEnd = resultStart + 800;
  const totalMs = Math.max(resultEnd, runTimes.t1 + 200);

  const phases: PlayPhase[] = [
    {
      kind: 'flyBall',
      startMs: 0,
      endMs: flyDurationMs,
      data: { kind: 'flyBall', from: ballFromPos, to: ballEndPos, peakHeight: 1.4 },
    },
    {
      kind: 'fielderMove',
      startMs: 150,
      endMs: 150 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: fielderFrom, to: fielderTo, fielderPosKey: outfielder.posKey, noCatch: true },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.start,
      endMs: runTimes.t1,
      data: { kind: 'batterRun', from: FIELD_POSITIONS.home, to: FIELD_POSITIONS.first },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: 'ホームラン！', isOut: false, baseKey: 'home' },
    },
  ];

  return { phases, totalMs };
}

/**
 * v0.41.0: 内野安打のシーケンス（物理ベース）
 *
 * ゴロが内野を抜ける or 内野手が間に合わない → バッターが一塁にセーフ。
 * 打者の足が速いほど「ギリギリセーフ」な絵になる。
 *
 * @param contact      バットコンタクト情報
 * @param batterSpeed  打者走力 stat (0-100)
 * @param fielderSpeed 内野手走力 stat (0-100)
 * @param fielderArm   内野手肩力 stat (0-100)
 */
export function buildInfieldHitSequence(
  contact: BatContactForAnimation,
  batterSpeed = 50,
  fielderSpeed = 55,
  fielderArm = 55,
): PlaySequence {
  const { direction, distance, contactType } = contact;
  const adjustedDeg = direction - 45;
  const rad = (adjustedDeg * Math.PI) / 180;
  const groundDist = Math.min(distance, 65);
  const ballLandPos: FieldPoint = {
    x: Math.sin(rad) * groundDist,
    y: Math.cos(rad) * groundDist,
  };

  const { posKey, fieldPos } = getFielderForGroundBall(direction);
  const home: FieldPoint = FIELD_POSITIONS.home;
  const first: FieldPoint = FIELD_POSITIONS.first;
  const firstBasePlayer: FieldPoint = FIELD_POSITIONS.firstBase;

  // ─── 物理時刻 ───
  const rollDurationMs = ballFlightMs(contactType ?? 'ground_ball', groundDist);
  const fielderMoveDurationMs = etaMs(fieldPos, ballLandPos, playerSpeedFtPerSec(fielderSpeed));
  const catchTimeMs = Math.max(rollDurationMs, 80 + fielderMoveDurationMs) + 200;
  const throwDurationMs = etaMs(ballLandPos, firstBasePlayer, throwSpeedFtPerSec(fielderArm));
  const throwStart = catchTimeMs;
  const throwEnd = throwStart + throwDurationMs;

  const runTimes = batterRunTimes(batterSpeed);

  // 内野安打: バッターが1塁到達してからセーフ表示
  const resultStart = runTimes.t1;
  const resultEnd = resultStart + 600;
  const totalMs = Math.max(resultEnd, throwEnd + 100);

  const phases: PlayPhase[] = [
    {
      kind: 'groundRoll',
      startMs: 0,
      endMs: rollDurationMs,
      data: { kind: 'groundRoll', from: home, to: ballLandPos },
    },
    {
      kind: 'fielderMove',
      startMs: 80,
      endMs: 80 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: fieldPos, to: ballLandPos, fielderPosKey: posKey },
    },
    {
      kind: 'throw',
      startMs: throwStart,
      endMs: throwEnd,
      data: { kind: 'throw', from: ballLandPos, to: firstBasePlayer },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.start,
      endMs: runTimes.t1,
      data: { kind: 'batterRun', from: home, to: first },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: '内野安打！', isOut: false, baseKey: 'first' },
    },
  ];

  return { phases, totalMs };
}

/**
 * v0.41.0: 二塁打のシーケンス（物理ベース）
 *
 * 打球が外野へ → 外野手が追う → バッターが二塁まで走塁（同時並行）。
 *
 * @param contact      バットコンタクト情報
 * @param batterSpeed  打者走力 stat (0-100)
 * @param fielderSpeed 外野手走力 stat (0-100)
 * @param fielderArm   外野手肩力 stat (0-100)
 */
export function buildDoubleSequence(
  contact: BatContactForAnimation,
  batterSpeed = 50,
  fielderSpeed = 55,
  fielderArm = 55,
): PlaySequence {
  const { direction, distance, contactType } = contact;
  const landPos = calcLandingPos(direction, distance);
  const outfielder = getFielderForOutfield(direction);

  const home: FieldPoint = FIELD_POSITIONS.home;
  const first: FieldPoint = FIELD_POSITIONS.first;
  const second: FieldPoint = FIELD_POSITIONS.second;

  // カット（中継）
  const cutoff: FieldPoint = direction < 45
    ? FIELD_POSITIONS.shortstop
    : FIELD_POSITIONS.secondBase;

  // ─── 物理時刻 ───
  const flyDurationMs = ballFlightMs(contactType ?? 'fly_ball', distance);

  const fielderMoveDurationMs = etaMs(outfielder.fieldPos, landPos, playerSpeedFtPerSec(fielderSpeed));
  const fielderArriveMs = 200 + fielderMoveDurationMs;
  const catchTimeMs = Math.max(flyDurationMs, fielderArriveMs) + 200;

  const throwDurationMs = etaMs(landPos, cutoff, throwSpeedFtPerSec(fielderArm));
  const throwStart = catchTimeMs;
  const throwEnd = throwStart + throwDurationMs;

  // 打者走塁: 2塁まで走る
  const runTimes = batterRunTimes(batterSpeed);

  const resultStart = runTimes.t2; // 2塁到達で結果
  const resultEnd = resultStart + 600;
  const totalMs = Math.max(resultEnd, throwEnd + 200);

  const phases: PlayPhase[] = [
    {
      kind: 'flyBall',
      startMs: 0,
      endMs: flyDurationMs,
      data: { kind: 'flyBall', from: home, to: landPos, peakHeight: 0.55 },
    },
    {
      kind: 'fielderMove',
      startMs: 200,
      endMs: 200 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: outfielder.fieldPos, to: landPos, fielderPosKey: outfielder.posKey },
    },
    {
      kind: 'throw',
      startMs: throwStart,
      endMs: throwEnd,
      data: { kind: 'throw', from: landPos, to: cutoff },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.start,
      endMs: runTimes.t1,
      data: { kind: 'batterRun', from: home, to: first },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.t1,
      endMs: runTimes.t2,
      data: { kind: 'batterRun', from: first, to: second },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: '二塁打！', isOut: false, baseKey: 'second' },
    },
  ];

  return { phases, totalMs };
}

/**
 * v0.41.0: 三塁打のシーケンス（物理ベース）
 *
 * 打球が外野深くへ → バッターが三塁まで走塁（同時並行）。
 *
 * @param contact      バットコンタクト情報
 * @param batterSpeed  打者走力 stat (0-100)
 * @param fielderSpeed 外野手走力 stat (0-100)
 * @param fielderArm   外野手肩力 stat (0-100)
 */
export function buildTripleSequence(
  contact: BatContactForAnimation,
  batterSpeed = 50,
  fielderSpeed = 55,
  fielderArm = 55,
): PlaySequence {
  const { direction, distance, contactType } = contact;
  const landPos = calcLandingPos(direction, distance);
  const outfielder = getFielderForOutfield(direction);

  const home: FieldPoint = FIELD_POSITIONS.home;
  const first: FieldPoint = FIELD_POSITIONS.first;
  const second: FieldPoint = FIELD_POSITIONS.second;
  const third: FieldPoint = FIELD_POSITIONS.third;

  // ─── 物理時刻 ───
  const flyDurationMs = ballFlightMs(contactType ?? 'fly_ball', distance);

  const fielderMoveDurationMs = etaMs(outfielder.fieldPos, landPos, playerSpeedFtPerSec(fielderSpeed));
  const fielderArriveMs = 200 + fielderMoveDurationMs;
  const catchTimeMs = Math.max(flyDurationMs, fielderArriveMs) + 200;

  const throwDurationMs = etaMs(landPos, third, throwSpeedFtPerSec(fielderArm));
  const throwStart = catchTimeMs;
  const throwEnd = throwStart + throwDurationMs;

  // 打者走塁: 3塁まで
  const runTimes = batterRunTimes(batterSpeed);

  const resultStart = runTimes.t3;
  const resultEnd = resultStart + 600;
  const totalMs = Math.max(resultEnd, throwEnd + 200);

  const phases: PlayPhase[] = [
    {
      kind: 'flyBall',
      startMs: 0,
      endMs: flyDurationMs,
      data: { kind: 'flyBall', from: home, to: landPos, peakHeight: 0.5 },
    },
    {
      kind: 'fielderMove',
      startMs: 200,
      endMs: 200 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: outfielder.fieldPos, to: landPos, fielderPosKey: outfielder.posKey },
    },
    {
      kind: 'throw',
      startMs: throwStart,
      endMs: throwEnd,
      data: { kind: 'throw', from: landPos, to: third },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.start,
      endMs: runTimes.t1,
      data: { kind: 'batterRun', from: home, to: first },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.t1,
      endMs: runTimes.t2,
      data: { kind: 'batterRun', from: first, to: second },
    },
    {
      kind: 'batterRun',
      startMs: runTimes.t2,
      endMs: runTimes.t3,
      data: { kind: 'batterRun', from: second, to: third },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: '三塁打！', isOut: false, baseKey: 'third' },
    },
  ];

  return { phases, totalMs };
}

/**
 * v0.41.0: 犠牲フライのシーケンス（物理ベース）
 *
 * 外野フライ → 外野手キャッチ → バックホーム（送球）
 *
 * @param contact      バットコンタクト情報
 * @param fielderSpeed 外野手走力 stat (0-100)
 * @param fielderArm   外野手肩力 stat (0-100)
 */
export function buildSacrificeFlySequence(
  contact: BatContactForAnimation,
  fielderSpeed = 55,
  fielderArm = 55,
): PlaySequence {
  const { direction, distance, contactType } = contact;
  const landPos = calcLandingPos(direction, distance);
  const outfielder = getFielderForOutfield(direction);
  const home: FieldPoint = FIELD_POSITIONS.home;
  const catcher: FieldPoint = FIELD_POSITIONS.catcher;

  // ─── 物理時刻 ───
  const flyDurationMs = ballFlightMs(contactType ?? 'fly_ball', distance);
  const fielderMoveDurationMs = etaMs(outfielder.fieldPos, landPos, playerSpeedFtPerSec(fielderSpeed));
  const fielderArriveMs = 150 + fielderMoveDurationMs;
  const catchTimeMs = Math.max(flyDurationMs, fielderArriveMs) + 200;

  const throwDurationMs = etaMs(landPos, catcher, throwSpeedFtPerSec(fielderArm));
  const throwStart = catchTimeMs;
  const throwEnd = throwStart + throwDurationMs;

  const resultStart = throwEnd;
  const resultEnd = resultStart + 600;
  const totalMs = resultEnd;

  const phases: PlayPhase[] = [
    {
      kind: 'flyBall',
      startMs: 0,
      endMs: flyDurationMs,
      data: { kind: 'flyBall', from: home, to: landPos, peakHeight: 0.8 },
    },
    {
      kind: 'fielderMove',
      startMs: 150,
      endMs: 150 + fielderMoveDurationMs,
      data: { kind: 'fielderMove', from: outfielder.fieldPos, to: landPos, fielderPosKey: outfielder.posKey },
    },
    {
      kind: 'throw',
      startMs: throwStart,
      endMs: throwEnd,
      data: { kind: 'throw', from: landPos, to: catcher },
    },
    {
      kind: 'result',
      startMs: resultStart,
      endMs: resultEnd,
      data: { kind: 'result', text: '犠牲フライ！', isOut: false },
    },
  ];

  return { phases, totalMs };
}

/**
 * Phase 12-J: 統一 API — pitchResult の fieldResult.type に応じて適切なシーケンスを構築
 *
 * @param contact BatContactForAnimation（fieldResultType / fielderPosition / runnersOnBase を含む）
 * @returns PlaySequence
 */
export function buildPlaySequence(contact: BatContactForAnimation): PlaySequence {
  const { contactType, fieldResultType, runnersOnBase = [] } = contact;

  // ── ホームランは呼び出し元で triggerHitAnimation + triggerHomeRunEffect を使うため除外
  // ── それ以外の fieldResultType に基づいて分岐

  switch (fieldResultType) {
    // ────── ヒット系 ──────
    case 'single': {
      // 内野ゴロで内野安打 or 外野ヒット
      const isInfieldHit = contactType === 'ground_ball' || contactType === 'bunt_ground';
      if (isInfieldHit) {
        return buildInfieldHitSequence(contact);
      }
      return buildHitSequence(contact);
    }

    case 'double':
      return buildDoubleSequence(contact);

    case 'triple':
      return buildTripleSequence(contact);

    case 'sacrifice_fly':
      return buildSacrificeFlySequence(contact);

    // ────── アウト系 ──────
    case 'out': {
      // ゴロアウト
      if (contactType === 'ground_ball' || contactType === 'bunt_ground') {
        return buildGroundOutSequence(contact, true);
      }
      // ポップフライアウト
      if (contactType === 'popup') {
        return buildPopupSequence(contact);
      }
      // 外野フライアウト
      const isOutfield = contact.distance >= 100;
      return buildFlyoutSequence(contact, isOutfield);
    }

    case 'double_play':
      // 併殺: ゴロ → 二塁送球 → 一塁送球
      return buildGroundOutSequence(contact, true);

    case 'sacrifice':
      // バント → ゴロアウト（ランナー進塁）
      return buildGroundOutSequence(contact, true);

    case 'error': {
      // エラー: アウトになるべきところがセーフ
      if (contactType === 'ground_ball' || contactType === 'bunt_ground') {
        return buildGroundOutSequence(contact, false); // セーフ扱い
      }
      return buildFlyoutSequence(contact, contact.distance >= 100);
    }

    case 'fielders_choice':
      return buildGroundOutSequence(contact, true);

    // ────── フォールバック ──────
    default: {
      // fieldResultType が不明 or 未設定の場合は打球種類で判断
      if (contactType === 'ground_ball' || contactType === 'bunt_ground') {
        return buildGroundOutSequence(contact, false);
      }
      if (contactType === 'popup') {
        return buildPopupSequence(contact);
      }
      if (contactType === 'fly_ball' || contactType === 'line_drive') {
        const isOutfield = (contact.distance ?? 0) >= 100;
        return buildFlyoutSequence(contact, isOutfield);
      }
      return buildGroundOutSequence(contact, false);
    }
  }
}

// ===== ユーティリティ関数 =====

/** イーズイン（加速） */
function easeIn(t: number): number {
  return t * t;
}

/** イーズアウト（減速） */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** 線形補間 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 2次ベジェ曲線 */
export function bezier2(
  p0: FieldPoint,
  p1: FieldPoint,
  p2: FieldPoint,
  t: number,
): FieldPoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/**
 * 球速 (km/h) → アニメーション時間 (ms)
 *
 * v0.35.0: 球速による差を拡大（体感しやすいよう 3.7 倍の差）
 * 150km/h → ~170ms, 120km/h → ~300ms, 100km/h → ~430ms, 80km/h → ~550ms
 */
export function pitchSpeedToDuration(speedKmh: number): number {
  const clipped = Math.max(80, Math.min(170, speedKmh));
  // 80km/h = 550ms, 170km/h = 130ms （範囲 420ms, 傾き 4.67ms/km/h）
  return Math.round(550 - ((clipped - 80) / 90) * 420);
}

/**
 * エンジンのpitchLocation (5×5グリッド) → フィールド上の近似座標
 */
function pitchLocationToField(location: {
  row: number;
  col: number;
}): FieldPoint {
  // ホームプレート付近に投球が来る
  // col: 0=内角ボール〜4=外角ボール → x: -2 〜 2 feet
  // row: 0=高めボール〜4=低めボール → ホームプレート上（y≈0）
  const uv = pitchLocationToUV(location.row, location.col);
  return {
    x: (uv.x - 0.5) * 4, // ±2 feet
    y: 1, // ホームプレート直前
  };
}

/**
 * prefers-reduced-motion チェック
 */
function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 打球軌跡を計算する
 */
export function computeTrajectory(contact: BatContactForAnimation): BallTrajectory {
  const { contactType, direction, speed, distance } = contact;

  // 角度をセンター=0基準に変換（エンジンは 0=LF, 45=CF, 90=RF）
  const adjustedDeg = direction - 45;
  const rad = (adjustedDeg * Math.PI) / 180;

  // 着弾点（実際の距離の 80% で簡略化）
  // Phase 12-G: ホームランは場外（フェンス外）まで飛ぶよう距離を大幅に伸ばす
  const isHomeRun = contactType === 'fly_ball' && distance >= 350;
  const scaledDist = isHomeRun
    ? distance * 2.8   // フェンスを超えてキャンバス外まで
    : distance * 0.8;
  const endPos: FieldPoint = {
    x: Math.sin(rad) * scaledDist,
    y: Math.cos(rad) * scaledDist,
  };

  // 打球種類に応じた高さと時間
  // v0.36.0: ホームランはより高く舞い上がる
  const isHomeRunForHeight = contactType === 'fly_ball' && distance >= 350;
  const peakHeightNorm =
    isHomeRunForHeight ? 1.4 :
    contactType === 'fly_ball' ? 0.8 :
    contactType === 'popup' ? 0.9 :
    contactType === 'line_drive' ? 0.35 :
    contactType === 'ground_ball' ? 0.08 :
    contactType === 'bunt_ground' ? 0.05 :
    0.4;

  // コントロールポイント（ベジェ曲線の頂点）
  const controlPoint: FieldPoint = {
    x: endPos.x * 0.4,
    y: endPos.y * 0.4 + (endPos.y * peakHeightNorm * 0.6),
  };

  // ホームランの場合はタイプを変更
  const isHomeRunType = contactType === 'fly_ball' && distance >= 350;

  // 速度に応じたアニメーション時間
  // v0.36.0: ホームランは距離が 2.8 倍になるため、速度も見合った長めに（2400ms）
  const durationMs = isHomeRunType
    ? 2400  // ホームランはしっかり飛んでいく様子を見せる
    : speed === 'bullet' ? 500
    : speed === 'hard' ? 700
    : speed === 'normal' ? 900
    : 1200;

  const trajType: BallTrajectory['type'] =
    isHomeRunType ? 'home_run' :
    contactType === 'fly_ball' ? 'fly' :
    contactType === 'ground_ball' || contactType === 'bunt_ground' ? 'grounder' :
    contactType === 'line_drive' ? 'line_drive' :
    'fly';

  return {
    startPos: { x: 0, y: 0 },
    endPos,
    controlPoint,
    peakHeightNorm,
    durationMs,
    type: trajType,
  };
}

// ===== メインフック =====

export interface UseBallAnimationReturn {
  ballState: BallAnimationState | null;
  triggerPitchAnimation: (pitch: PitchResultVisual) => void;
  triggerHitAnimation: (trajectory: BallTrajectory) => void;
  /**
   * Phase 12-E: ホームランエフェクトを起動する
   * （triggerHitAnimation の後、type='home_run' のときに呼び出す）
   */
  triggerHomeRunEffect: () => void;
  /**
   * Phase 12-G: プレイシーケンス（内野ゴロ等）を起動する
   */
  triggerPlaySequence: (sequence: PlaySequence) => void;
  resetBall: () => void;
}

export function useBallAnimation(): UseBallAnimationReturn {
  const [ballState, setBallState] = useState<BallAnimationState | null>(null);
  const rafRef = useRef<number | null>(null);
  const homeRunRafRef = useRef<number | null>(null);
  const seqRafRef = useRef<number | null>(null);
  /** Phase 12-L: アンマウント後の setBallState 呼び出しを防ぐフラグ */
  const mountedRef = useRef(true);

  // アニメーションループを停止
  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ホームランエフェクトを停止
  const stopHomeRunEffect = useCallback(() => {
    if (homeRunRafRef.current !== null) {
      cancelAnimationFrame(homeRunRafRef.current);
      homeRunRafRef.current = null;
    }
  }, []);

  // プレイシーケンスを停止
  const stopPlaySequence = useCallback(() => {
    if (seqRafRef.current !== null) {
      cancelAnimationFrame(seqRafRef.current);
      seqRafRef.current = null;
    }
  }, []);

  /**
   * 投球アニメーション（マウンド → ホームプレート）
   */
  const triggerPitchAnimation = useCallback(
    (pitch: PitchResultVisual) => {
      // Phase 12-L: 全アニメーションを停止してから新しい投球アニメを開始する。
      // 以前は stopAnimation() のみで、seqRafRef や homeRunRafRef が生き残り
      // setBallState の競合でアニメーションが固まるバグがあった。
      stopAnimation();
      stopHomeRunEffect();
      stopPlaySequence();

      // prefers-reduced-motion 対応
      if (shouldReduceMotion()) {
        const endPos = pitchLocationToField(pitch.actualLocation);
        setBallState({ currentPosition: endPos, heightNorm: 0, isAnimating: false });
        return;
      }

      const startTime = performance.now();
      const duration = pitchSpeedToDuration(pitch.speedKmh);
      const startPos = { ...FIELD_POSITIONS.pitcher };
      const endPos = pitchLocationToField(pitch.actualLocation);

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeIn(t);

        const pos: FieldPoint = {
          x: lerp(startPos.x, endPos.x, eased),
          y: lerp(startPos.y, endPos.y, eased),
        };

        // 投球の微妙な弧（高さは最大15%）
        const heightNorm = Math.sin(eased * Math.PI) * 0.15;

        setBallState({ currentPosition: pos, heightNorm, isAnimating: t < 1 });

        if (t < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    },
    [stopAnimation],
  );

  /**
   * 打球アニメーション（ホームプレート → 着弾点、ベジェ曲線）
   */
  const triggerHitAnimation = useCallback(
    (trajectory: BallTrajectory, options?: { keepPlaySequence?: boolean }) => {
      // Phase 12-L: 全アニメーション停止
      // v0.36.0: keepPlaySequence=true のときは playSequence（外野手追走）を殺さない
      stopAnimation();
      stopHomeRunEffect();
      if (!options?.keepPlaySequence) stopPlaySequence();

      // prefers-reduced-motion 対応
      if (shouldReduceMotion()) {
        setBallState({
          currentPosition: trajectory.endPos,
          heightNorm: 0,
          isAnimating: false,
          trajectory,
        });
        return;
      }

      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / trajectory.durationMs, 1);
        const eased = trajectory.type === 'grounder' ? t : easeOut(t);

        // ベジェ曲線で位置を計算
        const pos = bezier2(
          trajectory.startPos,
          trajectory.controlPoint,
          trajectory.endPos,
          eased,
        );

        // 高さは sin 曲線
        const heightNorm = Math.sin(eased * Math.PI) * trajectory.peakHeightNorm;

        setBallState({
          currentPosition: pos,
          heightNorm,
          isAnimating: t < 1,
          trajectory,
        });

        if (t < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          rafRef.current = null;
          // 着弾 300ms 後にボールを非表示
          // Phase 12-L: mountedRef でアンマウント後の呼び出しを防ぐ
          setTimeout(() => { if (mountedRef.current) setBallState(null); }, 300);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    },
    [stopAnimation, stopHomeRunEffect, stopPlaySequence],
  );

  /**
   * Phase 12-G: プレイシーケンスアニメーション（内野ゴロ等）
   */
  const triggerPlaySequence = useCallback(
    (sequence: PlaySequence) => {
      // Phase 12-L: 全アニメーション停止
      stopAnimation();
      stopHomeRunEffect();
      stopPlaySequence();
      if (shouldReduceMotion()) return;

      const startMs = performance.now();

      const animateSeq = (now: number) => {
        const elapsed = now - startMs;
        const totalProgress = Math.min(elapsed / sequence.totalMs, 1);

        // 各フェーズの進行度を計算
        const activePhases: PlaySequenceState['activePhases'] = [];
        let ballPos: FieldPoint | undefined;
        let ballHeight = 0;
        let animatedFielder: PlaySequenceState['animatedFielder'];
        let batterRunnerPos: FieldPoint | undefined;
        let resultText: PlaySequenceState['resultText'];

        for (const phase of sequence.phases) {
          if (elapsed < phase.startMs) continue;
          const phaseElapsed = elapsed - phase.startMs;
          const phaseDur = phase.endMs - phase.startMs;
          const t = Math.min(phaseElapsed / phaseDur, 1);

          activePhases.push({ phase, t });

          const d = phase.data;
          switch (d.kind) {
            case 'groundRoll': {
              // ゴロ: ホーム → 内野手方向 (低弧線)
              const et = easeOut(t);
              ballPos = {
                x: lerp(d.from.x, d.to.x, et),
                y: lerp(d.from.y, d.to.y, et),
              };
              ballHeight = 0.05; // 地面近く
              break;
            }
            case 'flyBall': {
              // Phase 12-J: フライボール（高い弧）
              const et = easeOut(t);
              ballPos = bezier2(
                d.from,
                { x: (d.from.x + d.to.x) * 0.5, y: (d.from.y + d.to.y) * 0.5 + d.peakHeight * 60 },
                d.to,
                et,
              );
              ballHeight = Math.sin(et * Math.PI) * d.peakHeight;
              break;
            }
            case 'fielderMove': {
              // 内野手/外野手移動
              const et = easeOut(t);
              const fielderPos: FieldPoint = {
                x: lerp(d.from.x, d.to.x, et),
                y: lerp(d.from.y, d.to.y, et),
              };
              animatedFielder = { posKey: d.fielderPosKey, pos: fielderPos };
              // t=0.9 以降はボールをキャッチ（フライの場合はボールを隠す）
              // v0.36.0: noCatch=true のときはボールを捕球しない（ホームラン等）
              if (t >= 0.9 && !d.noCatch) {
                ballPos = fielderPos;
                ballHeight = 0;
              }
              break;
            }
            case 'throw': {
              // 送球: 軽い放物線
              const et = easeOut(t);
              const bx = lerp(d.from.x, d.to.x, et);
              const by = lerp(d.from.y, d.to.y, et);
              // 軽い弧
              const arc = Math.sin(Math.PI * t) * 20;
              ballPos = { x: bx, y: by + arc };
              ballHeight = Math.sin(Math.PI * t) * 0.2;
              break;
            }
            case 'batterRun': {
              // バッター走塁
              const et = easeOut(t);
              batterRunnerPos = {
                x: lerp(d.from.x, d.to.x, et),
                y: lerp(d.from.y, d.to.y, et),
              };
              break;
            }
            case 'result': {
              resultText = { text: d.text, isOut: d.isOut, baseKey: d.baseKey };
              break;
            }
          }
        }

        // ballState を更新
        const seqState: PlaySequenceState = {
          activePhases,
          ballPosition: ballPos,
          ballHeightNorm: ballHeight,
          animatedFielder,
          batterRunnerPos,
          resultText,
          totalProgress,
        };

        setBallState((prev) => {
          const base = prev ?? {
            currentPosition: { x: 0, y: 0 },
            heightNorm: 0,
            isAnimating: totalProgress < 1,
          };
          return {
            ...base,
            currentPosition: ballPos ?? base.currentPosition,
            heightNorm: 0,
            isAnimating: totalProgress < 1,
            playSequenceState: seqState,
          };
        });

        if (totalProgress < 1) {
          seqRafRef.current = requestAnimationFrame(animateSeq);
        } else {
          seqRafRef.current = null;
          // シーケンス終了後に状態をクリア
          // Phase 12-L: mountedRef でアンマウント後の呼び出しを防ぐ
          setTimeout(() => {
            if (!mountedRef.current) return;
            setBallState((prev) =>
              prev ? { ...prev, playSequenceState: undefined, isAnimating: false } : null,
            );
          }, 300);
        }
      };

      seqRafRef.current = requestAnimationFrame(animateSeq);
    },
    [stopAnimation, stopHomeRunEffect, stopPlaySequence],
  );

  const resetBall = useCallback(() => {
    stopAnimation();
    stopHomeRunEffect();
    stopPlaySequence();
    setBallState(null);
  }, [stopAnimation, stopHomeRunEffect, stopPlaySequence]);

  /**
   * Phase 12-E: ホームランパーティクルエフェクト（1.4秒）
   */
  const triggerHomeRunEffect = useCallback(() => {
    stopHomeRunEffect();
    if (shouldReduceMotion()) return;

    const startTime = performance.now();
    const DURATION = 1400; // ms

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / DURATION, 1);
      setBallState((prev) =>
        prev ? { ...prev, homeRunProgress: progress } : null,
      );
      if (progress < 1) {
        homeRunRafRef.current = requestAnimationFrame(animate);
      } else {
        homeRunRafRef.current = null;
        // エフェクト終了後にホームランフラグをクリア
        setBallState((prev) =>
          prev ? { ...prev, homeRunProgress: 0 } : null,
        );
      }
    };

    homeRunRafRef.current = requestAnimationFrame(animate);
  }, [stopHomeRunEffect]);

  // アンマウント時のクリーンアップ
  // Phase 12-M (hotfix): mountedRef 管理は完全に1回だけにする。
  // Phase 12-L では dependency に stopXxx コールバックを入れていたが、
  // これらは useCallback 内で別 useCallback を dep に含むため、
  // イニング切替/state 変化で再生成 → cleanup 連鎖 →
  // mountedRef.current = false の瞬間があり、その間の setBallState が抑止されて
  // 「3回表からアニメーションが止まる」バグを誘発していた。
  // 空 dependency にしてマウント/アンマウント時のみ発火させる。
  // stop*** 参照は ref を経由した最新版を呼ぶ必要がないため、初期値の closure で十分。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (homeRunRafRef.current !== null) {
        cancelAnimationFrame(homeRunRafRef.current);
        homeRunRafRef.current = null;
      }
      if (seqRafRef.current !== null) {
        cancelAnimationFrame(seqRafRef.current);
        seqRafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ballState,
    triggerPitchAnimation,
    triggerHitAnimation,
    triggerHomeRunEffect,
    triggerPlaySequence,
    resetBall,
  };
}
