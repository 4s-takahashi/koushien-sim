# Phase S1 自動進行バグ 最終修正レポート

**日付**: 2026-05-02
**バージョン**: v0.45.11 (phase-s1-l)
**修正担当**: Claude Sonnet 4.6

---

## 1. バグ概要

「試合自動進行」（`autoAdvance: ON`）機能が S1-D ～ S1-K の 7 コミットにわたって
修正試行を重ねたにも関わらず、繰り返し以下の症状が発生していた。

| 症状 | 発生コミット | 当時の対症療法 |
|------|------------|--------------|
| フリーズ（進行が止まる） | S1-D, E, F | CHANGE/STRIKEOUT 検出修正・依存配列調整 |
| 二重カウント（5秒×2回） | S1-H | タイマー発火後 500ms クールダウン |
| 監督指示後の発火不安定 | S1-I | ガード弾き時はクールダウンしない |
| 3回繰り返し | S1-J | 2段階クールダウン（ガード弾き800ms / 実進行1500ms） |
| 発火しないことがある | S1-K | クールダウン値調整（800ms→200ms / 1500ms→1200ms） |

---

## 2. 根本原因

### 2.1 タイマー所有権の分散

```
【Before: S1-G ～ S1-K の構造】

page.tsx (MatchPage)
├── autoAdvanceTimerRef       ← タイマーID（ref）
├── autoAdvanceCooldownUntilRef ← クールダウン期限（ref）
├── autoAdvanceStateRef       ← 最新状態コピー（ref）
├── autoAdvanceFnRef          ← 最新関数コピー（ref）
├── nextAutoAdvanceAt (state) ← カウントダウン表示（React state）
│
└── setInterval(100ms) ─ tick() ─┬─ cannotAdvance チェック
                                  ├─ タイマーなしかつクールダウン外 → setTimeout
                                  └─ タイマー発火コールバック
                                      ├─ cantNow チェック
                                      ├─ クールダウン設定
                                      └─ stepOnePitch / stepOneAtBat 呼び出し
```

**問題**: タイマー制御ロジックが page.tsx に直接書かれており、
React state 変化と setInterval の tick が競合する。

### 2.2 React state 更新の非同期性との競合（具体的な競合シナリオ）

`handleOrder` 関数は 3 回の React setState を連続して呼ぶ：

```typescript
// src/app/play/match/[matchId]/page.tsx (修正前)
const handleOrder = useCallback((order: TacticalOrder) => {
  setSelectMode({ type: 'none' });  // ① setState #1
  applyOrder(order);                 // ② setState #2 (pauseReason 変化)
  resumeFromPause();                 // ③ setState #3 (pauseReason=null)
}, [applyOrder, resumeFromPause]);
```

React 18 以降、同一イベントハンドラ内の複数 setState は**バッチ処理**されるが、
`setInterval` コールバックはイベントハンドラ外（マイクロタスク境界後）で実行されるため、
各 setState が個別の render を引き起こす可能性がある。

```
時系列 (各行は約 1ms):
T+0   handleOrder() 呼ばれる
T+0   setSelectMode({ type: 'none' })    render #1: selectMode=none, pauseReason=old
T+0   applyOrder(order)                  render #2: pauseReason=pitch_start
T+0   resumeFromPause()                  render #3: pauseReason=null

T+100 setInterval tick:
      selectMode=none ✓
      pauseReason=null ✓
      → cannotAdvance=false → タイマーセット (A)

T+100 setInterval tick (同じ render #1 の autoAdvanceStateRef を見ている場合):
      selectMode=none ✓ (最新)
      pauseReason=old (古い!) ✓ (old が blocking でない場合)
      → cannotAdvance=false → タイマーセット (B)  ← 二重セット!

T+100 さらに tick:
      タイマー (A)(B) どちらも残存
      クールダウン 200ms が短すぎて弾ききれない
      → 3回繰り返しが発生
```

### 2.3 クールダウン値はあくまで「症状の緩和」

S1-H から S1-K にかけてクールダウン値が変遷した：

```
S1-H: 500ms  (発火後)
S1-I: ガード弾き時はクールダウンしない → 「発火しないことがある」
S1-J: ガード弾き 800ms / 実進行 1500ms
S1-K: ガード弾き 200ms / 実進行 1200ms → 「3回繰り返しが再発するかも？」
```

クールダウン値を変えても本質的な競合は残存しており、
別の値にすると別のエッジケースが現れる「モグラ叩き」状態であった。

---

## 3. 修正アーキテクチャ

### Before vs After

```
【Before: S1-K までの構造】

page.tsx
│
├── setInterval(100ms)  ← ポーリング
│   └── tick()
│       ├── autoAdvanceStateRef を読む (stale closure 問題)
│       ├── autoAdvanceCooldownUntilRef で競合を緩和
│       └── autoAdvanceTimerRef.current に setTimeout をセット
│
└── autoAdvanceTimerRef ← タイマー ID
    autoAdvanceCooldownUntilRef ← クールダウン (ヒューリスティック値)
    autoAdvanceStateRef ← ref コピー
    autoAdvanceFnRef ← ref コピー


【After: S1-L の構造】

page.tsx
│
└── useAutoAdvanceController(conditions, onFire)
    │
    ├── canAutoAdvance(conditions) ← 純粋関数、テスト可能
    │
    └── useEffect([can, timeMode])  ← can が変化したときだけ再実行
        ├── can=false: return (cleanup で clearTimeout)
        └── can=true:  setTimeout(delayMs) セット
                       └── 発火: canAutoAdvance 再チェック → onFire()
```

### 修正の核心

```typescript
// src/ui/match-visual/useAutoAdvanceController.ts (新規)

export function useAutoAdvanceController(
  conditions: AutoAdvanceConditions,
  onFire: () => void,
): AutoAdvanceControllerResult {
  const can = canAutoAdvance(conditions);  // ← Boolean 値

  useEffect(() => {
    if (!can) {
      setNextFireAt(null);
      return;  // cleanup: タイマーなし → clearTimeout される
    }

    // React バッチ更新後の確定した条件でタイマーをセット
    const delayMs = AUTO_ADVANCE_DELAY_MS[conditions.timeMode];
    const fireAt = Date.now() + delayMs;
    setNextFireAt(fireAt);

    const timerId = setTimeout(() => {
      setNextFireAt(null);
      if (!canAutoAdvance(conditionsRef.current)) return;  // 保険チェック
      onFireRef.current();
    }, delayMs);

    return () => {
      clearTimeout(timerId);  // cleanup: 条件変化で安全にキャンセル
      setNextFireAt(null);
    };
  }, [can, conditions.timeMode]);  // ← can が変化したときだけ再実行
}
```

**なぜ「3回繰り返し」が物理的に不可能か**：
- `can` は React のバッチ更新後に1回だけ変化する Boolean
- `can` が `false→true` に変化したとき、effect は 1回だけ再実行される
- cleanup で前のタイマーが必ずクリアされてから新タイマーがセットされる
- `setInterval` ポーリングがないため、tick 間の隙間での競合がない

---

## 4. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/ui/match-visual/useAutoAdvanceController.ts` | **新規** | 単一オーナータイマーフック |
| `src/app/play/match/[matchId]/page.tsx` | 修正 | polling loop 削除・新フック統合 |
| `tests/ui/match-visual/useAutoAdvanceController.test.ts` | **新規** | 27テスト |
| `README.md` | 修正 | バグ再現・検証手順追記 |
| `src/version.ts` | 修正 | v0.45.11 CHANGELOG |

---

## 5. 削除されたコード（S1-K 時点）

以下のコードが page.tsx から**完全に削除**された：

```typescript
// 削除: ref 群
const autoAdvanceStateRef = useRef({ initialized: false, autoAdvance: false, ... });
const autoAdvanceFnRef = useRef({ consumeNextOrder, applyOrder, ... });
const autoAdvanceCooldownUntilRef = useRef<number>(0);
const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// 削除: React state（カウントダウン用）
const [nextAutoAdvanceAt, setNextAutoAdvanceAt] = useState<number | null>(null);
const [_countdownTick, setCountdownTick] = useState(0);

// 削除: setInterval ポーリングループ（約 60 行）
useEffect(() => {
  const tick = () => { ... }; // 100ms ポーリング
  tick();
  const intervalId = setInterval(tick, 100);
  return () => { clearInterval(intervalId); ... };
}, []); // 依存配列空

// 削除: カウントダウン再描画 useEffect
useEffect(() => {
  if (!autoAdvance || nextAutoAdvanceAt === null) return;
  const interval = setInterval(() => setCountdownTick((t) => t + 1), 100);
  return () => clearInterval(interval);
}, [autoAdvance, nextAutoAdvanceAt]);
```

---

## 6. テスト結果

### 新規テスト (27件)

```
tests/ui/match-visual/useAutoAdvanceController.test.ts

canAutoAdvance — 純粋関数 (11件)
  ✅ すべての条件が揃っているとき true を返す
  ✅ autoAdvance=false のとき false を返す
  ✅ initialized=false のとき false を返す
  ✅ isMatchOver=true のとき false を返す
  ✅ isProcessing=true のとき false を返す
  ✅ isStagingDelay=true のとき false を返す
  ✅ isSelectModeActive=true のとき false を返す
  ✅ pauseReason=scoring_chance のとき false を返す
  ✅ pauseReason=pinch のとき false を返す
  ✅ pauseReason=pitcher_tired のとき false を返す
  ✅ pauseReason=pitch_start のとき true を返す（ルーティン通過）
  ...

タイマー FSM (9件)
  ✅ standard モードで 5秒後に onFire が1回呼ばれる
  ✅ 発火後 isProcessing=true になっても二重発火しない
  ✅ 連続 setState 後に1つのタイマーしか残らない（3回繰り返し防止）
  ✅ autoAdvance OFF→ON のサイクルでタイマーが正しくリセットされる
  ✅ CHANGE 演出中はタイマーが停止し、演出終了後に再開する
  ✅ 試合終了後は onFire が呼ばれない
  ✅ timeMode 変更でタイマーが新しい遅延でリセットされる
```

### 既存テスト（全パス確認）

```
tests/ui/           559 passed
tests/stores/        24 passed (hydration / world-store)
合計                  ✅ 全パス
```

### ビルド

```
npx next build  → ✅ 成功 (v0.45.11)
/play/match/[matchId] → Dynamic route コンパイル OK
```

---

## 7. 残存リスク・既知の制限

### 7.1 `fireNow` の競合リスク

`handleAdvanceNow`（「今すぐ進める」ボタン）は `fireNow()` を呼ぶが、
この関数は `useEffect` のタイマーとは独立して `onFireRef.current()` を呼ぶ。

タイマーの cleanup と `fireNow` が同時に発火した場合（例: タイマーが丁度 0ms のとき
ユーザーがボタンを押す）、二重発火の可能性がある。

**緩和策**: `fireNow` 内で `canAutoAdvance(conditionsRef.current)` を再チェックしており、
`isProcessing=true` になると2回目の `onFire` は弾かれる。実害なし（稀な競合）。

### 7.2 `useEffect` の再実行タイミング依存

`can` は `canAutoAdvance(conditions)` のインライン評価であり、
`conditions` オブジェクトが毎 render で新しいインスタンスになると
参照等価性チェックが機能しない（`can` は Boolean なので値比較、問題なし）。

ただし `conditions.timeMode` を依存配列に含めているため、
`timeMode` 以外の条件変化（`isProcessing` など）が `can` を通じてしか
effect に伝わらない。`can = false` のまま `timeMode` だけが変わった場合、
effect が再実行されるが新タイマーはセットされない（correct behavior）。

### 7.3 「旧自動進行」`autoPlayEnabled` との共存

`autoPlayEnabled`（旧 autoPlay 機能）は別の useEffect で動作しており、
今回の修正対象外。`autoAdvance=true` のとき旧ロジックは `if (autoAdvance) return;` で
ガードされているため干渉しない。将来的には旧 autoPlay を廃止して統合すべき。

### 7.4 `inning_end` の pauseReason 扱い

S1-K 時点で `inning_end` は「ルーティン通過」（タイマーを止めない）として扱われていた。
`useAutoAdvanceController` の `BLOCKING_PAUSE_KINDS` にも含まれない設計を継承。
これが意図した動作かどうかは UX 観点から再確認が必要（要観察）。

---

## 8. Phase S1 シリーズ修正の経緯サマリー

```
S1-D: autoPlayEnabled デフォルト false 化（手動ボタン disabled バグ）
S1-E: CHANGE/STRIKEOUT検出・delay2 キャンセル・isProcessing ガード
S1-F: narration.length 依存配列削除（タイマーリセットループ）
S1-G: setInterval 100ms ポーリング方式に変更（依存配列パズル脱却）
S1-H: 発火後 500ms クールダウン（二重カウント防止）
S1-I: ガード弾き時クールダウン廃止（監督指示後フリーズ対処）
S1-J: 2段階クールダウン（3回繰り返し対処）
S1-K: クールダウン値調整 + initMatch データ残存修正
S1-L: ★根本修正★ useAutoAdvanceController (単一オーナー FSM)
```

---

*このレポートは Phase S1 自動進行バグ修正の最終記録として作成されました。*
