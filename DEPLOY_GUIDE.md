# デプロイ手順書

「高校野球デイズ」の本番デプロイ・MySQL 移行手順です。

---

## 方法1: GitHub 連携（推奨）

GitHub リポジトリを Vercel に接続するだけで、`main` ブランチへの push が
自動的に本番デプロイされます。

### 手順

1. [https://vercel.com](https://vercel.com) にアクセスしてログイン（または新規登録）
2. ダッシュボードの **「Add New... → Project」** をクリック
3. **「Import Git Repository」** で `koushien-sim` リポジトリを選択
   - リポジトリが表示されない場合は「Adjust GitHub App Permissions」からアクセス権を付与
4. 設定画面が開く：
   - **Framework Preset**: `Next.js`（自動検出されるはず）
   - **Root Directory**: `/`（変更不要）
   - **Build Command**: `npm run build`（変更不要）
   - **Output Directory**: `.next`（変更不要）
5. **「Deploy」** をクリック
6. ビルドが完了すると本番 URL が発行されます（例: `https://koushien-sim.vercel.app`）

### 以降の運用

- `main` ブランチに push → Vercel が自動ビルド＆デプロイ
- プルリクエストごとにプレビューURLが自動生成される

---

## 方法2: Vercel CLI（ローカルから手動デプロイ）

### 前提

- Node.js 20.9 以上がインストールされていること

### 手順

```bash
# 1. Vercel CLI をインストール
npm install -g vercel

# 2. プロジェクトディレクトリに移動
cd /path/to/koushien-sim

# 3. ローカルビルドを確認（任意）
npm run build

# 4. Vercel にログイン
vercel login

# 5. 初回セットアップ（初回のみ）
vercel link
# → 「Link to existing project?」: N（新規の場合）
# → Project Name: koushien-sim
# → Directory: ./ (そのまま Enter)

# 6. 本番デプロイ
vercel --prod
```

デプロイ成功後、ターミナルに本番 URL が表示されます。

---

## vercel.json の設定

リポジトリには `vercel.json` が含まれています：

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "outputDirectory": ".next"
}
```

この設定により、追加の環境変数設定なしでデプロイが完了します。

---

## ローカルで本番ビルドを確認する

```bash
# 依存関係をインストール
npm install

# 本番ビルドを実行
npm run build

# 本番モードで起動
npm start
```

`http://localhost:3000` でアクセス確認後、上記のデプロイ手順を実行してください。

---

## 環境変数

現時点で環境変数は不要です。ゲームデータはすべてブラウザの `localStorage` に保存されます。

将来的にサーバーサイドの機能（ランキング等）を追加する場合は、Vercel の
「Settings → Environment Variables」から追加してください。

---

## トラブルシューティング

| 症状 | 対処法 |
|------|--------|
| ビルドエラー `Cannot find module` | `npm install` を実行してから再デプロイ |
| TypeScript エラー | `npx tsc --noEmit` でエラー箇所を確認 |
| `next build` でメモリ不足 | Vercel の「Settings → General → Node.js Version」を `20.x` に設定 |
| デプロイ後に画面が真っ白 | ブラウザのコンソールを確認。`localStorage` 関連のSSRエラーの可能性 |

---

## 本番 URL 記録欄

デプロイ完了後、以下に URL を記録してください：

```
本番URL: https://kokoyakyu-days.jp
デプロイ日時: ____年__月__日
最新コミット: (最新コミットハッシュ)
```

---

## MySQL 移行手順（v0.25.0）

v0.25.0 から Redis の代わりに MySQL + Prisma で認証・セッション・セーブデータを管理します。
**VPS（162.43.92.107）** で以下の手順を実行してください。

### 前提

- VPS に MySQL が稼働中（DB: `koushien_sim`, user: `koushien`）
- Node.js 22 + pm2 環境
- プロジェクトが `/path/to/koushien-sim` にあること

### 手順

#### 1. Redis データをダンプして保全

```bash
cd /path/to/koushien-sim

# Redis の全データを JSON にダンプ（バックアップ）
REDIS_URL="redis://localhost:6379" bash scripts/dump-redis.sh
# → redis-dump-YYYYMMDD-HHMMSS.json が作成される
```

#### 2. .env に DATABASE_URL を追加

```bash
# .env を編集（存在しない場合は新規作成）
echo 'DATABASE_URL="mysql://koushien:QemCjuLI1eIpV5FgSoM8@localhost:3306/koushien_sim"' >> .env
```

#### 3. 最新コードを取得

```bash
git pull origin main
npm install
```

#### 4. Prisma マイグレーションを適用

```bash
npx prisma migrate deploy
# → User / Session / SaveData テーブルが作成される
```

#### 5. Redis データを MySQL に移行

```bash
DATABASE_URL="mysql://koushien:QemCjuLI1eIpV5FgSoM8@localhost:3306/koushien_sim" \
REDIS_URL="redis://localhost:6379" \
npx tsx scripts/migrate-redis-to-mysql.ts
```

出力例：
```
[migrate] === 完了 ===
  ユーザー  : 移行 1 件 / スキップ 0 件
  セッション: 移行 3 件 / スキップ 1 件（ゲスト or 期限切れ）
  セーブ    : 移行 1 件 / スキップ 0 件
```

#### 6. アプリを再起動

```bash
pm2 restart koushien-sim
pm2 logs koushien-sim --lines 50
# → エラーが出ないことを確認
```

#### 7. 動作確認

1. `https://kokoyakyu-days.jp` にアクセス
2. ログイン → セーブデータが引き継がれていることを確認

#### 8. Redis の停止（任意・確認後）

移行が正常に完了し数日問題なければ Redis を停止できます：

```bash
# Redis を停止（データは消えるが、MySQL に移行済み）
sudo systemctl stop redis
# sudo systemctl disable redis  # 自動起動も無効化する場合
```

### トラブルシューティング

| 症状 | 対処法 |
|------|--------|
| `P1001: Can't reach database server` | MySQL が起動しているか確認: `sudo systemctl status mysql` |
| `DATABASE_URL が設定されていません` | `.env` に `DATABASE_URL` を追加 |
| 移行後にログインできない | `prisma migrate deploy` が完了しているか確認 |
| セーブデータが消えた | `redis-dump-*.json` から手動で復元（スクリプト参照）|

---

最終更新: 2026-04-22
