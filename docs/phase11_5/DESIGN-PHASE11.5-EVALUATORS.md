# Phase 11.5-C — 評価者システム（メディア・批評家・スカウト）

**作成日:** 2026-04-21
**新規ファイル:**
- `src/engine/types/evaluator.ts`
- `src/engine/evaluator/evaluator-registry.ts`
- `src/engine/evaluator/rank-calculator.ts`
- `src/ui/labels/evaluator-labels.ts`

---

## 1. 目的

選手が「誰かに見られている」という感覚を生むことで、ゲームに物語的緊張感を加える。

- **メディア4社**: チーム・選手全体のパブリックイメージを左右する
- **批評家10人**: 個性的な評価視点を持つ辛口・甘口の識者たち
- **スカウト10人**: プロ球団のスカウトマン。ドラフト前哨として機能

各評価者は選手に **SSS〜F の9段階ランク**で「注目度」を付ける。
評価者ごとに得意分野や癖があり、同じ選手でも評価が分かれる。

---

## 2. 評価者一覧（全24人・架空命名）

### 2.1 メディア（4社）

| ID | 社名 | 略称 | 得意分野 | 癖 |
|---|---|---|---|---|
| `media_diamond` | ダイヤモンド野球通信 | 野球通 | 投手評価 | やや甘め、長文コメントが多い |
| `media_captain` | 週刊キャプテン | キャプテン | 打者評価 | スター性重視、ルックスにも言及 |
| `media_hardball` | ハードボール・タイムズ | HBT | データ分析 | 数値厳格、感情的描写なし |
| `media_koshien_watch` | 甲子園ウォッチャー | 甲子園W | 甲子園実績 | 甲子園出場校の選手を高評価しがち |

### 2.2 批評家（10人）

| ID | 名前 | 専門 | 癖 |
|---|---|---|---|
| `critic_ogata` | 尾形 直樹 | 投手フォーム分析 | 制球重視、球速は過小評価 |
| `critic_mizushima` | 水島 良太 | 打撃フォーム | パワーより技術派、フォーム厳格 |
| `critic_kuroda` | 黒田 彩子 | メンタル・選手心理 | 精神面・モチベーションを重視 |
| `critic_azuma` | 東 健太郎 | 守備・走塁 | 守備率・走塁センスのみ評価 |
| `critic_shibata` | 柴田 豪 | 総合評価 | 辛口で有名、SSS はほとんど出さない |
| `critic_noda` | 野田 光一 | 高校野球史 | OB・伝統校の選手を過大評価しがち |
| `critic_hanamura` | 花村 美優 | フィジカル・体格 | 体格スペックで判断しがち |
| `critic_goto` | 後藤 勝也 | バッテリー評価 | 投手と捕手のコンビネーション専門 |
| `critic_takamori` | 高森 誠司 | 将来性・成長曲線 | 晩成型選手（late growth）を高評価 |
| `critic_enomoto` | 榎本 俊夫 | 変化球・ピッチング多様性 | 変化球種類が多い投手を高評価 |

### 2.3 スカウト（10人）

| ID | 名前 | 所属球団 | 専門 | 癖 |
|---|---|---|---|---|
| `scout_fujiwara` | 藤原 勝利 | 東都ワイルドキャッツ | 投手スカウト | 最速150km/h超を強く評価 |
| `scout_matsuda` | 松田 誠一 | 西日本フェニックス | 野手スカウト | 長打力重視（パワー≥70 なら S以上） |
| `scout_hayashi` | 林 公平 | 中部ドラゴンズ | 捕手専門 | 捕手しか評価しない（他ポジションはB固定） |
| `scout_kogure` | 小暮 陽介 | 北海道ベアーズ | 総合スカウト | バランス型を評価、特化型は低め |
| `scout_nakata` | 中田 文夫 | 関西タイガーキャッツ | 外野スカウト | 足の速さを最重視 |
| `scout_uchida` | 内田 壮介 | 首都ジャイアンツ | 投手スカウト | 制球（control）を最重視 |
| `scout_yamane` | 山根 順二 | 九州ホークス | 野手スカウト | 高校通算本塁打数で判断しがち |
| `scout_miura` | 三浦 隆二 | 東北イーグルス | 遊撃手専門 | 守備・走力の組み合わせを評価 |
| `scout_ohata` | 大畑 和典 | 横浜マリンブルーズ | 投手スカウト | 変化球の多さより制球精度重視 |
| `scout_kiyose` | 清瀬 雅人 | 中日ドラゴンズ姉妹団 | 捕手・投手 | フレーミング、リード力を総合評価 |

---

## 3. 型定義

```ts
// src/engine/types/evaluator.ts

export type EvaluatorType = 'media' | 'critic' | 'scout';

export type EvaluatorRank = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** 評価者ごとの「得意分野」 */
export type EvaluatorFocus =
  | 'pitcher_overall'    // 投手総合
  | 'pitcher_velocity'   // 球速特化
  | 'pitcher_control'    // 制球特化
  | 'pitcher_breaking'   // 変化球特化
  | 'batter_overall'     // 打者総合
  | 'batter_power'       // パワー特化
  | 'batter_contact'     // ミート特化
  | 'batter_speed'       // 走塁特化
  | 'defense'            // 守備特化
  | 'mental'             // メンタル特化
  | 'catcher'            // 捕手特化
  | 'physique'           // 体格特化
  | 'potential'          // 将来性特化
  | 'overall'            // 総合
  | 'koshien_record';    // 甲子園実績重視

/** 評価の癖（バイアス） */
export interface EvaluatorBias {
  /** 全体的な評価を何段階ずらすか (-2 〜 +2) */
  generalBias: number;
  /** 特定の growthType に対するボーナス */
  growthTypeBias?: Partial<Record<GrowthType, number>>;
  /** 特定のポジションに対するボーナス */
  positionBias?: Partial<Record<Position, number>>;
  /** 特定の能力値閾値を超えた場合のボーナス */
  thresholdBonuses?: EvaluatorThresholdBonus[];
}

export interface EvaluatorThresholdBonus {
  statPath: string;         // 'stats.pitching.velocity' など dot notation
  threshold: number;        // この値以上なら bonus 適用
  rankBonus: number;        // ランクポイントへの加算 (1〜3)
}

export interface Evaluator {
  id: string;
  name: string;
  type: EvaluatorType;
  /** メディアの場合は社名、スカウトの場合は球団名 */
  affiliation: string;
  focus: EvaluatorFocus;
  bias: EvaluatorBias;
  /** 一言紹介（UI表示用） */
  description: string;
}

/** 評価者が選手に付けたランク記録 */
export interface EvaluatorPlayerRank {
  evaluatorId: string;
  playerId: string;
  rank: EvaluatorRank;
  /** ランクが付いた年・月 */
  updatedDate: GameDate;
  /** 評価コメント（架空テキスト） */
  comment?: string;
}

/** WorldState に追加する評価者状態 */
export interface EvaluatorState {
  /** 全評価者の定義（初期データから変更なし） */
  evaluators: Evaluator[];
  /** 評価者 × 選手のランク記録 */
  rankings: EvaluatorPlayerRank[];
}
```

---

## 4. ランク算出ロジック

```ts
// src/engine/evaluator/rank-calculator.ts

import type { Player } from '../types/player';
import type { Evaluator, EvaluatorRank } from '../types/evaluator';

/** ランクポイント → EvaluatorRank 変換テーブル（100点スケール）*/
const RANK_TABLE: Array<{ minScore: number; rank: EvaluatorRank }> = [
  { minScore: 95, rank: 'SSS' },
  { minScore: 87, rank: 'SS'  },
  { minScore: 78, rank: 'S'   },
  { minScore: 68, rank: 'A'   },
  { minScore: 55, rank: 'B'   },
  { minScore: 42, rank: 'C'   },
  { minScore: 30, rank: 'D'   },
  { minScore: 18, rank: 'E'   },
  { minScore:  0, rank: 'F'   },
];

export function calcEvaluatorRank(
  evaluator: Evaluator,
  player: Player,
): EvaluatorRank {
  // 1. ベーススコア: 選手の総合力（computePlayerOverall）を 0〜100 に正規化
  const baseScore = normalizeOverall(computePlayerOverall(player));

  // 2. フォーカス補正: 評価者の得意分野にマッチする能力への重み付け
  const focusScore = calcFocusScore(evaluator.focus, player);

  // 3. バイアス補正
  const biasScore = calcBiasScore(evaluator.bias, player);

  // 4. 合算（重み: base 50% + focus 35% + bias 15%）
  const totalScore = Math.min(100, Math.max(0,
    baseScore * 0.5 + focusScore * 0.35 + biasScore * 0.15
  ));

  // 5. ランクに変換
  return scoreToRank(totalScore);
}

function calcFocusScore(focus: EvaluatorFocus, player: Player): number {
  switch (focus) {
    case 'pitcher_velocity':
      return player.stats.pitching?.velocity ?? 0;
    case 'pitcher_control':
      return player.stats.pitching?.control ?? 0;
    case 'pitcher_breaking': {
      const p = player.stats.pitching?.pitches ?? {};
      return Math.max(p.slider ?? 0, p.curve ?? 0, p.fork ?? 0, p.changeup ?? 0);
    }
    case 'batter_power':
      return player.stats.batting.power;
    case 'batter_contact':
      return player.stats.batting.contact;
    case 'batter_speed':
      return player.stats.base.speed;
    case 'defense':
      return (player.stats.base.fielding + player.stats.base.armStrength) / 2;
    case 'mental':
      return (player.stats.base.mental + player.stats.base.focus) / 2;
    case 'potential':
      return player.potential.growthRate * 100;
    default:
      return normalizeOverall(computePlayerOverall(player));
  }
}

function calcBiasScore(bias: EvaluatorBias, player: Player): number {
  // generalBias: -2〜+2 段階 → -20〜+20 点に変換
  let score = 50 + bias.generalBias * 10;

  // growthType バイアス
  if (bias.growthTypeBias?.[player.potential.growthType]) {
    score += (bias.growthTypeBias[player.potential.growthType] ?? 0) * 10;
  }

  // thresholdBonus: 特定能力値が閾値以上ならボーナス
  for (const bonus of bias.thresholdBonuses ?? []) {
    const value = getNestedValue(player, bonus.statPath) as number;
    if (value >= bonus.threshold) {
      score += bonus.rankBonus * 8;
    }
  }

  return Math.min(100, Math.max(0, score));
}

function scoreToRank(score: number): EvaluatorRank {
  for (const entry of RANK_TABLE) {
    if (score >= entry.minScore) return entry.rank;
  }
  return 'F';
}
```

### 4.1 ランク更新タイミング

- **日次更新**: 月に1回（ゲーム内の1日・5日・10日・15日・20日・25日）に全評価者の全選手ランクを再計算
- **イベント更新**: 試合後（活躍があった場合）に関連評価者のランクを即時更新
- **重複計算の回避**: `EvaluatorState.rankings` をキャッシュとして使い、同日内は再計算しない

---

## 5. 初期データ（抜粋）

```ts
// src/engine/evaluator/evaluator-registry.ts

import type { Evaluator } from '../types/evaluator';

export const INITIAL_EVALUATORS: Evaluator[] = [
  {
    id: 'media_diamond',
    name: 'ダイヤモンド野球通信',
    type: 'media',
    affiliation: 'ダイヤモンド野球通信社',
    focus: 'pitcher_overall',
    bias: {
      generalBias: 1,  // やや甘め
      positionBias: { pitcher: 2 },
    },
    description: '投手評価に定評のある老舗野球専門誌。甘口で知られる。',
  },
  {
    id: 'critic_shibata',
    name: '柴田 豪',
    type: 'critic',
    affiliation: '独立',
    focus: 'overall',
    bias: {
      generalBias: -2, // 辛口
      thresholdBonuses: [
        { statPath: 'stats.pitching.velocity', threshold: 85, rankBonus: 2 },
        { statPath: 'stats.batting.power', threshold: 80, rankBonus: 2 },
      ],
    },
    description: '辛口で知られる独立批評家。SSS はほとんど出さない。',
  },
  {
    id: 'scout_fujiwara',
    name: '藤原 勝利',
    type: 'scout',
    affiliation: '東都ワイルドキャッツ',
    focus: 'pitcher_velocity',
    bias: {
      generalBias: 0,
      positionBias: { pitcher: 3 },
      thresholdBonuses: [
        { statPath: 'stats.pitching.velocity', threshold: 80, rankBonus: 3 },
      ],
    },
    description: '速球派投手を探す東都のスカウトマン。150km/h超を夢見る。',
  },
  // ... 残り21人は同様のパターンで定義
];
```

---

## 6. WorldState への追加

```ts
// src/engine/world/world-state.ts

interface WorldState {
  // 既存フィールド...

  /** 評価者状態（Phase 11.5-C） */
  evaluatorState?: EvaluatorState;  // optional で後方互換維持
}
```

### hydrate / dehydrate の対応

```ts
// src/engine/world/hydrate.ts

function hydrateWorldState(state: PersistedState): WorldState {
  return {
    // 既存...
    evaluatorState: state.evaluatorState ?? {
      evaluators: INITIAL_EVALUATORS,
      rankings: [],
    },
  };
}
```

---

## 7. UI への反映

### 7.1 ホーム画面「評価者」タブ

```
評価者ハイライト（今週の注目）
  ┌──────────────────────────────────┐
  │ 📰 ダイヤモンド野球通信           │
  │    田中 一郎（桜葉高校）→ SS      │
  │    「今年一番の速球派投手候補」   │
  ├──────────────────────────────────┤
  │ 🔍 藤原 勝利（東都スカウト）      │
  │    田中 一郎（桜葉高校）→ S       │
  │    「最速142km/h、伸び代あり」   │
  ├──────────────────────────────────┤
  │ ✍️ 柴田 豪                        │
  │    野田 次郎（海浜高校）→ A       │
  │    「地味だが制球力は本物」       │
  └──────────────────────────────────┘
```

### 7.2 選手詳細画面「評価」セクション（Phase 11.5-D と連携）

```
評価者の注目度
  メディア: ★★★ (4社中 3社が A以上)
  批評家:   ★★☆ (10人中 6人が B以上)
  スカウト: ★★★ (10人中 8人が A以上)

  注目評価者ベスト3:
  [藤原 勝利] SS — 「ドラフト候補筆頭」
  [水島 良太] S  — 「打撃センスは逸品」
  [柴田 豪]   B  — 「まだ甘さが残る」
```

---

## 8. 既存コードへの影響

| ファイル | 変更内容 |
|---|---|
| `src/engine/types/evaluator.ts` | 新規作成 |
| `src/engine/evaluator/evaluator-registry.ts` | 新規作成（24人の初期データ） |
| `src/engine/evaluator/rank-calculator.ts` | 新規作成 |
| `src/engine/world/world-state.ts` | `evaluatorState?` フィールド追加 |
| `src/engine/world/hydrate.ts` | evaluatorState の初期化処理追加 |
| `src/engine/calendar/day-processor.ts` | 月次でランク再計算のバッチ処理追加 |
| `src/ui/projectors/view-state-types.ts` | `EvaluatorHighlight` 型追加（home UI用） |
| `src/ui/projectors/homeProjector.ts` | evaluatorHighlights の生成追加 |

---

## 9. リスク・トレードオフ

- **パフォーマンス**: 全選手（全校 = 最大数百人）× 24評価者のランク計算は重くなりうる。月次バッチで処理し、日次リアルタイム計算は避ける
- **セーブデータサイズ**: `rankings` 配列が大きくなる可能性。定期的に古い記録を削除（最新のみ保持）するガベージコレクションを設ける

---

## 10. 段階実装案

### MVP（Phase 11.5-C, 2〜3日）
1. `Evaluator` 型定義 + 初期データ24人登録
2. `calcEvaluatorRank()` の pure function 実装 + unit test
3. `EvaluatorState` を WorldState に追加
4. 月次バッチ処理でランク更新
5. ホーム「評価者」タブの簡易表示（ランクのみ）

### 拡張（別 PR）
6. 評価コメントの自動生成（評価者の言葉プールと組み合わせ）
7. 選手詳細画面での評価者ランク一覧表示
8. 甲子園出場時の評価者ボーナス
