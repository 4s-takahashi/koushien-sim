import { describe, it, expect } from 'vitest';
import { generateId } from '@/engine/core/id';

describe('generateId', () => {
  it('UUID形式の文字列を返す', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('ユニークなIDを生成する', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
