# Pitch Pixel Jitter — 投球マーカーピクセル散布バグ修正

## 概要

投球マーカーがストライクゾーン SVG 上で 25 種類の固定点にしか描画されなかったバグを修正する。

## 作業計画

1. 診断・原因特定
2. エンジン側修正（連続座標の保持）
3. UI 側修正（UV 座標の補間計算）
4. テスト追加
5. 全テスト通過確認
6. コミット・プッシュ

## 経過ログ

- 2026-05-07 00:00 UTC: diagnosis complete — 根本原因を特定。2段階量子化（applyControlError の Math.round + pitchLocationToUV の固定ルックアップ）により 25 固定点のみ生成。影響ファイル: src/engine/match/pitch/control-error.ts, src/engine/match/types.ts, src/ui/match-visual/pitch-marker-types.ts, src/stores/match-store.ts, src/ui/match-visual/useBallAnimation.ts, src/app/play/match/[matchId]/page.tsx, src/ui/projectors/view-state-types.ts。診断レポートを PHASE-PITCH-LOCATION-DIAGNOSIS.md に記録。
- 2026-05-07 00:30 UTC: fix complete — PitchLocation に rowExact/colExact フィールドを追加。applyControlError で丸め前の連続座標を保持。pitchLocationToUV を線形補間式に更新（後方互換あり）。match-store.ts, useBallAnimation.ts, page.tsx の描画パスも更新。ゲームロジック（isInStrikeZone, batting statistics）は無変更。
- 2026-05-07 01:00 UTC: test added — tests/ui/match-visual/pitch-pixel-scatter.test.ts を新規作成。5テスト: (1) control=70 で 100球投球 → ≥50 ユニーク位置, (2) 後方互換（rowExact なし） → 25 固定点, (3) control=100 → 1点のみ, (4) ボールゾーンでも散布あり, (5) 補間方向の正確性確認。全5テスト PASS。
- 2026-05-07 01:30 UTC: commit complete — 全テスト（418件）PASS 確認後、変更を main ブランチにコミット・プッシュ。
