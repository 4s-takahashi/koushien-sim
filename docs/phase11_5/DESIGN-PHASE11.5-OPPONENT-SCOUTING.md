# Phase 11.5-F — マネージャー経由の対戦相手評価

**作成日:** 2026-04-21
**新規ファイル:**
- `src/engine/scouting/manager-scouting.ts`
- `src/ui/labels/scouting-narrative.ts`
**変更ファイル:**
- `src/ui/projectors/opponentProjector.ts`（新規または既存拡張）
- `src/app/play/player/[playerId]/page.tsx`

---

## 1. 目的

対戦相手選手の情報を「数値で開示する」のではなく、**マネージャーの能力を通じた言語評価**として表示する。

- マネージャーのランク・レベルが低い → 評価項目が少なく、誤差もある
- マネージャーのランク・レベルが高い → 評価項目が多く、精度も高い
- プレイヤーは「完璧な情報」を持てない → 戦略的判断の面白さが生まれる

---

## 2. マネージャーモデル（現状の型との整合）

現状、マネージャーは `HighSchool.manager` に定義されており、名前・勝敗・甲子園回数が入っている（監督のデータ）。
マネージャー（女子マネ等、情報収集担当）は別エンティティとして追加する。

```ts
// src/engine/types/manager-staff.ts（新規）

export type ManagerRank = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export interface ManagerStaff {
  id: string;
  firstName: string;
  lastName: string;
  rank: ManagerRank;
  /** 経験値（0〜100で次のランクへ昇格） */
  experience: number;
  /** 特性 */
  specialty: ManagerSpecialty;
}

export type ManagerSpecialty =
  | 'scouting'      // 偵察向き: 評価精度+、項目数+
  | 'mental_care'   // メンタルケア向き: 選手のモチベーション回復ボーナス
  | 'data_analysis' // データ分析向き: 数値的な評価項目が多い
  | 'general';      // 万能型
```

### ランク × 評価能力テーブル

| ランク | 評価項目数（上限） | 誤差率 | 説明 |
|---|---|---|---|
| F | 1 | 40% | ほぼ当てにならない |
| E | 1〜2 | 30% | 運次第 |
| D | 2〜3 | 20% | おぼろげに分かる |
| C | 3〜4 | 15% | 標準的な分析 |
| B | 4〜5 | 10% | 信頼できる評価 |
| A | 5〜6 | 5%  | 高精度な偵察 |
| S | 6〜7 | 2%  | プロ並みの観察眼 |

---

## 3. スカウティング評価の言葉プール

### 3.1 投手評価（打者目線）

```ts
// src/ui/labels/scouting-narrative.ts

// ==================== 投手の弱点・強みの言葉 ====================

export const PITCHER_SCOUTING_LABELS = {

  // 球速評価
  velocity: {
    low:    ['打ちやすい球速帯', '球速は脅威にならない', 'スピードで圧倒するタイプではない'],
    medium: ['それなりの球速', '球速は平均的', '特別速くはないが侮れない'],
    high:   ['速球が脅威', '球速でねじ伏せてくるタイプ', '速球には要警戒'],
  },

  // 制球の評価
  control: {
    low:    ['制球に不安がある', 'ボール球が多い傾向', '四球が多くカウントを稼ぎやすい'],
    medium: ['制球は標準的', '大きく崩れることはない制球'],
    high:   ['制球が精密', 'コーナーを正確に突いてくる', '甘い球はほとんど来ない'],
  },

  // スタミナ
  pitchStamina: {
    low:    ['連投に弱そう', '後半に球威が落ちる傾向', '試合終盤に崩れやすい'],
    medium: ['スタミナは標準的'],
    high:   ['スタミナ十分', '終盤でも球威が落ちない', '連投にも対応できそう'],
  },

  // 変化球評価
  breakingBall: {
    none:   ['変化球はほぼない', '直球主体のシンプルな投手'],
    weak:   ['変化球はあるが甘い', '変化球の精度はまだ低い'],
    strong: ['切れのある変化球を持つ', '変化球の種類と精度が高い', '変化球に要注意'],
  },

  // コース傾向
  tendencies: {
    inside_heavy: ['インコース攻めを好む', '内角に厳しい球を多く投げてくる'],
    outside_heavy: ['アウトコース中心の投球', '外角ばかりに集める傾向'],
    low_ball: ['低めへの制球が良い', '低めに投げ込んでくる'],
    high_fast: ['高めの速球を多用する', '高めのストレートが武器'],
  },

  // 弱点
  weaknesses: {
    left_batter: ['左打者に弱い面がある', '左打ちには打たれやすい傾向'],
    right_batter: ['右打者に苦手意識あり'],
    runners_on: ['走者がいると安定感を欠く', 'ランナーに動揺しやすい'],
    high_pitch_count: ['球数が増えると崩れやすい', '長いイニングに課題'],
    two_strike: ['2ストライクから仕留め切れない傾向'],
  },
};

// ==================== 打者の弱点・強みの言葉 ====================

export const BATTER_SCOUTING_LABELS = {

  contact: {
    low:    ['コンタクトに課題がある', 'バットに当たらない場面が多い', '三振が多いタイプ'],
    medium: ['バットコントロールは標準的'],
    high:   ['コンタクト率が高い', 'バットに当てる技術は確か', '滅多に三振しない'],
  },

  power: {
    low:    ['長打力はあまりない', '非力さが目立つ', '力負けしそう'],
    medium: ['パワーは標準的', '長打も狙えるが専門ではない'],
    high:   ['長打が怖い', '一発がある打者', 'スタンドまで飛ばす長打力'],
  },

  weaknesses: {
    inside_low:  ['内角低めが不得意そう', '内角低めに弱い傾向'],
    outside_low: ['外角低めを攻めると苦労しそう'],
    outside:     ['アウトコースに弱い面がある', '外の球に手が出る'],
    breaking:    ['変化球への対応に課題', '変化球を苦手としている'],
    two_strike:  ['追い込まれると崩れる傾向', '2ストライクから力む癖がある'],
    high_fast:   ['高めの速球が苦手そう'],
  },

  strengths: {
    inside:      ['内角を得意とする', 'インコースを引っ張る力がある'],
    outside:     ['外角の球に強い', 'アウトコースへの対応が巧み'],
    fastball:    ['速球に強い', '速い球を得意とする打者'],
    patience:    ['選球眼が良い', 'ボール球に手を出さない'],
    clutch:      ['チャンスに強そう', '勝負強さを感じる'],
  },
};
```

---

## 4. 誤差モデル

```ts
// src/engine/scouting/manager-scouting.ts

export interface ScoutingReport {
  playerId: string;
  /** 表示する評価項目リスト */
  evaluations: ScoutingEvaluation[];
  /** マネージャーのランク（情報の信頼性表示用） */
  managerRank: ManagerRank;
}

export interface ScoutingEvaluation {
  /** 評価カテゴリ */
  category: string;
  /** 表示テキスト */
  text: string;
  /** これは正確な評価か（UI上は表示しない、デバッグ用） */
  isAccurate: boolean;
}

/**
 * マネージャーのランクに基づいて対戦相手選手のスカウティングレポートを生成する。
 *
 * @param player        対戦相手選手
 * @param managerRank   自校マネージャーのランク
 * @param seed          乱数シード（試合ごとに固定）
 */
export function generateScoutingReport(
  player: Player,
  managerRank: ManagerRank,
  seed: string,
): ScoutingReport {
  const config = MANAGER_RANK_CONFIG[managerRank];
  const hash = simpleHash(seed + player.id);

  // 生成可能な全評価項目を収集
  const allEvaluations = collectAllEvaluations(player);

  // ランクに応じて項目数を決定（ランダム範囲内）
  const itemCount = config.minItems + (hash % (config.maxItems - config.minItems + 1));

  // 重要度順に上位 itemCount 件を選択
  const selected = allEvaluations
    .sort((a, b) => b.importance - a.importance)
    .slice(0, itemCount);

  // 誤差を適用
  const evaluations = selected.map((ev, i) => {
    const errorSeed = simpleHash(seed + player.id + i.toString());
    const hasError = (errorSeed % 100) < config.errorRate;

    if (hasError && ev.invertedText) {
      return {
        category: ev.category,
        text: ev.invertedText,  // 逆の評価を使う（誤判定）
        isAccurate: false,
      };
    }
    return {
      category: ev.category,
      text: ev.text,
      isAccurate: true,
    };
  });

  return { playerId: player.id, evaluations, managerRank };
}

const MANAGER_RANK_CONFIG: Record<ManagerRank, {
  minItems: number;
  maxItems: number;
  errorRate: number; // 0〜100 (%)
}> = {
  F: { minItems: 1, maxItems: 1, errorRate: 40 },
  E: { minItems: 1, maxItems: 2, errorRate: 30 },
  D: { minItems: 2, maxItems: 3, errorRate: 20 },
  C: { minItems: 3, maxItems: 4, errorRate: 15 },
  B: { minItems: 4, maxItems: 5, errorRate: 10 },
  A: { minItems: 5, maxItems: 6, errorRate: 5  },
  S: { minItems: 6, maxItems: 7, errorRate: 2  },
};
```

### 評価項目の収集ロジック

```ts
interface RawEvaluation {
  category: string;
  text: string;
  invertedText?: string;  // 誤差が入った場合の逆評価テキスト
  importance: number;     // 1〜10（高いほど優先表示）
}

function collectAllEvaluations(player: Player): RawEvaluation[] {
  const evals: RawEvaluation[] = [];
  const isPitcher = player.position === 'pitcher';

  if (isPitcher) {
    const p = player.stats.pitching!;

    // 球速
    if (p.velocity >= 75) {
      evals.push({
        category: '球速',
        text: pickRandom(PITCHER_SCOUTING_LABELS.velocity.high),
        invertedText: pickRandom(PITCHER_SCOUTING_LABELS.velocity.low),
        importance: 9,
      });
    } else if (p.velocity < 55) {
      evals.push({
        category: '球速',
        text: pickRandom(PITCHER_SCOUTING_LABELS.velocity.low),
        invertedText: pickRandom(PITCHER_SCOUTING_LABELS.velocity.high),
        importance: 8,
      });
    }

    // 制球
    if (p.control >= 70) {
      evals.push({
        category: '制球',
        text: pickRandom(PITCHER_SCOUTING_LABELS.control.high),
        invertedText: pickRandom(PITCHER_SCOUTING_LABELS.control.low),
        importance: 8,
      });
    } else if (p.control < 45) {
      evals.push({
        category: '制球',
        text: pickRandom(PITCHER_SCOUTING_LABELS.control.low),
        invertedText: pickRandom(PITCHER_SCOUTING_LABELS.control.high),
        importance: 7,
      });
    }

    // スタミナ
    if (p.pitchStamina < 45) {
      evals.push({
        category: 'スタミナ',
        text: pickRandom(PITCHER_SCOUTING_LABELS.pitchStamina.low),
        invertedText: pickRandom(PITCHER_SCOUTING_LABELS.pitchStamina.high),
        importance: 6,
      });
    }

    // 変化球
    const maxBreak = Math.max(...Object.values(p.pitches ?? {}), 0);
    if (maxBreak >= 65) {
      evals.push({
        category: '変化球',
        text: pickRandom(PITCHER_SCOUTING_LABELS.breakingBall.strong),
        invertedText: pickRandom(PITCHER_SCOUTING_LABELS.breakingBall.weak),
        importance: 7,
      });
    }
    // ... 以下同様のパターンで打者評価も追加

  } else {
    // 打者評価
    const b = player.stats.batting;

    if (b.power >= 70) {
      evals.push({
        category: '長打力',
        text: pickRandom(BATTER_SCOUTING_LABELS.power.high),
        invertedText: pickRandom(BATTER_SCOUTING_LABELS.power.low),
        importance: 9,
      });
    }
    // ... 以下同様
  }

  return evals;
}
```

---

## 5. UIへの反映

### 5.1 他校選手プロフィール画面（`/play/player/[playerId]`）変更後

```
現状:
  [スカウト評価] ランク B、スタイル「速球派」
  [スカウトレポート]（テキスト1件）

変更後:
  [スカウト評価] ランク B（マネージャー評価）
  [マネージャー偵察レポート]
    マネージャーランク: C（信頼性: 標準）
    ┌──────────────────────────────────┐
    │ 球速: 速球が脅威               ✓ │
    │ 制球: 制球に不安がある         ✓ │
    │ 変化球: 切れのある変化球を持つ ✓ │
    │                               ← C ランクなら 3〜4 項目 │
    └──────────────────────────────────┘
    ※ マネージャーのランクが上がると情報が増えます

  [スカウトレポート]（既存テキスト、維持）
```

### 5.2 信頼性インジケーター

マネージャーランクを視覚的に表示し、情報の精度をプレイヤーが把握できるようにする。

```
マネージャー評価（信頼性: ★★★☆☆）
                    C ランク相当 = 15% の誤差率
```

---

## 6. WorldState への追加

```ts
// src/engine/world/world-state.ts

interface WorldState {
  // 既存...

  /** 自校マネージャースタッフ（Phase 11.5-F/G） */
  managerStaff?: ManagerStaff;  // optional で後方互換
}
```

デフォルト値: ランク C、スペシャリティ general のマネージャーを初期配置する。

---

## 7. 既存コードへの影響

| ファイル | 変更内容 |
|---|---|
| `src/engine/types/manager-staff.ts` | 新規作成 |
| `src/engine/scouting/manager-scouting.ts` | 新規作成 |
| `src/ui/labels/scouting-narrative.ts` | 新規作成（言葉プール） |
| `src/engine/world/world-state.ts` | `managerStaff?` フィールド追加 |
| `src/engine/world/hydrate.ts` | `managerStaff` のデフォルト初期化 |
| `src/app/play/player/[playerId]/page.tsx` | スカウティングレポートの表示を言葉化対応に変更 |
| `src/ui/projectors/opponentProjector.ts` | `ScoutingReport` を ViewState に変換する projector |

---

## 8. リスク・トレードオフ

- **誤差モデルのバランス調整**: 誤差率が高すぎると「使えない情報」になる。Fランクでも「何かは合ってる」程度のバランスが重要
- **プレイヤーへの情報開示**: 「この情報は誤りかもしれない」という表示をするか否か。案A: 一切表示しない（騙される体験が楽しい）、案B: マネージャーランクだけ表示（誤差率は非公開）→ **案Bを推奨**
- **既存スカウトレポートとの共存**: 現状のスカウト機能（視察回数制限あり）との差別化が必要。マネージャー評価は自動生成、スカウトは手動視察で詳細評価という棲み分けにする

---

## 9. 段階実装案

### MVP（Phase 11.5-F, 2日）
1. `ManagerStaff` 型定義 + デフォルトデータ（ランクC、汎用型）
2. `generateScoutingReport()` pure function + unit test
3. 他校選手画面での「マネージャー偵察レポート」表示
4. マネージャーランク表示インジケーター

### 拡張（Phase 11.5-G と連携）
5. マネージャー育成（経験値・ランクアップ）と連動
6. スペシャリティによる評価特化
7. 試合前の「対戦相手偵察サマリー」表示（試合画面への誘導）
