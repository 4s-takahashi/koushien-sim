'use client';

/**
 * /new-game — 学校選択画面
 *
 * ステップ1: 都道府県選択
 * ステップ2: 学校名・監督名入力 → ゲームスタート
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWorldStore } from '../../stores/world-store';
import styles from './page.module.css';

// ============================================================
// 都道府県リスト
// ============================================================

const PREFECTURES = [
  // 北海道・東北
  '北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島',
  // 関東
  '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川',
  // 中部
  '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知',
  // 近畿
  '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山',
  // 中国
  '鳥取', '島根', '岡山', '広島', '山口',
  // 四国
  '徳島', '香川', '愛媛', '高知',
  // 九州・沖縄
  '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄',
];

// ランダムな学校名候補
const SCHOOL_PREFIXES = ['桜', '松', '梅', '竹', '葵', '錦', '龍', '鷹', '星', '光', '緑', '晴'];
const SCHOOL_SUFFIXES = ['高校', '学院', '商業高校', '工業高校', '総合高校'];

const MANAGER_FIRST_NAMES = ['太郎', '一郎', '健太', '雄太', '大輔', '翔', '隆', '豊', '誠', '剛'];
const MANAGER_LAST_NAMES = ['田中', '鈴木', '佐藤', '山田', '伊藤', '渡辺', '中村', '小林', '加藤', '吉田'];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomSchoolName(pref: string): string {
  return pref + randomChoice(SCHOOL_PREFIXES) + randomChoice(SCHOOL_SUFFIXES);
}

function generateRandomManagerName(): string {
  return randomChoice(MANAGER_LAST_NAMES) + ' ' + randomChoice(MANAGER_FIRST_NAMES);
}

// ============================================================
// ステップ1: 都道府県選択
// ============================================================

interface Step1Props {
  selected: string;
  onSelect: (pref: string) => void;
}

function Step1({ selected, onSelect }: Step1Props) {
  return (
    <div className={styles.prefGrid}>
      {PREFECTURES.map((pref) => (
        <button
          key={pref}
          className={`${styles.prefBtn} ${selected === pref ? styles.prefBtnSelected : ''}`}
          onClick={() => onSelect(pref)}
        >
          {pref}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// ステップ2: 学校名・監督名入力
// ============================================================

interface Step2Props {
  prefecture: string;
  onBack: () => void;
  onStart: (schoolName: string, managerName: string) => void;
  loading: boolean;
}

function Step2({ prefecture, onBack, onStart, loading }: Step2Props) {
  const [schoolName, setSchoolName] = useState('');
  const [managerName, setManagerName] = useState('');

  const handleRandom = useCallback(() => {
    setSchoolName(generateRandomSchoolName(prefecture));
    setManagerName(generateRandomManagerName());
  }, [prefecture]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (schoolName.trim() && managerName.trim()) {
      onStart(schoolName.trim(), managerName.trim());
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.prefSelected}>
        都道府県：<span className={styles.prefName}>{prefecture}</span>
        <button className={styles.editLink} onClick={onBack}>変更</button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="schoolName">学校名</label>
          <span className={styles.hint}>例：新潟明訓、甲子園商業</span>
          <input
            id="schoolName"
            className={styles.input}
            type="text"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder={`例：${prefecture}高校`}
            required
            maxLength={20}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="managerName">監督名</label>
          <span className={styles.hint}>例：田中 太郎</span>
          <input
            id="managerName"
            className={styles.input}
            type="text"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="例：田中 太郎"
            required
            maxLength={20}
          />
        </div>

        <button
          type="button"
          className={styles.btnRandom}
          onClick={handleRandom}
        >
          🎲 ランダムで決める
        </button>

        <button
          type="submit"
          className={styles.btnStart}
          disabled={loading || !schoolName.trim() || !managerName.trim()}
        >
          {loading ? '起動中...' : 'ゲームスタート ▶'}
        </button>
      </form>

      <button className={styles.btnBack} onClick={onBack}>← 都道府県を選びなおす</button>
    </div>
  );
}

// ============================================================
// メインページ
// ============================================================

export default function NewGamePage() {
  const router = useRouter();
  const newWorldGame = useWorldStore((s) => s.newWorldGame);

  const [step, setStep] = useState<1 | 2>(1);
  const [prefecture, setPrefecture] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSelectPref = useCallback((pref: string) => {
    setPrefecture(pref);
    setStep(2);
  }, []);

  const handleStart = useCallback((schoolName: string, managerName: string) => {
    if (!prefecture) return;
    setLoading(true);
    try {
      newWorldGame({ schoolName, prefecture, managerName });
      router.push('/play');
    } catch {
      setLoading(false);
      alert('ゲームの開始に失敗しました');
    }
  }, [prefecture, newWorldGame, router]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>🆕 新規プレイ — 学校選択</div>
        <div className={styles.headerSubtitle}>あなたの学校を作りましょう</div>
      </div>

      {/* ステップインジケーター */}
      <div className={styles.steps}>
        <div className={`${styles.step} ${step === 1 ? styles.stepActive : ''}`}>
          <div className={styles.stepNum}>1</div>
          <span>都道府県</span>
        </div>
        <div className={styles.stepDivider} />
        <div className={`${styles.step} ${step === 2 ? styles.stepActive : ''}`}>
          <div className={styles.stepNum}>2</div>
          <span>学校・監督</span>
        </div>
      </div>

      {step === 1 && (
        <Step1 selected={prefecture} onSelect={handleSelectPref} />
      )}

      {step === 2 && (
        <Step2
          prefecture={prefecture}
          onBack={() => setStep(1)}
          onStart={handleStart}
          loading={loading}
        />
      )}

      <button className={styles.btnBack} onClick={() => router.push('/')}>
        ← タイトルに戻る
      </button>
    </div>
  );
}
