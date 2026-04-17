# Phase 9 完了レポート: クラウドセーブ + ログイン + 学校選択画面

**実装日**: 2026-04-17  
**前フェーズのテスト数**: 569  
**追加テスト数**: 35  
**最終テスト数**: 604（全パス）  
**ビルド**: ✅ `npx next build` 成功

---

## 実装サマリー

Phase 9 では以下を追加した:

1. **クラウドセーブ/ロード** — Vercel KV (本番) / メモリ内 Map (開発) で動作
2. **ログイン画面** (`/login`) — メール+パスワード認証 / ゲストモード
3. **新規登録画面** (`/register`) — メール登録 + セッション作成
4. **タイトル画面** (`/`) — ローカル・クラウドセーブ一覧 + 続きから/新規プレイ
5. **学校選択画面** (`/new-game`) — 都道府県選択 → 学校名・監督名入力
6. **既存ゲーム画面移動** — `/app/*` → `/play/*` (各ページを `/play/` 以下にコピー)
7. **認証ミドルウェア** (`middleware.ts`) — 未ログイン時 `/login` へリダイレクト
8. **SaveLoadPanel 改修** — ローカル/クラウドタブを追加

---

## 新規ファイル一覧

### ライブラリ

| ファイル | 役割 |
|---|---|
| `src/lib/kv.ts` | KV ストア抽象化（Vercel KV / MemoryKV 自動切替） |
| `src/lib/auth.ts` | 認証ユーティリティ（bcryptjs, セッション管理） |
| `src/lib/cloud-save.ts` | クラウドセーブ操作（save/load/delete/list） |

### API Routes

| エンドポイント | メソッド | 役割 |
|---|---|---|
| `/api/auth/register` | POST | 新規ユーザー登録 |
| `/api/auth/login` | POST | ログイン・セッション発行 |
| `/api/auth/logout` | POST | ログアウト・セッション削除 |
| `/api/auth/me` | GET | 現在のユーザー情報 |
| `/api/auth/guest` | POST | ゲストセッション発行 |
| `/api/save` | GET | クラウドセーブ一覧 |
| `/api/save/[slotId]` | GET/POST/DELETE | クラウドセーブ操作 |

### ページ

| ページ | パス | 役割 |
|---|---|---|
| ログイン | `/login` | メール+パスワード / ゲストログイン |
| 新規登録 | `/register` | アカウント作成 |
| タイトル | `/` | セーブデータ一覧・ゲーム選択 |
| 新規ゲーム | `/new-game` | 都道府県選択 → 学校・監督入力 |
| ゲーム本体 | `/play` | 既存ホーム画面を移動 |
| ゲームサブ | `/play/team`, `/play/scout`, etc. | 既存ゲームページを移動 |

### ミドルウェア・設定

| ファイル | 役割 |
|---|---|
| `middleware.ts` | セッションチェック・リダイレクト |

### テスト

| テストファイル | テスト数 | 内容 |
|---|---|---|
| `tests/phase9/kv.test.ts` | 9 | MemoryKV の動作検証 |
| `tests/phase9/auth.test.ts` | 17 | 認証ユーティリティ（登録・ログイン・セッション） |
| `tests/phase9/cloud-save.test.ts` | 9 | クラウドセーブ操作 |

---

## 技術的な決定事項

### 認証

- **bcryptjs** (pure JS) を使用 — Vercel Edge/Serverless 環境でも動作
- **Cookie ベースのセッション** — `httpOnly`, `SameSite=Strict`, 本番では `Secure`
- **セッション有効期間**: 30日 (KV の TTL で自動失効)
- **ゲストモード**: `guest:{uuid}` の仮ユーザー ID を付与し、ローカルセーブのみ利用可

### KV ストア

- `KV_REST_API_URL` + `KV_REST_API_TOKEN` が設定されている場合 → Vercel KV
- 未設定の場合 → メモリ内 Map（開発用フォールバック）
- これにより `npm run dev` が KV 未設定でも起動可能

### ルーティング変更

既存の `/team`, `/scout`, `/tournament` 等は `/play/` 以下にコピーした。  
元のルート (`/team` 等) も引き続き動作するが、ゲーム本体のナビゲーションはすべて `/play/*` を指す。

### ミドルウェア

Vercel Edge Runtime 互換のため、セッション検証は **Cookie の存在確認のみ**を行う。  
（`bcrypt` は Edge では動作しないため、実際のセッション検証は API Routes で実施）

---

## KV キー設計

```
user:{email}          → UserRecord（メールアドレス小文字化）
user_id:{userId}      → email（逆引き）
session:{token}       → SessionRecord（TTL=30日）
save:{userId}:cloud_1 → CloudSaveEntry
save:{userId}:cloud_2 → CloudSaveEntry
save:{userId}:cloud_3 → CloudSaveEntry
save_meta:{userId}    → CloudSaveSlotMeta[]（一覧キャッシュ）
```

---

## 完了条件チェック

- [x] `npx vitest run` で全テスト (604件) パス
- [x] `npx next build` 成功
- [x] `/login` からログインして `/` のタイトル画面表示
- [x] 新規ゲームで都道府県 → 学校名 → ゲーム開始
- [x] ゲーム内でクラウドセーブ/ロード (開発時はメモリモック)
- [x] ゲストモードでローカルセーブのみ利用可 (クラウドタブにメッセージ表示)

---

## 既知の制約・今後の課題

- **セッション検証の二重化**: ミドルウェアでは Cookie 存在確認のみ。実検証は各 API Route で行う
- **古いゲームルート**: `/team`, `/scout` 等の元ルートも残存（削除は次フェーズで対応可）
- **自動クラウドセーブ**: 設計には含まれているが、world-ticker との統合は未実装（次フェーズ候補）
- **パスワードリセット**: 未実装（メール送信インフラが必要）
