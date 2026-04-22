/**
 * Phase 12-C/E: グラウンド鳥瞰 Canvas 描画ロジック（純粋関数）
 *
 * React 非依存の Canvas 2D 描画関数群
 * テスト時は jest-canvas-mock を使用
 *
 * Phase 12-E 追加:
 * - ホームランパーティクルエフェクト
 * - オフスクリーン Canvas キャッシュ（背景描画を事前レンダリング）
 */

import {
  fieldToCanvas,
  FIELD_POSITIONS,
  type FieldPoint,
} from './field-coordinates';

/**
 * Phase 12-F: feet → canvas px の動的スケール
 * fieldToCanvas と整合（最小辺 / 800）
 */
function getPxPerFoot(w: number, h: number): number {
  return Math.min(w, h) / 800;
}
import type { MatchViewState } from '../projectors/view-state-types';

// ===== 描画用カラーパレット =====
const COLORS = {
  stands: '#757575',        // 外野スタンド
  outfield: '#388e3c',      // 外野（草）
  infield: '#e8c88a',       // 内野（土）
  foulLine: 'rgba(100,150,100,0.5)',
  foulPole: '#ffee58',      // フェンスポール
  baseline: 'rgba(255,255,255,0.5)',
  base: '#f5f5f5',
  homePlate: '#f5f5f5',
  homeTeamPlayer: '#1565c0',   // 自チーム選手（青）
  awayTeamPlayer: '#c62828',   // 相手チーム選手（赤）
  runnerHighlight: '#f57f17',  // ランナー（橙）
  runnerGlow: 'rgba(245,127,23,0.4)',
  ball: '#ffffff',
  ballShadow: 'rgba(0,0,0,0.5)',
  ballStroke: '#cccccc',
  pitcherMound: '#c8a870',
} as const;

// ===== 描画状態の型 =====

export interface BallparkRenderState {
  /** プレイヤーのチームがホームかどうか */
  isPlayerHome: boolean;
  /** ランナー情報 */
  runners: {
    base: 'first' | 'second' | 'third';
    isPlayerTeam: boolean;
  }[];
  /** ボール位置（アニメーション中のみ） */
  ballPosition?: FieldPoint;
  /** ボール高さ正規化（0=地上, 1=最高点） */
  ballHeightNorm?: number;
  /**
   * Phase 12-E: ホームランエフェクト進捗（0-1）
   * 0=エフェクトなし, 0<t<1=アニメーション中, 1=終了
   */
  homeRunProgress?: number;
  /**
   * Phase 12-F: 守備ラインナップ（ポジション → 苗字）
   * 各マーカー下に苗字を描画する
   */
  defenseLineup?: Record<string, string>;
}

// ===== Phase 12-E: オフスクリーン Canvas キャッシュ =====

/**
 * 静的背景（スタンド・外野・内野・フェンス等）のキャッシュ
 * サイズが変わったときだけ再描画する
 */
interface BackgroundCache {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
}

let _bgCache: BackgroundCache | null = null;

/**
 * Phase 12-E: 静的背景キャッシュを取得（サイズが同じなら再利用）
 * OffscreenCanvas が使えない環境では通常の HTMLCanvasElement にフォールバック
 */
function getBackgroundCache(w: number, h: number): BackgroundCache {
  if (_bgCache && _bgCache.width === w && _bgCache.height === h) {
    return _bgCache;
  }

  // オフスクリーン Canvas を生成
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  try {
    canvas = new OffscreenCanvas(w, h);
  } catch {
    // SSR または OffscreenCanvas 非対応環境
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (ctx) {
    drawStands(ctx, w, h);
    drawOutfield(ctx, w, h);
    drawFoulLines(ctx, w, h);
    drawInfield(ctx, w, h);
    drawPitcherMound(ctx, w, h);
    drawBaselines(ctx, w, h);
    drawBases(ctx, w, h);
    drawFoulPoles(ctx, w, h);
  }

  _bgCache = { canvas, width: w, height: h };
  return _bgCache;
}

/**
 * Phase 12-E: 背景キャッシュを無効化（テスト用・リサイズ時）
 */
export function invalidateBackgroundCache(): void {
  _bgCache = null;
}

// ===== メイン描画関数 =====

/**
 * グラウンドを Canvas に描画する
 * requestAnimationFrame から呼ばれる純粋描画関数
 *
 * Phase 12-E: オフスクリーン Canvas キャッシュで背景再描画を省略
 */
export function renderBallpark(
  ctx: CanvasRenderingContext2D,
  state: BallparkRenderState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Phase 12-E: 静的背景をキャッシュから描画
  const bgCache = getBackgroundCache(canvasWidth, canvasHeight);
  ctx.drawImage(bgCache.canvas as CanvasImageSource, 0, 0);

  // 動的レイヤー（ランナー・選手マーカー）
  drawFielders(ctx, state, canvasWidth, canvasHeight);

  // ボール描画（アニメーション中のみ）
  if (state.ballPosition) {
    drawBallWithShadow(
      ctx,
      state.ballPosition,
      state.ballHeightNorm ?? 0,
      canvasWidth,
      canvasHeight,
    );
  }

  // Phase 12-E: ホームランエフェクト
  if (state.homeRunProgress !== undefined && state.homeRunProgress > 0) {
    drawHomeRunEffect(ctx, state.homeRunProgress, canvasWidth, canvasHeight);
  }
}

// ===== 個別描画関数 =====

/** 外野スタンド（全体背景） */
function drawStands(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.fillStyle = COLORS.stands;
  ctx.fillRect(0, 0, w, h);
}

/** 外野（扇形、ホームから 45° 方向の左右ファウルラインに挟まれる 90° 扇形） */
function drawOutfield(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const home = fieldToCanvas(FIELD_POSITIONS.home, w, h);
  const radius = 380 * getPxPerFoot(w, h);

  // Canvas の arc は時計回り正。Y 軸が下向きなので field の +Y = canvas の -Y。
  // 左翼ファウルライン方向 (-268, 268) → canvas では上-左方向 = 5π/4 rad
  // 右翼ファウルライン方向 ( 268, 268) → canvas では上-右方向 = 7π/4 rad
  // 上を通る弧（Canvas 座標で -π/2 中心）を時計回りに描く
  ctx.beginPath();
  ctx.moveTo(home.cx, home.cy);
  ctx.arc(home.cx, home.cy, radius, (5 / 4) * Math.PI, (7 / 4) * Math.PI);
  ctx.closePath();
  ctx.fillStyle = COLORS.outfield;
  ctx.fill();
}

/** ファウルライン（ホームから 45° 方向、外野フェンスまで） */
function drawFoulLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const home = fieldToCanvas(FIELD_POSITIONS.home, w, h);
  // 45° 方向、距離 380ft（フェンスまで）
  const leftFoul = fieldToCanvas({ x: -268, y: 268 }, w, h);
  const rightFoul = fieldToCanvas({ x: 268, y: 268 }, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);

  ctx.beginPath();
  ctx.moveTo(home.cx, home.cy);
  ctx.lineTo(leftFoul.cx, leftFoul.cy);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(home.cx, home.cy);
  ctx.lineTo(rightFoul.cx, rightFoul.cy);
  ctx.stroke();

  ctx.setLineDash([]);
}

/** 内野（ダイヤモンド形ベース土） */
function drawInfield(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const toC = (p: FieldPoint) => fieldToCanvas(p, w, h);
  const scale = getPxPerFoot(w, h);
  const home = toC(FIELD_POSITIONS.home);
  const first = toC(FIELD_POSITIONS.first);
  const second = toC(FIELD_POSITIONS.second);
  const third = toC(FIELD_POSITIONS.third);

  // 内野全体のサークル（大き目の円で土エリアを表現）
  ctx.beginPath();
  ctx.arc(
    (home.cx + second.cx) / 2,
    (home.cy + second.cy) / 2,
    95 * scale,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = COLORS.infield;
  ctx.fill();

  // ダイヤモンド
  ctx.beginPath();
  ctx.moveTo(home.cx, home.cy);
  ctx.lineTo(first.cx, first.cy);
  ctx.lineTo(second.cx, second.cy);
  ctx.lineTo(third.cx, third.cy);
  ctx.closePath();
  ctx.fillStyle = COLORS.infield;
  ctx.fill();
}

/** ピッチャーマウンド */
function drawPitcherMound(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const mound = fieldToCanvas(FIELD_POSITIONS.pitcher, w, h);
  ctx.beginPath();
  ctx.arc(mound.cx, mound.cy, 9 * getPxPerFoot(w, h), 0, Math.PI * 2);
  ctx.fillStyle = COLORS.pitcherMound;
  ctx.fill();
}

/** ベースライン */
function drawBaselines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const toC = (p: FieldPoint) => fieldToCanvas(p, w, h);
  const bases = [
    [FIELD_POSITIONS.home, FIELD_POSITIONS.first],
    [FIELD_POSITIONS.first, FIELD_POSITIONS.second],
    [FIELD_POSITIONS.second, FIELD_POSITIONS.third],
    [FIELD_POSITIONS.third, FIELD_POSITIONS.home],
  ];

  ctx.strokeStyle = COLORS.baseline;
  ctx.lineWidth = 2;

  for (const [from, to] of bases) {
    const f = toC(from);
    const t = toC(to);
    ctx.beginPath();
    ctx.moveTo(f.cx, f.cy);
    ctx.lineTo(t.cx, t.cy);
    ctx.stroke();
  }
}

/** ベース（白い四角） */
function drawBases(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const toC = (p: FieldPoint) => fieldToCanvas(p, w, h);
  const scale = getPxPerFoot(w, h);
  const baseSize = Math.max(6, 10 * scale);

  const positions = [
    FIELD_POSITIONS.first,
    FIELD_POSITIONS.second,
    FIELD_POSITIONS.third,
  ];

  for (const pos of positions) {
    const cp = toC(pos);
    ctx.save();
    ctx.translate(cp.cx, cp.cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = COLORS.base;
    ctx.fillRect(-baseSize / 2, -baseSize / 2, baseSize, baseSize);
    ctx.restore();
  }

  // ホームプレート（五角形）
  const home = toC(FIELD_POSITIONS.home);
  drawHomePlate(ctx, home.cx, home.cy, Math.max(5, 9 * scale));
}

/** ホームプレート（五角形） */
function drawHomePlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - size, cy - size * 0.5);
  ctx.lineTo(cx + size, cy - size * 0.5);
  ctx.lineTo(cx + size, cy + size * 0.3);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size, cy + size * 0.3);
  ctx.closePath();
  ctx.fillStyle = COLORS.homePlate;
  ctx.fill();
}

/** フェンスポール（45° 方向の両翼ファウルポール） */
function drawFoulPoles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const leftPole = fieldToCanvas({ x: -265, y: 265 }, w, h);
  const rightPole = fieldToCanvas({ x: 265, y: 265 }, w, h);

  ctx.strokeStyle = COLORS.foulPole;
  ctx.lineWidth = 3;

  // 左フェンスポール
  ctx.beginPath();
  ctx.moveTo(leftPole.cx, leftPole.cy);
  ctx.lineTo(leftPole.cx, leftPole.cy - 18);
  ctx.stroke();

  // 右フェンスポール
  ctx.beginPath();
  ctx.moveTo(rightPole.cx, rightPole.cy);
  ctx.lineTo(rightPole.cx, rightPole.cy - 18);
  ctx.stroke();
}

/** 9人の守備選手マーカー + 苗字ラベル */
function drawFielders(
  ctx: CanvasRenderingContext2D,
  state: BallparkRenderState,
  w: number,
  h: number,
): void {
  // Phase 12-F: エンジン側のポジション名で反復（defenseLineup と整合）
  const fielderEntries: [string, FieldPoint][] = [
    ['pitcher', FIELD_POSITIONS.pitcher],
    ['catcher', FIELD_POSITIONS.catcher],
    ['first', FIELD_POSITIONS.firstBase],
    ['second', FIELD_POSITIONS.secondBase],
    ['shortstop', FIELD_POSITIONS.shortstop],
    ['third', FIELD_POSITIONS.thirdBase],
    ['left', FIELD_POSITIONS.leftField],
    ['center', FIELD_POSITIONS.centerField],
    ['right', FIELD_POSITIONS.rightField],
  ];

  // ランナーがいるベース
  const runnerBases = new Set(state.runners.map((r) => r.base));

  // Phase 12-F: マーカーサイズを少し縮小（苗字を乗せるため）
  const markerR = Math.max(4, 6 * getPxPerFoot(w, h) * 1.2);
  const playerColor = state.isPlayerHome
    ? COLORS.homeTeamPlayer
    : COLORS.awayTeamPlayer;

  for (const [posKey, fieldPt] of fielderEntries) {
    const cp = fieldToCanvas(fieldPt, w, h);

    // マーカー本体
    ctx.beginPath();
    ctx.arc(cp.cx, cp.cy, markerR, 0, Math.PI * 2);
    ctx.fillStyle = playerColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Phase 12-F: 苗字ラベル（存在すれば）
    const lastName = state.defenseLineup?.[posKey];
    if (lastName) {
      const fontSize = Math.max(8, Math.min(11, markerR * 1.4));
      ctx.font = `${fontSize}px "Hiragino Sans", "Yu Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const textY = cp.cy + markerR + 1;
      // 縁取りで視認性確保
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(lastName, cp.cx, textY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(lastName, cp.cx, textY);
    }
  }

  // ランナーをオレンジでハイライト
  const runnerBaseMap: Record<string, FieldPoint> = {
    first: FIELD_POSITIONS.first,
    second: FIELD_POSITIONS.second,
    third: FIELD_POSITIONS.third,
  };

  for (const base of ['first', 'second', 'third'] as const) {
    if (runnerBases.has(base)) {
      const fieldPt = runnerBaseMap[base];
      const cp = fieldToCanvas(fieldPt, w, h);

      // グロー
      ctx.beginPath();
      ctx.arc(cp.cx, cp.cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.runnerGlow;
      ctx.fill();

      // ランナーアイコン
      ctx.beginPath();
      ctx.arc(cp.cx, cp.cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.runnerHighlight;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

/**
 * ボール＋影（高さに応じてサイズ・位置が変化）
 */
export function drawBallWithShadow(
  ctx: CanvasRenderingContext2D,
  pos: FieldPoint,
  heightNorm: number,
  w: number,
  h: number,
): void {
  const cp = fieldToCanvas(pos, w, h);

  // 影（高さが上がると小さく・薄くなる）
  const shadowRadiusX = 7 * (1 - heightNorm * 0.55);
  const shadowRadiusY = shadowRadiusX * 0.38;
  const shadowAlpha = 0.5 * (1 - heightNorm * 0.65);

  ctx.beginPath();
  ctx.ellipse(
    cp.cx,
    cp.cy + 3,
    Math.max(1, shadowRadiusX),
    Math.max(0.5, shadowRadiusY),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(2)})`;
  ctx.fill();

  // ボール本体（高さが上がると少し上に移動、サイズ変化）
  const ballY = cp.cy - heightNorm * 38;
  const ballRadius = 5 + heightNorm * 3;

  ctx.beginPath();
  ctx.arc(cp.cx, ballY, ballRadius, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.ball;
  ctx.fill();
  ctx.strokeStyle = COLORS.ballStroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ===== MatchViewState からの変換 =====

/**
 * MatchViewState → BallparkRenderState への変換
 */
export function buildBallparkRenderState(
  view: MatchViewState,
  playerSchoolId: string,
  ballPosition?: FieldPoint,
  ballHeightNorm?: number,
  homeRunProgress?: number,
): BallparkRenderState {
  const isPlayerHome = view.homeSchoolId === playerSchoolId;

  // ランナー変換
  const runners: BallparkRenderState['runners'] = [];

  if (view.bases.first) {
    runners.push({ base: 'first', isPlayerTeam: isPlayerHome });
  }
  if (view.bases.second) {
    runners.push({ base: 'second', isPlayerTeam: isPlayerHome });
  }
  if (view.bases.third) {
    runners.push({ base: 'third', isPlayerTeam: isPlayerHome });
  }

  return {
    isPlayerHome,
    runners,
    ballPosition,
    ballHeightNorm,
    homeRunProgress,
    // Phase 12-F: 守備ラインナップを引き継ぎ
    defenseLineup: view.defenseLineup,
  };
}

// ===== Phase 12-E: ホームランエフェクト =====

/** パーティクル定義（確定的シードで生成） */
interface Particle {
  angle: number;      // ラジアン
  speed: number;      // px/frame
  colorHue: number;   // 0-360
  size: number;       // px
}

/** ホームラン演出用パーティクル配列（1回だけ生成） */
const HOME_RUN_PARTICLES: Particle[] = (function () {
  const particles: Particle[] = [];
  const COUNT = 32;
  // シード固定の擬似乱数（Math.random はシード指定不可なのでハッシュで代用）
  for (let i = 0; i < COUNT; i++) {
    const frac = i / COUNT;
    particles.push({
      angle: frac * Math.PI * 2,
      speed: 2.5 + (i % 4) * 1.2,
      colorHue: (frac * 360 + 30) % 360,
      size: 3 + (i % 3) * 2,
    });
  }
  return particles;
})();

/**
 * Phase 12-E: ホームランパーティクルエフェクト
 *
 * @param ctx Canvas コンテキスト
 * @param progress 0-1 (0=開始, 1=終了)
 * @param w Canvas 幅
 * @param h Canvas 高さ
 */
function drawHomeRunEffect(
  ctx: CanvasRenderingContext2D,
  progress: number,
  w: number,
  h: number,
): void {
  if (progress <= 0 || progress >= 1) return;

  // センターフェンス付近を爆発中心に
  const home = fieldToCanvas(FIELD_POSITIONS.home, w, h);
  const centerX = home.cx;
  const centerY = home.cy * 0.18; // 上部（外野フェンス付近）

  // フェード: 最初は薄く入って、0.7以降で急速にフェードアウト
  const alphaIn = Math.min(progress * 5, 1);
  const alphaOut = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
  const globalAlpha = alphaIn * alphaOut;

  // 放射距離（progress に応じて広がる）
  const spread = progress * Math.min(w, h) * 0.35;

  ctx.save();
  ctx.globalAlpha = globalAlpha;

  for (const p of HOME_RUN_PARTICLES) {
    const px = centerX + Math.cos(p.angle) * spread * p.speed * 0.4;
    const py = centerY + Math.sin(p.angle) * spread * p.speed * 0.2; // 縦方向は狭め

    ctx.beginPath();
    ctx.arc(px, py, p.size * (1 - progress * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.colorHue}, 100%, 65%)`;
    ctx.fill();
  }

  // 中央フラッシュ（0-0.3で輝く）
  if (progress < 0.4) {
    const flashAlpha = (1 - progress / 0.4) * 0.6;
    const flashR = progress * Math.min(w, h) * 0.15;
    const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, flashR);
    grad.addColorStop(0, `rgba(255, 230, 80, ${flashAlpha})`);
    grad.addColorStop(1, 'rgba(255, 140, 0, 0)');
    ctx.beginPath();
    ctx.arc(centerX, centerY, flashR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // 「ホームラン！」テキスト
  if (progress > 0.1 && progress < 0.8) {
    const textAlpha = Math.min((progress - 0.1) * 4, 1) * Math.min((0.8 - progress) * 5, 1);
    const textScale = 0.5 + progress * 0.8;
    ctx.globalAlpha = globalAlpha * textAlpha;
    ctx.save();
    ctx.translate(centerX, centerY - 20);
    ctx.scale(textScale, textScale);
    ctx.font = `bold ${Math.round(16 / textScale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 2 / textScale;
    ctx.strokeText('ホームラン！', 0, 0);
    ctx.fillText('ホームラン！', 0, 0);
    ctx.restore();
  }

  ctx.restore();
}
