/**
 * 選手サンプル生成スクリプト
 * 実行: npx tsx tests/sample-players.ts
 */
import { createRNG } from '../src/engine/core/rng';
import { generatePlayer, type PlayerGenConfig } from '../src/engine/player/generate';
import type { Player } from '../src/engine/types/player';

const config: PlayerGenConfig = {
  enrollmentYear: 1,
  schoolReputation: 50,
};

const rng = createRNG('sample-seed-2026');

function formatPlayer(p: Player, index: number): string {
  const pitchInfo = p.stats.pitching
    ? `球速=${p.stats.pitching.velocity}km/h, 制球=${p.stats.pitching.control}, スタミナ=${p.stats.pitching.pitchStamina}, 球種=${Object.entries(p.stats.pitching.pitches).map(([k, v]) => `${k}(Lv${v})`).join(', ')}`
    : '（野手）';

  return `
━━━ 選手 #${index + 1} ━━━
名前: ${p.lastName} ${p.firstName}
ポジション: ${p.position}
投打: ${p.throwingHand === 'left' ? '左投' : '右投'} / ${p.battingSide === 'left' ? '左打' : p.battingSide === 'switch' ? '両打' : '右打'}
身長/体重: ${p.height}cm / ${p.weight}kg
成長タイプ: ${p.potential.growthType}
性格特性: ${p.traits.join(', ')}
出身: ${p.background.hometown} (${p.background.middleSchool})

【基礎能力】
  スタミナ=${p.stats.base.stamina}, 走力=${p.stats.base.speed}, 肩力=${p.stats.base.armStrength}
  守備=${p.stats.base.fielding}, 集中=${p.stats.base.focus}, 精神=${p.stats.base.mental}

【打撃】
  ミート=${p.stats.batting.contact}, パワー=${p.stats.batting.power}
  選球眼=${p.stats.batting.eye}, 技術=${p.stats.batting.technique}

【投球】
  ${pitchInfo}

【ポテンシャル天井】
  成長率=${p.potential.growthRate.toFixed(2)}
  基礎上限: スタミナ=${p.potential.ceiling.base.stamina}, 走力=${p.potential.ceiling.base.speed}
  打撃上限: ミート=${p.potential.ceiling.batting.contact}, パワー=${p.potential.ceiling.batting.power}

【コンディション】
  疲労=${p.condition.fatigue}, 気分=${p.condition.mood}
  ストレス=${p.mentalState.stress}, 自信=${p.mentalState.confidence}
`;
}

console.log('=== 甲子園シミュレーション: 選手サンプル生成 ===');
console.log(`シード: "sample-seed-2026" / レピュテーション: 50`);
console.log('');

for (let i = 0; i < 5; i++) {
  const player = generatePlayer(rng.derive(`sample-${i}`), config);
  console.log(formatPlayer(player, i));
}
