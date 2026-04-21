/**
 * player-concern.ts — 選手の「今の気持ち」動的生成 (Phase 11.5-E)
 */

import type { Player } from '../../engine/types/player';
import { getMotivation } from '../../engine/growth/motivation';

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

const CONCERNS: Record<string, string[]> = {
  low_motivation_bench: [
    'レギュラーを取りたいのに、なかなかチャンスが回ってこない…',
    '最近、自分の成長が止まった気がする。何か変えなければ。',
    'スタメンに入るには、あと何が足りないのだろうか。',
  ],
  low_motivation_fatigue: [
    '体が重い。でも休んでいる場合じゃない…葛藤する。',
    '疲れが抜けなくて、練習に集中できていない気がする。',
    '休みたい気持ちと、追い込みたい気持ちが戦っている。',
  ],
  high_motivation: [
    '今は体も動くし、打球にも感触がある。この調子を保ちたい！',
    'チームのために自分の力を出し切りたい。燃えている。',
    '最近の調子なら何でもできそうな気がする。自信がある。',
  ],
  injury: [
    '早く治して試合に出たい。焦る気持ちを抑えながら治療中。',
    'けがをして初めて、野球ができることのありがたさを感じる。',
    'チームの皆が頑張っているのに、何もできないもどかしさ…',
  ],
  pre_tournament: [
    '大会が近い。緊張するけど、ずっと目指してきた舞台だ。',
    'この大会のために練習してきた。悔いなく全力を出したい。',
    '対戦相手の情報を頭に入れて、準備は万全にしたい。',
  ],
  normal: [
    '毎日の積み重ねが大切。今日も丁寧に練習したい。',
    '自分の課題と向き合いながら、少しずつ上手くなりたい。',
    'チームの雰囲気が良い。この環境で成長できていると感じる。',
    'もっと基礎を固めれば、試合でもっと活躍できると思っている。',
  ],
};

export function generatePlayerConcern(
  player: Player,
  context: {
    isInTournamentSeason: boolean;
  },
  seed: string,
): string {
  const motivation = getMotivation(player);
  const fatigue = player.condition.fatigue;
  const hasInjury = player.condition.injury !== null;

  let category: string;

  if (hasInjury) {
    category = 'injury';
  } else if (context.isInTournamentSeason) {
    category = 'pre_tournament';
  } else if (motivation >= 70) {
    category = 'high_motivation';
  } else if (motivation <= 30 && fatigue >= 50) {
    category = 'low_motivation_fatigue';
  } else if (motivation <= 30) {
    category = 'low_motivation_bench';
  } else {
    category = 'normal';
  }

  const candidates = CONCERNS[category] ?? CONCERNS.normal;
  const idx = simpleHash(seed + category) % candidates.length;
  return candidates[idx];
}
