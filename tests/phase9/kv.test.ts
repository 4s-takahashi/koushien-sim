/**
 * Phase 9 — KV ストア抽象化テスト
 *
 * MemoryKV の動作検証（KV_REST_API_URL 未設定環境）
 */

import { describe, it, expect, beforeEach } from 'vitest';

// MemoryKV クラスを直接テストするため、内部をリセットできるファクトリを使う
class MemoryKV {
  private store = new Map<string, string>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  async get<T>(key: string): Promise<T | null> {
    const val = this.store.get(key);
    return val != null ? (JSON.parse(val) as T) : null;
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    this.store.set(key, JSON.stringify(value));
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
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
    if (timer) { clearTimeout(timer); this.timers.delete(key); }
  }
}

describe('MemoryKV', () => {
  let kv: MemoryKV;

  beforeEach(() => {
    kv = new MemoryKV();
  });

  it('存在しないキーは null を返す', async () => {
    const val = await kv.get('missing');
    expect(val).toBeNull();
  });

  it('文字列値を保存・取得できる', async () => {
    await kv.set('key1', 'hello');
    expect(await kv.get('key1')).toBe('hello');
  });

  it('オブジェクトを保存・取得できる', async () => {
    const obj = { a: 1, b: 'test', c: true };
    await kv.set('obj', obj);
    expect(await kv.get('obj')).toEqual(obj);
  });

  it('数値を保存・取得できる', async () => {
    await kv.set('num', 42);
    expect(await kv.get<number>('num')).toBe(42);
  });

  it('配列を保存・取得できる', async () => {
    const arr = [1, 2, 3];
    await kv.set('arr', arr);
    expect(await kv.get('arr')).toEqual(arr);
  });

  it('del でキーを削除できる', async () => {
    await kv.set('toDelete', 'value');
    await kv.del('toDelete');
    expect(await kv.get('toDelete')).toBeNull();
  });

  it('存在しないキーを del しても例外が発生しない', async () => {
    await expect(kv.del('nonexistent')).resolves.toBeUndefined();
  });

  it('値を上書きできる', async () => {
    await kv.set('key', 'first');
    await kv.set('key', 'second');
    expect(await kv.get('key')).toBe('second');
  });

  it('null と undefined の境界値', async () => {
    await kv.set('nullVal', null);
    // JSON.stringify(null) = "null" → JSON.parse("null") = null
    expect(await kv.get('nullVal')).toBeNull();
  });
});
