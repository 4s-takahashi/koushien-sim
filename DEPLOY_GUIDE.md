# デプロイ手順書

「甲子園への道」を Vercel に本番デプロイする手順です。

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
本番URL: https://_____.vercel.app
デプロイ日時: ____年__月__日
最新コミット: 1b14874
```

---

最終更新: 2026-04-16
