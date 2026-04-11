import type { PracticeMenu, PracticeMenuId, DayType } from '../types/calendar';

export function getPracticeMenus(): PracticeMenu[] {
  return [
    {
      id: 'batting_basic',
      name: '打撃基礎',
      description: '素振り・ティー打撃で基礎を固める',
      fatigueLoad: 5,
      statEffects: [
        { target: 'batting.contact', baseGain: 0.3 },
        { target: 'batting.technique', baseGain: 0.2 },
      ],
      duration: 'half',
    },
    {
      id: 'batting_live',
      name: '実戦打撃',
      description: 'フリーバッティングで実戦感覚を磨く',
      fatigueLoad: 8,
      statEffects: [
        { target: 'batting.contact', baseGain: 0.2 },
        { target: 'batting.power', baseGain: 0.3 },
        { target: 'batting.eye', baseGain: 0.2 },
      ],
      duration: 'full',
    },
    {
      id: 'pitching_basic',
      name: '投球基礎',
      description: 'シャドーピッチング・キャッチボールで基礎を固める',
      fatigueLoad: 6,
      statEffects: [
        { target: 'pitching.control', baseGain: 0.3 },
        { target: 'pitching.pitchStamina', baseGain: 0.2 },
      ],
      duration: 'half',
    },
    {
      id: 'pitching_bullpen',
      name: 'ブルペン投球',
      description: 'ブルペンで全力投球の感覚を磨く',
      fatigueLoad: 10,
      statEffects: [
        { target: 'pitching.velocity', baseGain: 0.2 },
        { target: 'pitching.control', baseGain: 0.2 },
        { target: 'pitching.pitchStamina', baseGain: 0.2 },
      ],
      duration: 'full',
    },
    {
      id: 'fielding_drill',
      name: '守備練習',
      description: 'ノック・守備練習で守備力を向上',
      fatigueLoad: 6,
      statEffects: [
        { target: 'base.fielding', baseGain: 0.4 },
        { target: 'base.armStrength', baseGain: 0.1 },
      ],
      duration: 'half',
    },
    {
      id: 'running',
      name: '走り込み',
      description: '走り込みで脚力とスタミナを強化',
      fatigueLoad: 10,
      statEffects: [
        { target: 'base.speed', baseGain: 0.3 },
        { target: 'base.stamina', baseGain: 0.3 },
      ],
      duration: 'full',
    },
    {
      id: 'strength',
      name: '筋力トレーニング',
      description: 'ウェイトトレーニングで身体を強化',
      fatigueLoad: 8,
      statEffects: [
        { target: 'batting.power', baseGain: 0.3 },
        { target: 'base.armStrength', baseGain: 0.2 },
        { target: 'base.stamina', baseGain: 0.1 },
      ],
      duration: 'full',
    },
    {
      id: 'mental',
      name: 'メンタルトレーニング',
      description: '精神力・集中力を鍛える',
      fatigueLoad: 2,
      statEffects: [
        { target: 'base.mental', baseGain: 0.3 },
        { target: 'base.focus', baseGain: 0.3 },
      ],
      duration: 'half',
    },
    {
      id: 'rest',
      name: '休養',
      description: '体を休めて疲労を回復する',
      fatigueLoad: -15,
      statEffects: [],
      duration: 'half',
    },
  ];
}

export function getPracticeMenuById(id: PracticeMenuId): PracticeMenu {
  const menus = getPracticeMenus();
  const menu = menus.find((m) => m.id === id);
  if (!menu) throw new Error(`Unknown practice menu: ${id}`);
  return menu;
}

export function getDefaultMenu(dayType: DayType): PracticeMenuId {
  switch (dayType) {
    case 'camp_day': return 'batting_live';
    case 'off_day': return 'rest';
    case 'holiday': return 'batting_live';
    case 'school_day': return 'batting_basic';
    case 'tournament_day': return 'rest';
    case 'ceremony_day': return 'rest';
    default: return 'batting_basic';
  }
}
