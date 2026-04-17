'use client';

/**
 * /login — ログイン画面
 */

import { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPath = searchParams.get('from') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setError(data.error ?? 'ログインに失敗しました');
        return;
      }

      router.push(fromPath);
      router.refresh();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [email, password, router, fromPath]);

  const handleGuest = useCallback(async () => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setError(data.error ?? 'ゲストログインに失敗しました');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⚾</span>
          <div className={styles.logoTitle}>高校野球デイズ</div>
          <div className={styles.logoSubtitle}>夢の甲子園を目指せ！</div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">メールアドレス</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">パスワード</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード"
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? '処理中...' : 'ログイン'}
          </button>
        </form>

        <div className={styles.linkRow}>
          アカウントをお持ちでない方は{' '}
          <Link href="/register" className={styles.link}>新規登録</Link>
        </div>

        <div className={styles.divider}>または</div>

        <button className={styles.btnGhost} onClick={handleGuest} disabled={loading}>
          ゲストで遊ぶ
        </button>
        <p className={styles.guestNote}>※ ゲストではクラウドセーブが使えません</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>読み込み中...</div>}>
      <LoginContent />
    </Suspense>
  );
}
