# Phase 12-M 追加バグ指示 (UTC 10:25)

## Bug #5: 3回の表からアニメーション完全停止

**症状** (高橋さん本番報告):
- 3回表から、グラウンド上のボール/走者アニメーション + ストライクゾーン内の投球アニメーション両方が止まる
- 試合ロジックは進行、結果は反映される（ロジック側は正常）
- 視覚的にすべての動きが止まる

**推定原因**:
Phase 12-L の Bug #2 修正（`useBallAnimation.ts` の RAF 競合防止）が過剰に cleanup しており、特定条件で RAF を再起動できなくなっている可能性が高い。

### 重点調査ポイント

1. `useBallAnimation.ts` の mountedRef + RAF cleanup ロジック
   - mountedRef が意図せず `false` に固定される経路
   - RAF cancel 後の `rafRef.current` が null に戻らず、`!rafRef.current` 条件で新規起動がブロック
   - useEffect の dependency 変化で cleanup が走りすぎ

2. イニング切替時の unmount → remount 挙動（React Strict Mode 含む）
3. match-store hydration との相互作用（Phase 12-L Bug #4 の 3秒タイムアウト）

### 修正方針
- RAF 管理を単一 controller に統合、start/stop を明示管理
- Phase 12-L Bug #2 修正を部分的に revert する可能性も検討
- 新規テスト：3回表以降でアニメーション起動を検証

### 優先度
- **最優先**（ユーザーが試合プレイ不能）
- Phase 12-M に追加（v0.32.0 or v0.32.1 で対応）
- 既存 Bug #1-4 と並行で可

元の Phase 12-M task prompt は spawn 時の引数を参照。
