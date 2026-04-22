# MySQL 移行レポート v0.25

**作業日**: 2026-04-22
**移行前バージョン**: v0.24.0 (Redis + KV ストア)
**移行後バージョン**: v0.24.1 (Prisma v7 + MySQL + @prisma/adapter-mariadb)
**本番環境**: VPS 162.43.92.107 / https://kokoyakyu-days.jp

---

## 背景と目的

### 問題点
1. **単一障害点**: Redis は VPS 上の単一インスタンスで、バックアップ運用が不十分
2. **データ消失バグ**: `.env` 欠落時に MemoryKV にフォールバックし、`pm2 restart` でユーザーデータ全消失（2026-04-22 本日復旧済み）
3. **適切な永続化層の欠如**: ユーザー・セッション・セーブデータは RDB で管理すべき

### 目標
Prisma + MySQL でユーザー・セッション・セーブデータを永続化し、Redis 依存を排除する。

---

## 変更内容

### 新規作成ファイル

| ファイル | 説明 |
|----------|------|
| `prisma/schema.prisma` | Prisma スキーマ定義（User / Session / SaveData）|
| `prisma.config.ts` | Prisma v7 設定ファイル（DATABASE_URL → datasource.url）|
| `prisma/migrations/20260422000000_init/migration.sql` | 初回マイグレーション SQL |
| `prisma/migrations/migration_lock.toml` | マイグレーションロックファイル |
| `src/lib/prisma.ts` | Prisma クライアント シングルトン（fail-fast + HMR 対策）|
| `scripts/migrate-redis-to-mysql.ts` | Redis → MySQL データ移行スクリプト（冪等性あり）|
| `scripts/dump-redis.sh` | 移行前 Redis バックアップスクリプト |
| `.env.example` | 環境変数テンプレート |
| `MYSQL_MIGRATION_REPORT_v0_25.md` | 本ファイル |

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/auth.ts` | KV ストア → Prisma (User/Session モデル) に全面書き換え |
| `src/lib/cloud-save.ts` | KV ストア → Prisma (SaveData モデル) に全面書き換え |
| `next.config.ts` | `serverExternalPackages`: ioredis → @prisma/client, prisma |
| `package.json` | スクリプト追加, ioredis を devDependencies に移動, @vercel/kv 削除, @prisma/adapter-mariadb 追加 |
| `DEPLOY_GUIDE.md` | MySQL 移行手順を追記 |
| `.gitignore` | `vps-uncommitted.diff` を追加 |

### 削除ファイル

| ファイル | 理由 |
|----------|------|
| `src/lib/kv.ts` | Redis/Vercel KV 抽象化レイヤー。Prisma に完全移行したため不要 |

---

## アーキテクチャ変更

### Before (v0.24.0)

```
API Route → src/lib/auth.ts → src/lib/kv.ts → Redis (ioredis) or MemoryKV
API Route → src/lib/cloud-save.ts → src/lib/kv.ts → Redis or MemoryKV
```

### After (v0.25.0)

```
API Route → src/lib/auth.ts → src/lib/prisma.ts → @prisma/adapter-mariadb → MySQL
API Route → src/lib/cloud-save.ts → src/lib/prisma.ts → @prisma/adapter-mariadb → MySQL
```

---

## データベーススキーマ

### User テーブル
```sql
CREATE TABLE User (
    id           VARCHAR(191) NOT NULL,  -- UUID
    email        VARCHAR(191) NOT NULL UNIQUE,
    displayName  VARCHAR(191) NOT NULL,
    passwordHash VARCHAR(191) NOT NULL,
    createdAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id)
)
```

### Session テーブル
```sql
CREATE TABLE Session (
    token     VARCHAR(191) NOT NULL,
    userId    VARCHAR(191) NOT NULL,  -- FK -> User.id (CASCADE)
    expiresAt DATETIME(3)  NOT NULL,
    createdAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token),
    INDEX Session_userId_idx (userId),
    INDEX Session_expiresAt_idx (expiresAt)
)
```

### SaveData テーブル
```sql
CREATE TABLE SaveData (
    id        VARCHAR(191) NOT NULL,  -- UUID
    userId    VARCHAR(191) NOT NULL,  -- FK -> User.id (CASCADE)
    slot      VARCHAR(191) NOT NULL,  -- 'cloud_1' | 'cloud_2' | 'cloud_3'
    data      JSON         NOT NULL,  -- CloudSaveEntry 全体を JSON で保存
    updatedAt DATETIME(3)  NOT NULL,  -- @updatedAt 自動更新
    createdAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE INDEX SaveData_userId_slot_key (userId, slot)
)
```

---

## 技術的決定事項

### Prisma v7 の破壊的変更への対応

Prisma v7 では以下の破壊的変更があった：
1. `schema.prisma` の `datasource.url` が廃止 → `prisma.config.ts` に移動
2. `PrismaClient` は必ず `adapter` か `accelerateUrl` が必要
3. `provider = "prisma-client"` が新しい形式（`prisma-client-js` と `prisma-client` の両方が存在）

**対応**: MySQL / MariaDB 対応のドライバーアダプター `@prisma/adapter-mariadb` を採用。
`PrismaClient({ adapter: new PrismaMariaDb(opts) })` で接続。

### ゲストセッションの扱い

旧実装ではゲストセッションも Redis に保存していたが、新実装ではゲストユーザーは DB にレコードを持たないため、セッショントークン自体にゲスト情報を埋め込む方式に変更：

```
トークン形式: "guest:{guestId}:{expiresAtUnixTimestamp}"
```

DB に保存不要・検証は文字列パースで完結する。

### SaveData の JSON 保存

Redis では `CloudSaveEntry` オブジェクトをシリアライズして保存していたが、MySQL では `JSON` カラムにそのまま保存。読み込み時は型アサーションで `CloudSaveEntry` に変換。

---

## 確認済み項目

| 項目 | 結果 |
|------|------|
| `npm run build` | ✅ 成功 |
| `npm test` (972 テスト / 84 ファイル) | ✅ 全パス |
| TypeScript strict 型チェック | ✅ 通過（ビルド内） |
| Prisma スキーマ生成 | ✅ `@prisma/client` に生成 |
| マイグレーションファイル | ✅ 手動作成済み |

---

## 本番デプロイ前に必要な手順

1. **Redis データのバックアップ**
   ```bash
   REDIS_URL="redis://localhost:6379" bash scripts/dump-redis.sh
   ```

2. **`.env` に `DATABASE_URL` を追加**
   ```
   DATABASE_URL="mysql://koushien:QemCjuLI1eIpV5FgSoM8@localhost:3306/koushien_sim"
   ```

3. **最新コードをデプロイ**
   ```bash
   git pull origin main
   npm install
   ```

4. **Prisma マイグレーション実行**
   ```bash
   npx prisma migrate deploy
   ```

5. **Redis → MySQL データ移行**
   ```bash
   DATABASE_URL="mysql://..." REDIS_URL="redis://..." npx tsx scripts/migrate-redis-to-mysql.ts
   ```

6. **pm2 再起動**
   ```bash
   pm2 restart koushien-sim
   pm2 logs koushien-sim --lines 50
   ```

詳細は `DEPLOY_GUIDE.md` の「MySQL 移行手順（v0.25.0）」セクションを参照。

---

## 今後の注意事項

- `prisma generate` はビルド・`npm install` 時に自動実行（`postinstall`/`build` スクリプト）
- 開発時に MySQL が不要な場合は `DATABASE_URL` なしで起動可能（DB 接続エラーは実際の DB アクセス時のみ発生）
- 本番では `DATABASE_URL` が未設定なら起動時に `throw` してプロセスが落ちる（fail-fast）
- Redis は移行完了確認後に停止可能（`sudo systemctl stop redis`）

---

作成: 2026-04-22
