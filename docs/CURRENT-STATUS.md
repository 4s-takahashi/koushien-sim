# koushien-sim 現状サマリー (2026-04-19 時点)

このドキュメントは外部 AI (ChatGPT 等) に読ませて現状を把握してもらうための概要。
最新状態と未解決の課題・機能拡張候補をまとめている。

---

## 🎯 プロジェクト概要

| 項目 | 値 |
|---|---|
| プロジェクト名 | 高校野球デイズ (koushien-sim) |
| リポジトリ | https://github.com/4s-takahashi/koushien-sim |
| ブランチ | `main` |
| 本番 URL | https://kokoyakyu-days.jp |
| 現行バージョン | v0.12.5 |
| ライセンス | Private (社内利用) |

## 🛠 技術スタック

| レイヤ | 技術 |
|---|---|
| Frontend | Next.js 16.2.3 (App Router, Turbopack) + React 19 |
| Language | TypeScript (strict) |
| State | Zustand (persist) |
| DB/KV | Redis 7.0.15 (本番) / MemoryKV (開発) |
| Auth | 自前 (bcryptjs + Cookie) |
| Test | Vitest |
| Deploy | pm2 + Nginx on Xserver VPS |
| CI | まだ整備してない (GitHub Actions 未設定) |

## 📂 リポジトリ構成

```
src/
├── app/              # Next.js App Router
│   ├── play/match/[matchId]/page.tsx  # インタラクティブ試合画面
│   ├── api/auth/*    # 認証API (login/register/logout/me/guest)
│   └── api/save/*    # クラウドセーブAPI
├── engine/
│   ├── match/        # 試合エンジン (runner.ts, at-bat.ts, inning.ts, pitch/*)
│   ├── world/        # 世界状態 (create-world, world-ticker, tournament-bracket)
│   ├── player/       # 選手生成
│   └── core/rng.ts   # 乱数生成
├── stores/           # Zustand stores (world-store, match-store)
├── ui/
│   ├── projectors/   # State → ViewState 変換
│   └── narration/    # 実況テキスト生成
├── lib/              # auth, kv, cloud-save
├── components/       # VersionBadge など
└── version.ts        # バージョン情報 (唯一の真実)

tests/                # Vitest
middleware.ts         # 認証ガード (Edge runtime)
ecosystem.config.js   # pm2 設定
scripts/
├── bump-version.mjs  # バージョン自動更新
└── deploy.sh         # 本番デプロイ
```

---

## ✅ 完了したフェーズ

- **Phase 1-4**: 選手生成、練習メニュー、試合エンジン、大会
- **Phase 5**: 練習試合・紅白戦
- **Phase 5.5**: 大会試合を quickGame 実シミュに置き換え
- **Phase 6**: ランキング、マルチユーザー
- **Phase 10-A**: MatchRunner + matchProjector（試合の外部制御）
- **Phase 10-B**: インタラクティブ試合UI（1球/1打席/1イニング単位で采配しながら観戦）
- **Phase 10-C**: 大会ブラケット統合（大会日にインタラクティブ試合へ遷移）

## 🔥 今日 (2026-04-19) 修正した主なバグ

| Ver | 修正内容 |
|---|---|
| v0.10.3 | 秋大会起動バグ (activeTournament 残留クリーンアップ、既存セーブ自動マイグレーション) |
| v0.11.0 | 全画面にバージョン表示バッジ追加 |
| v0.11.1 | 試合停止 (3アウト攻守交代漏れ) |
| v0.12.0 | **Redis 永続化**（MemoryKV で pm2 restart するとユーザーデータ全消失していた問題を根本解決） |
| v0.12.1 | 打順進行漏れ・自動進行中の手動クリックで2打席進む |
| v0.12.2 | 打者不明で試合停止 (battingOrder 整合性) + 試合完走テスト追加 |
| v0.12.3 | 実況ログの打席境界を明確化、1球モードでも打席開始を表示 |
| v0.12.4 | 2ストライクで三振バグ (打席終了時のカウントリセット漏れ) |
| v0.12.5 | スコアボード 0 表示、投手未設定時の NPE |

## 🧪 テスト状況

- **engine 配下 568 件全パス**
- インタラクティブ試合画面の E2E テストはまだ無い
- UI プロジェクター系のテストは一部存在

---

## 🚧 既知の未解決課題・改善候補

### 🔴 緊急度: 高（プレイ体験に直結）

（未報告なら各自プレイ中に気づいた点を追記）

### 🟡 緊急度: 中（機能として欠けている・粗さがある）

1. **試合中の采配が実質 CPU 任せ**
   - バント・盗塁・代打・継投の UI はあるが、実際にはプレイヤー攻撃中のみ反映
   - 相手 CPU の采配傾向が固定（cpuAutoTactics）
2. **年度またぎの報告・演出が薄い**
   - 3年生卒業・新入生入学の表示が淡白
3. **OB・ドラフト関連の UI が未実装または簡素**
4. **選手の個性（メンタルフラグ、コンディション）が UI に反映されてない**
   - 内部では動いているが見えにくい
5. **地区予選・甲子園の演出差がない**
6. **練習メニューの組み合わせ効果が見えにくい**
7. **監督の経験値・評価が未実装**

### 🟢 緊急度: 低（機能拡張・将来検討）

1. **リアルタイムマルチプレイ / 対戦モード**
2. **スカウティングの深度追加**（AI 校偵察）
3. **練習試合カレンダーの自動提案**
4. **シーズン成績のグラフ表示**
5. **選手成長曲線の可視化**
6. **史実選手モード**（実在選手を高校時代に戻して再現）
7. **監督特性システム**
8. **スポンサー・経営系要素**

### 🔧 技術的負債

1. **テストファイルで型エラーが複数件残存** (src/ は strict pass)
   - `tests/engine/match/pitch/process-pitch.test.ts` に `PitchResult` 型のエクスポート漏れ
   - `tests/engine/world/bugfix-autumn-tournament.test.ts` の `readonly` 型不整合
   - ...他数件
2. **エンジン層の複雑度**
   - `runner.ts` と `inning.ts` で打順 +1 の担当が異なる（runner が外、inning が内）
   - MatchState が immutable だがコピー回数が多い
3. **KV 層の抽象化**
   - Redis/Vercel KV/MemoryKV の切り替えが `require()` で実行時に決まる
4. **中間CI / PR プロセス未整備**
   - main 直接 push で本番反映
   - lint / typecheck の自動化なし
5. **E2E テスト無し**
   - Playwright 等での試合画面操作テストを入れたい

---

## 🚀 デプロイフロー

```bash
# 1. コード修正
# 2. バージョン bump
npm run bump:patch   # バグ修正 (0.12.5 → 0.12.6)
npm run bump:minor   # 機能追加
npm run bump:major   # 大幅変更

# 3. src/version.ts の CHANGELOG に新エントリ追加

# 4. コミット & push
git add -A
git commit -m "..."
git push origin main

# 5. 本番デプロイ (rsync + build + pm2 restart + HTTP check)
bash scripts/deploy.sh
```

`build` スクリプトで `scripts/bump-version.mjs` が自動で `BUILD_DATE` と `GIT_SHA` を更新する。

---

## 📊 本番インフラ

- **VPS**: Xserver VPS (`162.43.92.107`, Ubuntu 25.04)
- **Node**: v22
- **MySQL**: 8.4 (未使用。Phase 次第で使う)
- **Redis**: 7.0.15 (AOF 永続化済、127.0.0.1:6379)
- **Nginx**: リバースプロキシ (HTTPS 終端 → :3000)
- **pm2**: プロセス管理、pm2 save + startup 済
- **certbot**: Let's Encrypt 自動更新 (2026-07-16 まで有効)

`.env` ファイル (VPS /opt/koushien-sim/.env):
```
NODE_ENV=production
REDIS_URL=redis://127.0.0.1:6379
```

---

## 🔑 GPT が使う場合のアクセス情報

### リポジトリ閲覧
- 公開リポジトリなので、URL を教えるだけで GPT が中身を読める
- https://github.com/4s-takahashi/koushien-sim
- 特定ファイルを見せたい時:
  - `https://raw.githubusercontent.com/4s-takahashi/koushien-sim/main/src/version.ts`
  - `https://github.com/4s-takahashi/koushien-sim/blob/main/src/engine/match/runner.ts`

### 本番環境
- https://kokoyakyu-days.jp （ログイン必須）
- テストアカウント（GPT と共有しない方がよい）

### 書き込み
- GPT が直接 push することは想定していない
- GPT が出した提案は人間（高橋さん or マギ）が実装・コミットする

---

## 🎨 GPT にプロンプトを組んでもらう時の推奨構成

```
## コンテキスト
このリポジトリ https://github.com/4s-takahashi/koushien-sim の
docs/CURRENT-STATUS.md を読んで、現状を把握してください。

## 入力
以下はユーザーが手書きでメモした機能要望・バグ報告です:
[高橋さんのメモをここに貼る]

## タスク
各項目を以下の観点で整理してください:
1. 緊急度 (高/中/低)
2. カテゴリ (バグ / 機能拡張 / UX改善 / 技術的負債)
3. 想定される実装コスト (S/M/L/XL)
4. 実装する時の技術的ヒント（リポジトリのどのファイルを触るべきか）
5. Phase 指定 (Phase 11? Phase 12?)

最後に、実装優先順位のおすすめ順を提示してください。
```

---

## 📝 変更ルール

- main 直 push で本番反映される
- **毎デプロイ必ず VERSION を上げる**（CHANGELOG も追加）
- テストを書いてからコード修正する（特にエンジン層）
- 試合完走テストを必ず流してからエンジン変更をデプロイする
