'use client';

/**
 * PlayLayout — /play 配下の共通レイアウト
 *
 * 全画面で固定高のヘッダーを表示し、画面遷移時に高さが変動しないようにする。
 * (2026-04-19 Issue #2 対応)
 *
 * NOTE: 試合画面 (/play/match/[matchId]) はフルスクリーン体験のため、
 * GlobalHeader の表示は layout 側でコントロールせず、
 * 各画面で必要に応じて出すようにしている。将来的に試合画面も共通化する場合は
 * ここに useSearchParams / usePathname を追加する。
 */

import GlobalHeader from '@/components/GlobalHeader';

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <GlobalHeader />
      <main style={{ flex: 1, minHeight: 0 }}>{children}</main>
    </div>
  );
}
