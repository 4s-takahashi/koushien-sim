import { describe, it, expect } from 'vitest';
import { LAST_NAMES, FIRST_NAMES, pickLastName, pickFirstName } from '@/engine/player/name-dict';
import { createRNG } from '@/engine/core/rng';

describe('name-dict', () => {
  it('苗字辞書が200件ある', () => {
    expect(LAST_NAMES.length).toBe(200);
  });

  it('名前辞書が200件ある', () => {
    expect(FIRST_NAMES.length).toBe(200);
  });

  it('苗字に重複がない', () => {
    expect(new Set(LAST_NAMES).size).toBe(LAST_NAMES.length);
  });

  it('名前に重複がない', () => {
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
  });

  it('pickLastName / pickFirstName が辞書から選択する', () => {
    const rng = createRNG('name-pick-test');
    const ln = pickLastName(rng);
    const fn = pickFirstName(rng);
    expect(LAST_NAMES).toContain(ln);
    expect(FIRST_NAMES).toContain(fn);
  });
});
