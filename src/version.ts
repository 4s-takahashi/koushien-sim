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

export const VERSION = '0.25.0';

// ↓↓↓ AUTO-GENERATED: scripts/bump-version.mjs が書き換えます（手動編集不可）↓↓↓
export const BUILD_DATE = '2026-04-22 17:58 UTC';
export const GIT_SHA = 'f6dc983';
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
    version: '0.25.0',
    date: '2026-04-22',
    changes: [
      '🎨 Phase 12-G: 試合画面ビジュアル リファイン',
      '【G-1】グラウンド・ストライクゾーン 40% 縮小',
      '  Ballpark.module.css: max-width 450px → 270px',
      '  StrikeZone.module.css: max-width 300px → 180px',
      '  match-visual.module.css: 2カラム → 3カラム（グラウンド・ゾーン・情報パネル）',
      '  実況ログ・心理ウィンドウを右カラムへ移動、縮小分のスペースを有効活用',
      '',
      '【G-2a】ホームラン = 場外まで飛ぶアニメーション',
      '  computeTrajectory: ホームラン(≥350ft)の endPos を 2.8 倍に拡大 → Canvas 外へ消える',
      '',
      '【G-2b】内野ゴロ = 守備→送球→走塁 プレイシーケンス',
      '  useBallAnimation.ts に PlaySequence/PlayPhase/PlaySequenceState 型を追加',
      '  buildGroundOutSequence(): ゴロ方向から守備位置を判定し5フェーズシーケンスを構築',
      '  triggerPlaySequence(): RAF ループで各フェーズを順次アニメーション',
      '  BallparkCanvas.ts: drawBatterRunner() / drawResultFlash() 追加',
      '  フィールダーマーカーがボールに向かって移動 → キャッチ → 一塁送球',
      '  同時にバッターが一塁へ走塁（黄色マーカー）',
      '  一塁での判定「アウト！/セーフ！」フラッシュ表示',
      '',
      '【G-3】ストライクゾーン = 投球軌道アニメーション',
      '  StrikeZone.tsx に computePitchTrajPos() 追加',
      '  投球開始時に白い ◯ がゾーン上部に出現 → 着弾点まで 380ms で移動',
      '  変化球: breakDirection に応じて軌道が曲がる（スライダー横・カーブ下・フォーク急落下）',
      '  ストレート高速: わずかにホップ（上方向オフセット）',
      '  アニメーション中は最新マーカーを非表示、着弾後にスケールインで表示',
      '',
      '【G-4】スイング位置マーカー = バット形状',
      '  SwingMarkerSvg: 18×10 の小矩形 → バット形状（台形＋バレル端円、-25°アッパースイング）',
      '  グリップ側細く・バレル側太い台形で視覚的にバットと認識できる形状',
      '',
      '  テスト: 22 件追加（buildGroundOutSequence・computePitchTrajPos・ホームラン距離）',
      '  field-coordinates.test.ts: Phase 12-F 座標変更に合わせてテストを更新（3件修正）',
    ],
  },
  {
    version: '0.24.1',
    date: '2026-04-22',
    changes: [
      '🐛 [バグ修正] 試合中の盗塁指示が反映されない問題を修正',
      '  原因: UI側で走者の「名前」を engine の runnerId として渡していたため、engine 側で照合に失敗し盗塁処理がスキップされていた',
      '  修正: RunnerBaseView に playerId フィールドを追加（projector で埋める）',
      '        SelectPanel の盗塁走者選択で r.playerId を渡すよう変更',
      '  副次改善: 盗塁ランナー選択モーダルに学校短縮名を表示（v0.23.0仕様に合わせる）',
      '',
      '  影響範囲:',
      '    src/ui/projectors/view-state-types.ts — RunnerBaseView に playerId, schoolShortName 追加',
      '    src/ui/projectors/matchProjector.ts — buildBasesView で playerId と shortName を埋める',
      '    src/app/play/match/[matchId]/page.tsx — SelectPanel steal モードで playerId を渡す',
    ],
  },
  {
    version: '0.24.0',
    date: '2026-04-22',
    changes: [
      '⚾ Phase 12: 試合画面ビジュアル化 — 全5サブフェーズ実装',
      '【12-A】アニメーション付きスコアボード: イニング開始時にスライドイン→2秒表示→スライドアウト',
      '  AnimatedScoreboard.tsx + useScoreboardVisibility.ts フック',
      '  イニング別スコア表・アウトカウント・チームスコアをオーバーレイ表示',
      '  prefers-reduced-motion 対応（アニメーション省略）',
      '  MatchHUD: 常時表示のコンパクトHUD (B/S/O・イニング・スコア)',
      '  StrikeZone.tsx: SVG製ストライクゾーンの骨格',
      '【12-B】ストライクゾーンマーカー: ◯（速球）/ △（変化球）マーカー表示',
      '  pitch-marker-types.ts: PitchMarker / SwingMarker / AtBatMarkerHistory 型',
      '  pitchLocationToUV(): 5×5エンジングリッド → UV座標',
      '  getBreakDirection(): 変化方向ベクトル（左右投手で dx 反転）',
      '  match-visual-store.ts: Zustandストア（打席間マーカー管理）',
      '  CircleMarker / TriangleMarker / SwingMarkerSvg — CSS scale-in アニメーション',
      '【12-C】グラウンド鳥瞰 Canvas: 球場・選手・ランナー描画',
      '  field-coordinates.ts: フィールド座標系 ↔ Canvas座標系変換',
      '  FIELD_POSITIONS: 全9ポジション + ベースの座標定義',
      '  BallparkCanvas.ts: 純粋関数で Canvas 2D 描画（スタンド/外野/内野/ダイヤモンド/選手）',
      '  Ballpark.tsx: ResizeObserver で正方形維持・devicePixelRatio 対応',
      '  matchProjector.ts: outs / currentInning / pitcherHand / runnerTeams を追加出力',
      '【12-D】ボール・打球アニメーション: requestAnimationFrame 60fps',
      '  useBallAnimation.ts: triggerPitchAnimation / triggerHitAnimation フック',
      '  bezier2(): 2次ベジェ曲線, pitchSpeedToDuration(): 球速→アニメーション時間',
      '  computeTrajectory(): BatContactForAnimation → BallTrajectory',
      '  打球影: 高さに応じてサイズ・透明度が変化 (drawBallWithShadow)',
      '  match-store.ts: breakDirection / swingLocation / batContact を PitchLogEntry に追加',
      '【12-E】ホームランエフェクト・FPS最適化',
      '  パーティクルエフェクト: 32パーティクル + フラッシュ + 「ホームラン！」テキスト (1.4秒)',
      '  オフスクリーン Canvas キャッシュ: 静的背景をキャッシュしてアニメーション時の描画コスト削減',
      '  FPS 30 上限: requestAnimationFrame にフレームスキップを追加',
      '  triggerHomeRunEffect(): ホームランパーティクルを起動するフック',
      '【テスト】56件の新規ユニットテスト追加',
      '  pitch-marker-types: 16テスト, field-coordinates: 20テスト, useBallAnimation: 20テスト',
      '  合計: 971テスト (915 既存 + 56 新規)',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-04-21',
    changes: [
      '🎭 Phase 11.5: 物語化リデザイン — 全7サブフェーズ実装',
      '🏠 11.5-A: ホーム画面タブUI（自校/他校/評価者）・チーム状態サマリー',
      '⚾ 11.5-B: チーム画面に今日の練習設定セクション追加',
      '📊 11.5-C: 評価者システム基盤（24評価者・ランク計算エンジン）',
      '📝 11.5-D: 選手能力値の言葉化（13能力×7段階×2+候補）',
      '👤 11.5-E: 選手プロフィール拡充（今の気持ち・練習履歴・イベント履歴）',
      '🔍 11.5-F: マネージャー経由スカウティングレポート言葉化',
      '👩‍💼 11.5-G: マネージャー管理画面（/play/staff・複数雇用・育成）',
    ],
  },
  {
    version: '0.22.0',
    date: '2026-04-20',
    changes: [
      '🔧 Phase 7-F: 細かい修正5件',
      '【1】試合画面から詳細画面へ遷移 — 高校名・選手名クリックで飛べる',
      '  詳細画面に「試合に戻る」ボタン (sessionStorage で matchId 保持)',
      '【2】学校名の3文字短縮表記 — 例「新潟県立長岡商業高等学校」→「長岡商」',
      '  generateShortName() を school-generator.ts に実装',
      '  既存セーブデータは world-store.ts で自動 migration',
      '  選手名の横に (短縮名) を表示して攻撃側・守備側を識別可能に',
      '【3】采配の前回選択継続 — 「前回と同じ」ボタン追加',
      '  match-store.ts に lastOrder state 追加',
      '  打者が変わると自動リセット',
      '【4】盗塁の完全実装 — attemptSteal() を実装、実況ログに表示',
      '  ランナー速度 vs 捕手肩力で成功判定',
      '  「○○、二塁へ盗塁成功！」「△△、二塁盗塁失敗！タッチアウト」',
      '  新規テスト tests/engine/match/steal.test.ts (368行)',
      '【5】アウトの詳細化 — ゴロ/フライ/三振/守備位置を明記',
      '  「サード正面のゴロ、ファースト送球アウト」',
      '  「センターフライ、アウト」',
      '  「空振り三振」「見逃し三振」',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-04-20',
    changes: [
      '🧠 Phase 7-E: 心理システム仕上げ — モノローグが試合に効く',
      '【7-E1】MentalEffect → MatchOverrides → 試合ロジック反映:',
      '  MatchOverrides インターフェース追加 (runner-types.ts)',
      '  runner.stepOnePitch/stepOneAtBat に overrides?: MatchOverrides を追加',
      '  getEffectiveBatterParams / getEffectivePitcherParams が補正を受け取る',
      '  contactBonus / powerBonus / swingAggressionBonus / velocityBonus / controlBonus',
      '  補正係数クリップ: ±0.3（velocity は ±5km/h）',
      '  buildBatterOverridesFromEffects / buildPitcherOverridesFromEffects ヘルパー追加',
      '【7-E2】ignoreOrder 実装（頑固特性）:',
      '  hasIgnoreOrderEffect() で MentalEffect 配列を検査',
      '  stubborn 特性のモノローグが発火すると采配を即時リセット',
      '  実況ログに「[名前]は監督の指示を無視した！」を追加',
      '【7-E3】モノローグ連続重複回避:',
      '  generatePitchMonologues(ctx, excludeIds?) — 除外セット引数追加',
      '  match-store.ts に recentMonologueIds: string[] を追加（最新5件リングバッファ）',
      '  PitchMonologuesWithEffects: pickedIds フィールド追加',
      '【7-E4】新特性10種の選手生成への割り当て:',
      '  generateTraits(rng, position?) — 位置引数追加（後方互換）',
      '  中頻度特性プール: hotblooded/stoic/cautious/scatterbrained/steady/timid（各~7.5%）',
      '  希少特性: clutch_hitter/big_game_player（~2%、野手）、ace（~2%、投手のみ）',
      '  stubborn（~1%、全ポジション）',
      '  新コンフリクト: hotblooded↔stoic、cautious↔timid、hotblooded↔cautious、stoic↔scatterbrained',
      '【テスト】tests/engine/psyche/phase7e.test.ts 追加 — 26テスト',
      '  合計: 843テスト (817 既存 + 26 新規)',
    ],
  },
  {
    version: '0.20.0',
    date: '2026-04-20',
    changes: [
      '🧠 Phase 7-B/C/D: 心理システム・細かい采配・特性拡張',
      '【7-B】心理システム基盤:',
      '  src/engine/psyche/types.ts — MonologuePattern / MentalEffect / PitchContext 型定義',
      '  src/engine/psyche/monologue-db.ts — 45パターンのモノローグDB（設計書§10 20件含む）',
      '  src/engine/psyche/generator.ts — generatePitchMonologues() 実装（状況/特性/采配マッチング）',
      '  PitchLogEntry に monologues?: MonologueEntry[] フィールド追加（optional: 後方互換）',
      '  match-store.ts に generatePitchMonologues() 統合 — stepOnePitch/stepOneAtBat で生成',
      '  PsycheWindow.tsx — 試合画面に心理ウィンドウUI追加（打者左・投手右・捕手中央の吹き出し）',
      '【7-C】細かい采配:',
      '  TacticalOrder に BatterDetailedOrder / PitcherDetailedOrder を追加',
      '  DetailedOrderModal.tsx — 「⚙ 細かく指示」ボタン + コース/球種/積極性 選択モーダル',
      '  match-store.ts: currentOrder フィールド追加、toOrderConditionType() でモノローグと連動',
      '  §5 効果メカニズム: 采配タイプ → OrderConditionType 変換でモノローグ生成に反映',
      '【7-D】特性拡張（10種追加）:',
      '  TraitId に hotblooded / stoic / cautious / stubborn / clutch_hitter / scatterbrained',
      '             / big_game_player / steady / timid / ace を追加',
      '  TRAIT_LABELS に日本語マッピング追加',
      '  モノローグDB に新特性対応パターン追加（大舞台/ビビリ×甲子園 等）',
    ],
  },
  {
    version: '0.19.0',
    date: '2026-04-19',
    changes: [
      '⚾ Phase 7-A: 1球モード基盤実装',
      '【7-A-1】デフォルト1球モード: 新ゲーム開始時に pitch: on がデフォルト',
      '  既存セーブデータとの互換性維持（旧データは pitch: on にフォールバック）',
      '  PitchLogEntry に pitchSpeed / pitchLocation / pitchTypeLabel を追加（optional）',
      '【7-A-2】実況ログ詳細化: 球速(km/h)・コース・球種を実況文に組み込み',
      '  例: 「⚾ 鈴木 → 田中: 内角低めのスライダー 138km/h … 空振り」',
      '  投手の velocity 能力値から km/h を自動計算',
      '【7-A-3】実況ログ アコーディオンUI',
      '  通常: 1行表示（最大48文字 + ▼ アイコン）',
      '  クリック/タップで全文展開（▲ で折りたたみ）',
      '  最新10件表示、11件目以降は「もっと見る（N件）」ボタンで展開',
    ],
  },
  {
    version: '0.18.5',
    date: '2026-04-19',
    changes: [
      '🔧 Phase 7-A: 基盤整備（1球モードデフォルト化 WIP）',
      '【デフォルト変更】runnerMode デフォルトを pitch: off → on に',
      '  新規試合は1球ごと停止がデフォルト（プレイヤーが任意に切り替え可能）',
      '【MatchState 拡張】runnerMode? フィールド追加',
      '  既存セーブデータとの互換性維持（undefined は on にフォールバック）',
      '【次のステップ】実況ログ詳細化 + アコーディオン化',
    ],
  },
  {
    version: '0.18.4',
    date: '2026-04-19',
    changes: [
      '🔧 Phase 11-D: 磨き込み第1弾',
      '【バグ修正】A1 個別練習メニュー — パラメータが見える化 (小数第1位表示)',
      '【成長速度改善】練習成長を 1.5-2倍に引き上げ (baseGain 0.3→0.5 等)',
      '  1週間の集中メニューで +5-8 の成長が見えるように',
      '【A2 リセット】監督戦術スタイル (旧A2) を revert',
      '  新A2「細かい采配＋選手心理描写」への再設計開始',
      '  DESIGN-PHASE11-A2-NEW.md に新構想を記載',
    ],
  },
  {
    version: '0.18.3',
    date: '2026-04-19',
    changes: [
      '🎓 Phase 11-A4: OB表示 (MVP)',
      'ホーム画面に「最近のOB」カード追加',
      '直近3年以内の卒業生から総合力上位3名を表示',
      'プロ入り選手は⭐マークとゴールド背景で強調',
    ],
  },
  {
    version: '0.18.2',
    date: '2026-04-19',
    changes: [
      'Phase 11-A3: 選手モチベーションシステム',
      'Player に motivation フィールド追加 (0-100, デフォルト50, 後方互換)',
      '試合出場 +5、ホームラン +3、好投 +5、ベンチ -2、休養日 +3',
      'ライバル多い (同ポジション3人以上) -1/日、疲労80以上 -3/日',
      '試合パフォーマンス: motivation ≥70 で +10%、≤30 で -10%',
      '練習効率: motivation ≥70 で +20%、≤30 で -20%',
      'チーム画面に「やる気」列 (🔥 / 😢 アイコン付き)',
      '選手詳細画面にモチベーションバー表示',
    ],
  },
  {
    version: '0.18.1',
    date: '2026-04-19',
    changes: [
      'Phase 11-A2: 監督戦術スタイル (aggressive/balanced/defensive/small_ball)',
      '監督に style フィールドを追加（optional、後方互換）',
      'aggressive: 長打係数+5%、CPU バント/盗塁確率-10%',
      'defensive: エラー率-10%、CPU 送りバント+10%',
      'small_ball: CPU 送りバント+25%、盗塁成功率+5%',
      'チーム画面の監督セクションに戦術スタイルドロップダウンを追加',
      'worldStore.setManagerStyle() アクション追加',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-04-19',
    changes: [
      '📘 Phase 11 開幕 — プレイ体験の深化',
      '🎯 個別練習メニュー (Issue #4): 選手ごとに異なる練習を割り当て可能',
      'チーム画面に「個別練習」列とドロップダウン追加',
      '個別メニュー未設定なら従来通りチーム共通メニュー',
      'Phase 11-A1 対応',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-04-19',
    changes: [
      '⏸ 試合中断/再開機能 (Issue #8)',
      '試合画面に「⏸ 中断してホームへ」ボタン',
      'ホーム画面に「⚾ 試合再開」バナー',
      '試合状態・実況ログ・投球ログを JSON で保存',
      'MatchState Map/Set serialize + round-trip 復元',
      'Issue #8 (PR #6) 対応',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-04-19',
    changes: [
      '🏠 ホーム画面にチーム状況サマリー追加 (Issue #3 MVP)',
      '  - 負傷中選手・けが注意選手・好調選手を一覧表示',
      '  - 休養中マーカー🛌',
      '  - チーム画面への一括休養リンク',
      'Issue #3 (PR #5) MVP 対応',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-04-19',
    changes: [
      '📊 通算成績が記録されるように (Issue #6)',
      '試合終了後に自動で選手の careerStats に加算',
      'シーズン別成績 (1年/2年/3年) を選手詳細画面に表示',
      'Issue #6 (PR #4) 対応',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-04-19',
    changes: [
      '🛌 けが人・けが注意を一括休養ボタン (チーム画面)',
      '休養選手は翌日まで能力変化なし、疲労を大幅回復',
      '翌日の日次処理で自動的に通常練習に復帰',
      '選手一覧に休養中マーカー🛌を表示',
      'Issue #5 (PR #3) 対応',
    ],
  },
  {
    version: '0.13.2',
    date: '2026-04-19',
    changes: [
      '進行ボタン (1球/1打席/1イニング/最後まで) を自動進行バーに統合',
      '進行ボタン+自動進行+速度を1行にまとめて大幅省スペース化',
      '下部にあった大きな進行カードを削除',
    ],
  },
  {
    version: '0.13.1',
    date: '2026-04-19',
    changes: [
      '🎯 采配バナーとボタンを統合: 画面を上下移動せずに采配できるように',
      '「打席開始 — 采配サインを送ってください」等のバナーを采配カード上部に表示',
      '下のバナー + 上の采配ボタン往復ストレスを解消',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-04-19',
    changes: [
      '🎨 共通ヘッダー (GlobalHeader) を新設、全画面で高さ固定 (desktop 56px / mobile 48px)',
      '🎨 セーブ/ロード/メニューをアイコンボタン化、ハンバーガーメニューで画面遷移',
      '🎨 各画面の独自ヘッダーを細いサブバーに変更、二重ヘッダーを解消',
      '🎨 試合画面: 実況ログをスコアボード直下に移動 (リアルタイム感向上)',
      '🎨 試合画面: 自動進行UIをアイコンのみにコンパクト化',
      'Issue #2 / #9 / #10 対応',
    ],
  },
  {
    version: '0.12.7',
    date: '2026-04-19',
    changes: [
      '🔴 リロードで学校選択画面に戻るバグを修正',
      'Zustand persist の hydration 完了前に /new-game へリダイレクトしていた',
      '_hasHydrated フラグを追加、UI は復元完了を待ってから判断',
      '試合画面 (/play/match/[matchId]) も同様に修正',
    ],
  },
  {
    version: '0.12.6',
    date: '2026-04-19',
    changes: [
      '実況ログから内部用語「インプレー」を除去',
      'ホームラン/ヒット/二塁打/三塁打/アウト等を球種と同じ行で直接表示',
      '例: 「石川 → 吉川: チェンジアップ … 🔥 ホームラン！！」',
      '得点発生時は「⚾ N点追加！」を続けて表示',
    ],
  },
  {
    version: '0.12.5',
    date: '2026-04-19',
    changes: [
      'スコアボード: 無得点イニングでも 0 が表示されるように修正',
      '投手が stats.pitching=null の選手に設定されて試合が止まるバグを修正',
      '投手が見つからない場合は緊急用の pitching stats で試合を継続',
      'テスト追加: 全イニング完走後に inningScores が全て数値で埋まること',
    ],
  },
  {
    version: '0.12.4',
    date: '2026-04-19',
    changes: [
      '🔴 重大: 2ストライクで三振してしまうバグを修正',
      '原因: ホームランやヒットの後、打席終了時のカウントがリセットされず、次の打者に前の打席のストライク数が引き継がれていた',
      'processAtBat インプレー break 時に count リセットを追加',
      'runner.stepOneAtBat に count リセットの防衛コードを追加',
      'テスト追加: 打席終了後の count=0-0 を検証（修正前は再現失敗）',
    ],
  },
  {
    version: '0.12.3',
    date: '2026-04-19',
    changes: [
      '実況ログ改善: 1球モードでも「🧢 N番打者 登場」を表示（打席開始が分かるように）',
      '実況ログ改善: インプレー時にヒット/アウトなどの結果を1球モードでも明示',
      '実況ログ改善: 「投球 N球」を「N番打者 vs 投手（N球）」形式にまとめた',
      'テスト追加: stepOnePitch 単独で試合完走することを検証',
      'テスト追加: stepOneAtBat → stepOnePitch の混合進行でも打者が解決できることを検証',
    ],
  },
  {
    version: '0.12.2',
    date: '2026-04-19',
    changes: [
      '「打者 不明」で試合が止まるバグを修正（battingOrder の整合性を保証）',
      'buildMatchTeam に整合性チェック＋フォールバックを追加',
      '試合完走テスト（複数シード × 150打席）を追加、全558テスト全パス',
    ],
  },
  {
    version: '0.12.1',
    date: '2026-04-19',
    changes: [
      '打席後に同じ打者が再登場するバグを修正（打順 +1 が漏れていた）',
      '自動進行ON中は手動ボタンを無効化（2打席進んでしまう問題を解消）',
      '自動進行中に手動操作しようとすると注意メッセージを表示',
    ],
  },
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
