/**
 * アプリケーションバージョン情報
 *
 * ルール:
 * - VERSION: semver `Major.Minor.Patch`
 *   - Major: 大きな構造変更・Phase 完了等
 *   - Minor: 機能追加 (feat コミット)
 *   - Patch: バグ修正 (fix コミット)
 * - **毎デプロイ必ず VERSION を上げる**（高橋さん指示 2026-04-19）
 * - BUILD_DATE / GIT_SHA はビルド時に scripts/bump-version.mjs が自動埋め込み
 *
 * 更新手順:
 *   1. CHANGELOG に新エントリを追加
 *   2. VERSION を bump
 *   3. `npm run bump` を実行（BUILD_DATE / GIT_SHA を更新）
 *   4. デプロイ
 */

export const VERSION = '0.12.0';

// ↓↓↓ AUTO-GENERATED: scripts/bump-version.mjs が書き換えます（手動編集不可）↓↓↓
export const BUILD_DATE = '2026-04-19 10:57 UTC';
export const GIT_SHA = '9bce343-dirty';
// ↑↑↑ AUTO-GENERATED END ↑↑↑

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

/**
 * 新しいバージョンは先頭に追加する (最新が一番上)
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.12.0',
    date: '2026-04-19',
    changes: [
      '🔴 データ永続化: Redis 連携を追加（MemoryKV 問題を根本解決）',
      'pm2 restart でもユーザーアカウント・セーブデータが消えなくなった',
      'ecosystem.config.js + .env でプロセス管理を整備',
      'deploy.sh が .env を source して pm2 に環境変数を注入',
      '※ 過去に登録していたアカウントは消失のため、再登録が必要です',
    ],
  },
  {
    version: '0.11.1',
    date: '2026-04-19',
    changes: [
      '試合が途中で止まるバグを修正（3アウト時に攻守交代が走らないケース）',
      '打席進行時の打順二重進行バグを修正（processAtBat と runner の両方で +1 していた）',
      '3アウト・チェンジを実況ログで大きく表示',
      'アウト加算時にナレーション出力を追加',
      '試合終了時に「ゲームセット！」と明示',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-04-19',
    changes: [
      '全画面にバージョン表示バッジを追加（右下に固定表示）',
      'クリックで変更履歴ポップアップを表示',
    ],
  },
  {
    version: '0.10.3',
    date: '2026-04-19',
    changes: [
      '秋大会起動バグを修正（activeTournament 残留クリーンアップ）',
      '既存セーブデータの自動マイグレーションを追加',
    ],
  },
  {
    version: '0.10.2',
    date: '2026-04-19',
    changes: [
      'Phase 10-B: 自動進行と実況テキスト表示',
      'ホーム戻り時のタイトル画面遷移バグ修正',
    ],
  },
  {
    version: '0.10.1',
    date: '2026-04-18',
    changes: [
      'Phase 10-B: 1球単位でも野球が成立（三振・四球・攻守交代の即時処理）',
      '本番ビルド修復（import path と型ミスマッチ解消）',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-04-18',
    changes: [
      'Phase 10-B/C: インタラクティブ試合UI + 大会統合',
      'Phase 5.5: 大会試合を quickGame 実シミュに置き換え',
      'Phase 10-A: applyPinchRun / applyDefensiveSub 実装',
      'Phase 5-B: 練習試合・紅白戦システムを実装',
      '大会終了後の season phase 誤表示バグを修正',
    ],
  },
];
