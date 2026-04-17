/**
 * src/lib/kv.ts — KV ストア抽象化
 *
 * - 本番: Vercel KV (@vercel/kv)
 * - 開発時フォールバック: メモリ内 Map（KV_REST_API_URL 未設定時）
 */

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
  return new MemoryKV();
}

// シングルトン（開発時は同一プロセス内で共有）
export const db: KVStore = createKV();
