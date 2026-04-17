'use client';

/**
 * /register — 新規登録画面
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setError(data.error ?? '登録に失敗しました');
        return;
      }

      // 登録成功 → タイトル画面
      router.push('/');
      router.refresh();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [email, password, passwordConfirm, displayName, router]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⚾</span>
          <div className={styles.logoTitle}>アカウント登録</div>
          <div className={styles.logoSubtitle}>高校野球デイズを始めよう</div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleRegister}>
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
            <label className={styles.label} htmlFor="password">パスワード（8文字以上）</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8文字以上のパスワード"
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="passwordConfirm">パスワード確認</label>
            <input
              id="passwordConfirm"
              className={styles.input}
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="もう一度入力"
              required
              autoComplete="new-password"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="displayName">表示名（任意）</label>
            <input
              id="displayName"
              className={styles.input}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: 野球太郎"
              autoComplete="nickname"
            />
          </div>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? '処理中...' : '登録してゲーム開始'}
          </button>
        </form>

        <div className={styles.linkRow}>
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className={styles.link}>ログイン画面へ</Link>
        </div>
      </div>
    </div>
  );
}
