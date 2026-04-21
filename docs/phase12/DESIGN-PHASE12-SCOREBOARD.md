# Phase 12-A: スコア票の表示タイミング制御・アニメーション仕様

**担当フェーズ:** Phase 12-A（基盤整備の一部）
**実装目標:** 3〜5日

---

## 1. 目的

### なぜこの変更か

現状はスコア票（`Scoreboard` + `InningScoreTable`）が**常時画面上部に固定**されており、
試合の緊張感・節目感が薄い。

変更後:
- **表/裏の始まりのみ** スライドインで表示
- 約2秒間表示後にスライドアウト
- チェンジ（表→裏、裏→次イニング表）のタイミングで再表示
- 表示中以外は **左上HUD（コンパクト表示）** でスコアとカウントを確認できる

### 期待するUX

```
[1回表 始まり]
  → スコア票がスライドイン（上から下へ）
  → 2秒間表示（チーム名・スコア・イニング・回別得点表）
  → スライドアウト（上方向へ退場）
  → グラウンド鳥瞰エリアが全面展開

[投球中〜打席中]
  → 左上HUD（B:2 S:1 O:1 / 7回表 / 佐渡北 1点）のみ常時表示

[1回裏 始まり = チェンジ後]
  → 再びスコア票スライドイン
```

---

## 2. ワイヤーフレーム

### 現状（常時表示）

```
┌──────────────────────────────────────────┐
│ 桜葉  3 - 1  佐渡北商業   7回表 1アウト  │  ← 常時固定
│ B:2  S:1                                  │
│ 1|2|3|4|5|6|7|8|9|R                       │  ← 常時固定
│ 0|1|0|0|0|1|1| | |3|  桜葉               │
│ 0|0|0|0|1|0| | | |1|  佐渡北商業        │
└──────────────────────────────────────────┘
[グラウンド/ストライクゾーン]
```

### 変更後（表示中）

```
┌──────────────────────────────────────────┐ ← スライドイン中
│                                          │
│  ⚾  7回表  ──  チェンジ               │
│  桜葉高校     3 - 1     佐渡北商業      │
│  1|2|3|4|5|6|7|8|9|R                    │
│  0|1|0|0|0|1|1| | |3|  桜葉            │
│  0|0|0|0|1|0| | | |1|  佐渡北商業      │
│                                          │
└──────────────────────────────────────────┘
[グラウンド/ストライクゾーン (背景で見える)]
```

### 変更後（非表示中 = 通常投球中）

```
┌──────────────────────────────────────────┐
│ [グラウンド鳥瞰 Canvas]                  │
│                                          │
│ ┌─────────────────────┐                 │
│ │  HUD                │                 │
│ │  B:2 S:1 O:1        │                 │
│ │  7回表              │                 │
│ │  桜葉 3 - 1 佐渡北  │                 │
│ └─────────────────────┘                 │
└──────────────────────────────────────────┘
[ストライクゾーン SVG]
```

---

## 3. 型定義

### `useScoreboardVisibility` フック

```typescript
// src/ui/match-visual/useScoreboardVisibility.ts

export type ScoreboardPhase =
  | 'hidden'       // 非表示（通常投球中）
  | 'sliding_in'   // スライドイン中 (duration: 0.4s)
  | 'visible'      // 表示中（約2秒）
  | 'sliding_out'; // スライドアウト中 (duration: 0.3s)

export interface ScoreboardVisibilityState {
  phase: ScoreboardPhase;
  /** 今回のイニング表示のラベル（例: "7回表 チェンジ"） */
  inningLabel: string;
}

export function useScoreboardVisibility(
  currentInning: number,
  currentHalf: 'top' | 'bottom',
): ScoreboardVisibilityState;
```

### トリガーロジック

```typescript
// 表示トリガー条件
type ScoreboardTrigger =
  | 'half_inning_start'  // 表/裏の最初のイベント（at_bat_start）が来た時
  | 'change_detected';   // チェンジ直後（inning_end イベント後）

// 検知方法:
// - match-store の pitchLog を watch
// - 直前の pitchLog[-2] と pitchLog[-1] でイニング/halfが変わった → トリガー
// - または MatchViewState.inningLabel が変化した時
```

---

## 4. アニメーション仕様

| フェーズ | duration | easing | transform |
|---|---|---|---|
| sliding_in | 400ms | cubic-bezier(0.25, 0.46, 0.45, 0.94) | translateY(-100%) → translateY(0) |
| visible | 2000ms | — | translateY(0) |
| sliding_out | 300ms | cubic-bezier(0.55, 0.055, 0.675, 0.19) | translateY(0) → translateY(-100%) |

### CSS実装（候補）

```css
/* match-visual.module.css */
.scoreboardOverlay {
  position: fixed;  /* または absolute、親の position に応じて */
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: rgba(13, 33, 55, 0.97);
  border-bottom: 2px solid #1a3a5c;
  padding: 12px 16px 16px;
  will-change: transform;
  /* prefers-reduced-motion 対応 */
}

@media (prefers-reduced-motion: reduce) {
  .scoreboardOverlay {
    transition: none !important;
    animation: none !important;
  }
}

.scoreboardSlidingIn {
  animation: scoreboardSlideIn 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

.scoreboardSlidingOut {
  animation: scoreboardSlideOut 300ms cubic-bezier(0.55, 0.055, 0.675, 0.19) forwards;
}

@keyframes scoreboardSlideIn {
  from { transform: translateY(-100%); opacity: 0.8; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes scoreboardSlideOut {
  from { transform: translateY(0);    opacity: 1; }
  to   { transform: translateY(-100%); opacity: 0; }
}
```

### framer-motion 版（代替案）

```typescript
// framer-motion が導入済みの場合
<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ y: '-100%', opacity: 0.8 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '-100%', opacity: 0 }}
      transition={{
        enter: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
        exit:  { duration: 0.3, ease: [0.55, 0.055, 0.675, 0.19] },
      }}
    >
      <ScoreboardContent view={view} />
    </motion.div>
  )}
</AnimatePresence>
```

**判断:** CSS Animation で十分（framer-motion は未導入なら依存追加不要）。
Phase 12-A では CSS Animation を採用し、Phase 12-E のブラッシュアップ時に framer-motion 移行を検討。

---

## 5. 表示タイミング制御の詳細ロジック

```
イニング変化の検出:
  前提: matchProjector の出力 MatchViewState.inningLabel を監視

  A. ページ初回ロード
     → `currentInning === 1 && currentHalf === 'top'` かつ `pitchLog.length === 0`
     → 1秒待機後にスライドイン（試合開始の演出）

  B. inningLabel が変化したとき
     → useEffect で prevInningLabel と比較
     → 変化 → 500ms 後にスライドイン（アウトカウントリセット等の更新が落ち着いてから）

  C. manual で非表示にできる
     → スコア票クリック → 即スライドアウト（タップで消せる）
     → アクセシビリティ: スクリーンリーダー用のスコア読み上げ aria-live="polite" は常時

  D. 試合終了（ResultModal 表示時）
     → スライドアウト → ResultModal が全画面に出る
```

### `useScoreboardVisibility` 擬似コード

```typescript
export function useScoreboardVisibility(
  inningLabel: string,
  autoHideMs = 2000,
): {
  phase: ScoreboardPhase;
  triggerShow: () => void;
  triggerHide: () => void;
} {
  const [phase, setPhase] = useState<ScoreboardPhase>('hidden');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevInningLabel = useRef(inningLabel);

  // inningLabel 変化を検知
  useEffect(() => {
    if (prevInningLabel.current !== inningLabel) {
      prevInningLabel.current = inningLabel;
      // 前のタイマーをキャンセル
      if (timerRef.current) clearTimeout(timerRef.current);
      // 500ms 後にスライドイン
      timerRef.current = setTimeout(() => {
        setPhase('sliding_in');
        // スライドイン完了後に visible へ
        setTimeout(() => setPhase('visible'), 400);
        // visible 後に自動スライドアウト
        setTimeout(() => {
          setPhase('sliding_out');
          setTimeout(() => setPhase('hidden'), 300);
        }, 400 + autoHideMs);
      }, 500);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inningLabel, autoHideMs]);

  const triggerShow = useCallback(() => {
    setPhase('sliding_in');
    setTimeout(() => setPhase('visible'), 400);
    timerRef.current = setTimeout(() => {
      setPhase('sliding_out');
      setTimeout(() => setPhase('hidden'), 300);
    }, 400 + autoHideMs);
  }, [autoHideMs]);

  const triggerHide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase('sliding_out');
    setTimeout(() => setPhase('hidden'), 300);
  }, []);

  return { phase, triggerShow, triggerHide };
}
```

---

## 6. 既存コードへの影響

| ファイル | 変更内容 | 影響度 |
|---|---|---|
| `page.tsx` | `<Scoreboard>` と `<InningScoreTable>` を新しい `<AnimatedScoreboard>` コンポーネントで置き換え | 中 |
| `match.module.css` | `.scoreboard` / `.inningScores` のスタイルはそのまま流用。オーバーレイ用クラスを追加 | 小 |
| 新規: `Scoreboard.tsx` | `AnimatedScoreboard` コンポーネント（既存 Scoreboard + InningScoreTable を内包） | 新規 |
| 新規: `useScoreboardVisibility.ts` | 表示タイミング制御フック | 新規 |
| 新規: `MatchHUD.tsx` | 常時表示の左上HUD（グラウンドCanvas上にオーバーレイ） | 新規 |

**注意:** `Scoreboard` コンポーネントは `page.tsx` 内でインライン定義されている。
Phase 12-A では `src/ui/match-visual/Scoreboard.tsx` として分離する。

---

## 7. パフォーマンス目標

- スライドイン/アウトは CSS transform のみ使用（レイアウト再計算なし）
- `will-change: transform` で GPU アシスト
- `prefers-reduced-motion` 時は即時表示/非表示（アニメーションなし）
- スコア票非表示中のコンポーネントは `display: none` または `aria-hidden` で DOM 保持（再マウントコストなし）

---

## 8. テスト戦略

### 単体テスト
```typescript
// src/ui/match-visual/__tests__/useScoreboardVisibility.test.ts
import { renderHook, act } from '@testing-library/react';
import { useScoreboardVisibility } from '../useScoreboardVisibility';

test('inningLabel 変化時に sliding_in → visible → sliding_out → hidden の順で遷移する', async () => {
  const { result, rerender } = renderHook(
    ({ label }) => useScoreboardVisibility(label, 100), // autoHideMs=100ms でテスト高速化
    { initialProps: { label: '1回表' } },
  );
  expect(result.current.phase).toBe('hidden');
  // label 変化
  rerender({ label: '1回裏' });
  // 500ms 後に sliding_in へ
  await act(() => new Promise(r => setTimeout(r, 600)));
  expect(result.current.phase).toBe('sliding_in');
  // ...
});
```

### Visual Regression Test（オプション）
- Phase 12-E で Playwright + screenshot 比較を検討
- スライドアウト完了後のスナップショットが「スコア票なし」状態であることを検証

---

## 9. リスク・トレードオフ

| リスク | 内容 | 対応 |
|---|---|---|
| タイミング制御のバグ | inningLabel が一時的に2回変化するケース（延長等） | useEffect の依存配列とタイマークリーンアップで対処 |
| スコア票が消えていてスコアが分からない | ユーザーが混乱する | 左上HUDに最低限のスコア表示（フォールバック）。スコア票クリックで再表示 |
| アニメーション中に采配ボタンが押せない | スコア票がオーバーレイするとクリック不可 | `pointer-events: none` + `z-index` 調整。スコア票エリア外は常時クリック可能に |
| 自動進行(autoPlay)との競合 | 自動進行が高速な場合、スコア票が連続スライドして見づらい | 前回のスライドアウト完了を待ってから次のスライドイン |
