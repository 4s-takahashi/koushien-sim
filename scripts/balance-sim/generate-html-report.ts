/**
 * scripts/balance-sim/generate-html-report.ts — Phase R8-2
 *
 * 最新の stats-*.json から HTML 統計ダッシュボードを生成する。
 *
 * 実行: npx tsx scripts/balance-sim/generate-html-report.ts
 *
 * 出力先: scripts/balance-sim/output/report-<timestamp>.html
 */

import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(__dirname, 'output');

// ============================================================
// JSON の読み込み（最新ファイル）
// ============================================================

function getLatestJsonFile(): string {
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith('stats-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error('No stats JSON found. Run run-1000games.ts first.');
  return path.join(OUTPUT_DIR, files[0]!);
}

// ============================================================
// HTML 生成
// ============================================================

function pct(v: number): string {
  return (v * 100).toFixed(1) + '%';
}

function fmt2(v: number): string {
  return v.toFixed(2);
}

function fmt3(v: number): string {
  return v.toFixed(3);
}

function barHtml(ratio: number, maxPct = 30, color = '#4a90d9'): string {
  const widthPct = Math.min(100, (ratio * 100) / maxPct * 100);
  return `<div class="bar" style="width:${widthPct.toFixed(1)}%;background:${color}"></div>`;
}

function targetRow(
  label: string,
  value: number,
  min: number,
  max: number,
  ok: boolean,
  formatFn: (v: number) => string,
  unit = '',
): string {
  const badge = ok
    ? '<span class="badge ok">✅ OK</span>'
    : '<span class="badge fail">❌ NG</span>';
  return `
    <tr class="${ok ? 'ok' : 'fail'}">
      <td>${label}</td>
      <td>${formatFn(value)}${unit}</td>
      <td>${formatFn(min)}${unit} – ${formatFn(max)}${unit}</td>
      <td>${badge}</td>
    </tr>`;
}

interface SimResult {
  metadata: {
    seed: string;
    numGames: number;
    runAt: string;
    durationMs: number;
  };
  stats: {
    battingAverage: number;
    onBasePct: number;
    sluggingPct: number;
    hrPerGame: number;
    strikeoutRate: number;
    walkRate: number;
    infieldHitRate: number;
    errorPerGame: number;
    runsPerGame: number;
    totalAtBats: number;
    totalHits: number;
    totalHRs: number;
    totalWalks: number;
    totalStrikeouts: number;
    totalErrors: number;
    totalRuns: number;
    detailedHitTypePct: Record<string, number>;
    detailedHitTypes: Record<string, number>;
    consecutiveSameTypeRate5: number;
  };
  targetChecks: Record<string, { value: number; min: number; max: number; ok: boolean }>;
  hitTypeFrequencyCheck: {
    allTypesPresent: boolean;
    major8TypesPresent: boolean;
    rare5TypesPresent: boolean;
    typesWithZeroCount: string[];
  };
  diversityCheck: {
    consecutiveSameTypeBelow1Pct: boolean;
    consecutiveSameTypeRate5: number;
  };
}

const HIT_TYPE_LABELS: Record<string, string> = {
  first_line_grounder:  '一塁ライン際ゴロ',
  right_side_grounder:  '二遊間ゴロ',
  left_side_grounder:   '三遊間ゴロ',
  third_line_grounder:  '三塁ライン際ゴロ',
  comebacker:           'ピッチャー返し',
  infield_liner:        '内野ライナー',
  high_infield_fly:     '内野ポップフライ',
  over_infield_hit:     '内野手頭越し(ポテン)',
  right_gap_hit:        '右中間ギャップ安打',
  up_the_middle_hit:    'センター返し安打',
  left_gap_hit:         '左中間ギャップ安打',
  shallow_fly:          '浅いフライ',
  medium_fly:           '中距離フライ',
  deep_fly:             '深いフライ',
  line_drive_hit:       'ライナー性安打',
  wall_ball:            'フェンス際打球',
  line_drive_hr:        'ライナー性HR',
  high_arc_hr:          '高弾道HR',
  fence_close_call:     'ライン際際どい打球',
  foul_fly:             'ファウルフライ',
  check_swing_dribbler: 'ハーフスイング当たり損ね',
};

const HIT_TYPE_CATEGORY: Record<string, string> = {
  first_line_grounder: 'major', right_side_grounder: 'major',
  left_side_grounder: 'major', third_line_grounder: 'major',
  right_gap_hit: 'major', up_the_middle_hit: 'major',
  left_gap_hit: 'major', shallow_fly: 'major',
  medium_fly: 'major', deep_fly: 'major',
  comebacker: 'medium', infield_liner: 'medium',
  high_infield_fly: 'medium', over_infield_hit: 'medium',
  line_drive_hit: 'medium', foul_fly: 'medium',
  check_swing_dribbler: 'medium',
  wall_ball: 'rare', line_drive_hr: 'rare',
  high_arc_hr: 'rare', fence_close_call: 'rare',
};

const CATEGORY_COLORS: Record<string, string> = {
  major: '#4a90d9',
  medium: '#7bc67a',
  rare: '#e8a838',
};

function generateHtml(data: SimResult): string {
  const m = data.metadata;
  const s = data.stats;
  const tc = data.targetChecks;
  const hf = data.hitTypeFrequencyCheck;
  const dc = data.diversityCheck;

  const allTargetsOk = Object.values(tc).every((c) => c.ok);
  const allChecksOk = hf.allTypesPresent && hf.major8TypesPresent && hf.rare5TypesPresent && dc.consecutiveSameTypeBelow1Pct;

  // 21種テーブル行
  const hitTypeRows = Object.entries(s.detailedHitTypePct)
    .sort(([, a], [, b]) => b - a)
    .map(([key, pctValue]) => {
      const label = HIT_TYPE_LABELS[key] ?? key;
      const cat = HIT_TYPE_CATEGORY[key] ?? 'major';
      const color = CATEGORY_COLORS[cat] ?? '#4a90d9';
      const count = s.detailedHitTypes[key] ?? 0;
      const catLabel = cat === 'major' ? '主要' : cat === 'medium' ? '中頻度' : '希少';
      return `
        <tr>
          <td><span class="cat-badge cat-${cat}">${catLabel}</span></td>
          <td class="hit-type-key">${key}</td>
          <td>${label}</td>
          <td class="num">${count.toLocaleString()}</td>
          <td class="num">${pct(pctValue)}</td>
          <td class="bar-cell">${barHtml(pctValue, 25, color)}</td>
        </tr>`;
    }).join('');

  const statusHeader = allTargetsOk && allChecksOk
    ? '<div class="status-banner ok">✅ Phase R8 全目標達成</div>'
    : '<div class="status-banner fail">⚠️ 一部目標未達成</div>';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Koushien-Sim Phase R8 — Balance Report</title>
  <style>
    :root {
      --bg: #0f1117;
      --card: #1a1d27;
      --border: #2d3045;
      --text: #e2e8f0;
      --text-dim: #94a3b8;
      --ok: #4ade80;
      --fail: #f87171;
      --accent: #4a90d9;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      padding: 24px;
    }
    h1 { font-size: 1.6rem; font-weight: 700; color: #fff; margin-bottom: 4px; }
    h2 { font-size: 1.1rem; font-weight: 600; color: #cbd5e1; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .subtitle { color: var(--text-dim); font-size: 0.85rem; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
    .card.wide { grid-column: 1 / -1; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; }
    .kpi-value { font-size: 2rem; font-weight: 700; color: #fff; }
    .kpi-label { font-size: 0.75rem; color: var(--text-dim); margin-top: 4px; }
    .status-banner { padding: 12px 20px; border-radius: 8px; font-size: 1.1rem; font-weight: 700; margin-bottom: 20px; }
    .status-banner.ok { background: #052e16; border: 1px solid #166534; color: var(--ok); }
    .status-banner.fail { background: #2d0a0a; border: 1px solid #7f1d1d; color: var(--fail); }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); border-bottom: 1px solid var(--border); }
    td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr.ok td:first-child { border-left: 3px solid var(--ok); }
    tr.fail td:first-child { border-left: 3px solid var(--fail); }
    .badge { font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .badge.ok { background: #052e16; color: var(--ok); }
    .badge.fail { background: #2d0a0a; color: var(--fail); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .bar-cell { width: 140px; padding-left: 8px; }
    .bar { height: 12px; border-radius: 3px; min-width: 2px; transition: width 0.3s; }
    .hit-type-key { font-family: monospace; font-size: 0.8rem; color: var(--text-dim); }
    .cat-badge { font-size: 0.7rem; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
    .cat-badge.cat-major { background: #1e3a5f; color: #60a5fa; }
    .cat-badge.cat-medium { background: #14532d; color: #86efac; }
    .cat-badge.cat-rare  { background: #431407; color: #fdba74; }
    .check-list { list-style: none; }
    .check-list li { padding: 6px 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
    .check-list li:last-child { border-bottom: none; }
    .check-icon { font-size: 1rem; }
    footer { text-align: center; color: var(--text-dim); font-size: 0.75rem; margin-top: 32px; }
  </style>
</head>
<body>

<h1>⚾ Koushien-Sim — Phase R8 Balance Report</h1>
<div class="subtitle">
  シード: ${m.seed} &nbsp;|&nbsp;
  試合数: ${m.numGames.toLocaleString()} 試合 &nbsp;|&nbsp;
  実行日時: ${new Date(m.runAt).toLocaleString('ja-JP')} &nbsp;|&nbsp;
  所要時間: ${(m.durationMs / 1000).toFixed(1)}s
</div>

${statusHeader}

<!-- KPI グリッド -->
<div class="kpi-grid">
  <div class="kpi">
    <div class="kpi-value">${fmt3(s.battingAverage)}</div>
    <div class="kpi-label">リーグ打率</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${fmt3(s.onBasePct)}</div>
    <div class="kpi-label">出塁率 (OBP)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${fmt3(s.sluggingPct)}</div>
    <div class="kpi-label">長打率 (SLG)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${fmt2(s.hrPerGame)}</div>
    <div class="kpi-label">HR / 試合</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${pct(s.strikeoutRate)}</div>
    <div class="kpi-label">三振率 (K%)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${pct(s.walkRate)}</div>
    <div class="kpi-label">四球率 (BB%)</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${pct(s.infieldHitRate)}</div>
    <div class="kpi-label">内野安打率</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${fmt2(s.errorPerGame)}</div>
    <div class="kpi-label">エラー / 試合</div>
  </div>
  <div class="kpi">
    <div class="kpi-value">${fmt2(s.runsPerGame)}</div>
    <div class="kpi-label">得点 / 試合</div>
  </div>
</div>

<div class="grid">

  <!-- §12.3 目標チェック -->
  <div class="card">
    <h2>§12.3 目標範囲チェック</h2>
    <table>
      <thead><tr><th>指標</th><th>実測値</th><th>目標範囲</th><th>判定</th></tr></thead>
      <tbody>
        ${targetRow('リーグ打率', tc.battingAverage.value, tc.battingAverage.min, tc.battingAverage.max, tc.battingAverage.ok, fmt3)}
        ${targetRow('出塁率 (OBP)', tc.onBasePct.value, tc.onBasePct.min, tc.onBasePct.max, tc.onBasePct.ok, fmt3)}
        ${targetRow('HR / 試合', tc.hrPerGame.value, tc.hrPerGame.min, tc.hrPerGame.max, tc.hrPerGame.ok, fmt2)}
        ${targetRow('三振率 (K%)', tc.strikeoutRate.value, tc.strikeoutRate.min, tc.strikeoutRate.max, tc.strikeoutRate.ok, (v) => pct(v))}
        ${targetRow('四球率 (BB%)', tc.walkRate.value, tc.walkRate.min, tc.walkRate.max, tc.walkRate.ok, (v) => pct(v))}
        ${targetRow('内野安打率', tc.infieldHitRate.value, tc.infieldHitRate.min, tc.infieldHitRate.max, tc.infieldHitRate.ok, (v) => pct(v))}
        ${targetRow('エラー / 試合', tc.errorPerGame.value, tc.errorPerGame.min, tc.errorPerGame.max, tc.errorPerGame.ok, fmt2)}
      </tbody>
    </table>
  </div>

  <!-- §8.3 + §12.4 チェック -->
  <div class="card">
    <h2>§8.3 打球分類 &amp; §12.4 多様性チェック</h2>
    <ul class="check-list">
      <li>
        <span class="check-icon">${hf.allTypesPresent ? '✅' : '❌'}</span>
        <span>§8.3.A — 全21種出現 (未出現: ${hf.typesWithZeroCount.length === 0 ? 'なし' : hf.typesWithZeroCount.join(', ')})</span>
      </li>
      <li>
        <span class="check-icon">${hf.major8TypesPresent ? '✅' : '❌'}</span>
        <span>§8.3.C — 主要8種安定出現</span>
      </li>
      <li>
        <span class="check-icon">${hf.rare5TypesPresent ? '✅' : '❌'}</span>
        <span>§8.3.D — 希少5種出現</span>
      </li>
      <li>
        <span class="check-icon">${dc.consecutiveSameTypeBelow1Pct ? '✅' : '❌'}</span>
        <span>§12.4 — 連続5打席同型率: ${pct(dc.consecutiveSameTypeRate5)} (&lt;1% 目標)</span>
      </li>
    </ul>

    <h2 style="margin-top:20px">総合成績</h2>
    <table>
      <tbody>
        <tr><td>総打数</td><td class="num">${s.totalAtBats.toLocaleString()}</td></tr>
        <tr><td>安打</td><td class="num">${s.totalHits.toLocaleString()}</td></tr>
        <tr><td>本塁打</td><td class="num">${s.totalHRs.toLocaleString()}</td></tr>
        <tr><td>三振</td><td class="num">${s.totalStrikeouts.toLocaleString()}</td></tr>
        <tr><td>四球</td><td class="num">${s.totalWalks.toLocaleString()}</td></tr>
        <tr><td>エラー</td><td class="num">${s.totalErrors.toLocaleString()}</td></tr>
        <tr><td>得点</td><td class="num">${s.totalRuns.toLocaleString()}</td></tr>
      </tbody>
    </table>
  </div>

</div>

<!-- 21種打球分類テーブル -->
<div class="card wide">
  <h2>21種打球分類 — 出現分布</h2>
  <table>
    <thead>
      <tr>
        <th>カテゴリ</th>
        <th>分類ID</th>
        <th>名称</th>
        <th class="num">回数</th>
        <th class="num">割合</th>
        <th>分布</th>
      </tr>
    </thead>
    <tbody>
      ${hitTypeRows}
    </tbody>
  </table>
  <p style="margin-top:12px;font-size:0.75rem;color:var(--text-dim)">
    ※ 割合は全インプレー打球（ファウル含む）に対する比率
    &nbsp;|&nbsp;
    <span class="cat-badge cat-major">主要</span> 高頻度（主要打球）
    &nbsp;
    <span class="cat-badge cat-medium">中頻度</span> 中頻度（特殊打球）
    &nbsp;
    <span class="cat-badge cat-rare">希少</span> 低頻度（希少打球）
  </p>
</div>

<footer>
  Generated by Koushien-Sim scripts/balance-sim/generate-html-report.ts &nbsp;|&nbsp; Phase R8-2 &nbsp;|&nbsp; ${new Date().toISOString()}
</footer>

</body>
</html>`;
}

// ============================================================
// メイン
// ============================================================

function main(): void {
  const jsonPath = getLatestJsonFile();
  console.log(`読み込み中: ${path.basename(jsonPath)}`);

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw) as SimResult;

  const html = generateHtml(data);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
  const outPath = path.join(OUTPUT_DIR, `report-${timestamp}.html`);
  fs.writeFileSync(outPath, html, 'utf-8');

  console.log(`✅ HTML レポート生成完了: ${path.basename(outPath)}`);
  console.log(`   パス: ${outPath}`);
}

main();
