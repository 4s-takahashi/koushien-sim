/**
 * src/lib/kv.ts — KV ストア抽象化
 *
 * 優先順位:
 *   1. Redis (REDIS_URL 環境変数あり) ← 本番推奨、永続化
 *   2. Vercel KV (KV_REST_API_URL 等) ← Vercel デプロイ時
 *   3. MemoryKV ← 開発時のみ（プロセス終了で全消失）
 *
 * 2026-04-19 修正: 本番 VPS で MemoryKV にフォールバックしていたため、
 * pm2 restart のたびに全ユーザーデータが消失していた。
 * Redis を第1優先に追加して解決。
 */

// ⚠️ このファイルは ioredis (Node.js 専用) を参照するためサーバーサイド専用。
// Client Component から直接/間接 import するとビルドエラーになる。
// テスト環境では server-only をスキップ（テストは API routes を直接テストしないため）
if (typeof process !== 'undefined' && !process.env.VITEST) {
  require('server-only');
}

// ============================================================
// KV インターフェース
// ============================================================

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ex?: number }): Promise<void>;
  del(key: string): Promise<void>;
}

// ============================================================
// メモリ内モック（開発用）
// ============================================================

class MemoryKV implements KVStore {
  private store = new Map<string, string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  async get<T>(key: string): Promise<T | null> {
    const val = this.store.get(key);
    return val != null ? (JSON.parse(val) as T) : null;
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    this.store.set(key, JSON.stringify(value));
    // 既存タイマーをクリア
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    // TTL設定
    if (options?.ex) {
      const timer = setTimeout(() => {
        this.store.delete(key);
        this.timers.delete(key);
      }, options.ex * 1000);
      this.timers.set(key, timer);
    }
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }
}

// ============================================================
// Redis アダプター（ioredis 直結）
// ============================================================

class RedisKVAdapter implements KVStore {
  // ioredis は optional dependency 扱いで require するため any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: any) {
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> {
    const val = await this.client.get(key);
    if (val == null) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      // plain string 保存の互換性（Vercel KV は value をそのまま扱えるが、
      // ここではオブジェクトも文字列も JSON で統一保存している）
      return val as unknown as T;
    }
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    const serialized = JSON.stringify(value);
    if (options?.ex) {
      await this.client.set(key, serialized, 'EX', options.ex);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

// ============================================================
// Vercel KV アダプター
// ============================================================

class VercelKVAdapter implements KVStore {
  private client: import('@vercel/kv').VercelKV;

  constructor(client: import('@vercel/kv').VercelKV) {
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.client.get<T>(key);
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    if (options?.ex) {
      await this.client.set(key, value, { ex: options.ex });
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

// ============================================================
// エクスポート
// ============================================================

function createKV(): KVStore {
  // ── 優先度1: Redis (REDIS_URL) ──
  if (process.env.REDIS_URL) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require('ioredis');
      const client = new Redis(process.env.REDIS_URL, {
        // 接続失敗時に無限リトライせず落とす
        maxRetriesPerRequest: 3,
        lazyConnect: false,
        // 本番稼働時のノイズ抑制
        enableOfflineQueue: true,
      });

      client.on('error', (err: Error) => {
        console.error('[KV/Redis] Error:', err.message);
      });
      client.on('connect', () => {
        console.log('[KV/Redis] Connected to', process.env.REDIS_URL);
      });

      return new RedisKVAdapter(client);
    } catch (err) {
      console.error('[KV] ioredis load failed:', err);
      // フォールバックせず throw する（本番でサイレントに MemoryKV に落ちるのは危険）
      throw new Error(
        `REDIS_URL が設定されていますが、ioredis のロードに失敗しました: ${(err as Error).message}`,
      );
    }
  }

  // ── 優先度2: Vercel KV ──
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { kv } = require('@vercel/kv');
      return new VercelKVAdapter(kv);
    } catch {
      console.warn('[KV] Failed to load @vercel/kv, falling back to MemoryKV');
      return new MemoryKV();
    }
  }

  // ── 優先度3: MemoryKV (開発時のみ) ──
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(
      '[KV] ⚠️  本番環境で MemoryKV が選択されました。pm2 restart でデータが全消失します！',
      'REDIS_URL または KV_REST_API_URL を設定してください。',
    );
  }
  return new MemoryKV();
}

// シングルトン（開発時は同一プロセス内で共有）
export const db: KVStore = createKV();
