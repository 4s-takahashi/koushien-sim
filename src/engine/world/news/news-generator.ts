/**
 * news-generator — 日次ニュース生成
 *
 * advanceWorldDay() から呼び出され、その日に起きた出来事を
 * WorldNewsItem[] として返す。
 *
 * 生成するニュース:
 * - 番狂わせ（弱小校が強豪を倒したとき）
 * - 注目中学生（S/A 級の中学3年生の動向）— 月1回
 * - ドラフト関連（10月20日にドラフト結果まとめ）
 * - OB活躍（卒業後のプロ/大学での活躍ニュース）— 週1回
 * - シーズン節目（フェーズ移行）
 * - 日常ニュース（練習成果・怪我・回復など）— 低頻度
 * - 週次トピック（各曜日ごとにランダムなニュース）
 */

import type { RNG } from '../../core/rng';
import type { WorldState, MiddleSchoolPlayer } from '../world-state';
import type { WorldNewsItem } from '../../world/world-ticker';
import type { GraduateSummary } from '../person-state';
import { computeMiddleSchoolOverall } from '../scout/scout-system';
import { generateId } from '../../core/id';

// ============================================================
// 内部ヘルパー
// ============================================================

/**
 * 番狂わせニュースを生成する。
 * 評判差が 15 以上のマッチアップで弱小が勝った場合に生成。
 */
export function generateUpsetNews(
  winnerName: string,
  winnerRep: number,
  loserName: string,
  loserRep: number,
  winnerSchoolId: string,
  loserSchoolId: string,
): WorldNewsItem {
  const repDiff = loserRep - winnerRep;
  const importance = repDiff >= 30 ? 'high' : repDiff >= 15 ? 'medium' : 'low';

  const headlines = [
    `【番狂わせ】${winnerName}が強豪${loserName}を撃破！`,
    `【激戦】${winnerName}が${loserName}を下す！下剋上達成！`,
    `【衝撃】ダークホース${winnerName}が${loserName}に競り勝つ`,
  ];
  const headline = headlines[Math.floor(Math.random() * headlines.length)];

  return {
    type: 'upset',
    headline,
    involvedSchoolIds: [winnerSchoolId, loserSchoolId],
    involvedPlayerIds: [],
    importance,
  };
}

/**
 * 注目中学生ニュースを生成する。
 * S/A 級の中学3年生を対象に動向を報告。
 */
export function generateProspectNews(
  ms: MiddleSchoolPlayer,
  overall: number,
): WorldNewsItem {
  const tier = overall >= 70 ? 'S' : overall >= 55 ? 'A' : 'B';
  const headlines: Record<string, string[]> = {
    S: [
      `【超高校級】${ms.prefecture}出身の${ms.lastName}${ms.firstName}（中3）に熱視線`,
      `【逸材】${ms.lastName}${ms.firstName}選手（中3）が複数強豪校から勧誘殺到`,
      `【注目】超高校級の逸材、${ms.prefecture}・${ms.lastName}${ms.firstName}の去就に注目`,
    ],
    A: [
      `【注目株】${ms.prefecture}の${ms.lastName}${ms.firstName}（中3）が有望候補に浮上`,
      `【有望】${ms.lastName}${ms.firstName}選手（${ms.prefecture}・中3）に複数校が関心`,
      `【スカウト情報】${ms.prefecture}の${ms.lastName}${ms.firstName}（中3）が各校注目`,
    ],
    B: [
      `【育成株】${ms.prefecture}の${ms.lastName}${ms.firstName}（中3）が伸びしろで評価`,
      `${ms.prefecture}・${ms.lastName}${ms.firstName}（中3）の進学先が注目される`,
    ],
  };
  const tierHeadlines = headlines[tier] ?? headlines['B'];
  const headline = tierHeadlines[Math.floor(Math.random() * tierHeadlines.length)];

  return {
    type: 'upset',   // WorldNewsItem.type は限定的なので upset で代替
    headline,
    involvedSchoolIds: [],
    involvedPlayerIds: [ms.id],
    importance: tier === 'S' ? 'high' : tier === 'A' ? 'medium' : 'low',
  };
}

/**
 * ドラフトニュースを生成する。
 */
export function generateDraftNews(
  playerName: string,
  schoolName: string,
  proTeam: string,
  round: number,
  playerId: string,
  schoolId: string,
): WorldNewsItem {
  const importance = round <= 2 ? 'high' : round <= 5 ? 'medium' : 'low';
  return {
    type: 'draft',
    headline: `【ドラフト】${schoolName}・${playerName}が${proTeam}に${round}位指名`,
    involvedSchoolIds: [schoolId],
    involvedPlayerIds: [playerId],
    importance,
  };
}

/**
 * OB活躍ニュースを生成する（プロ入り後の活躍など）。
 */
export function generateOBActivityNews(
  personName: string,
  schoolName: string,
  team: string,
  achievement: string,
  personId: string,
  schoolId: string,
): WorldNewsItem {
  return {
    type: 'record',
    headline: `【OB情報】${schoolName}OB・${personName}（${team}）${achievement}`,
    involvedSchoolIds: [schoolId],
    involvedPlayerIds: [personId],
    importance: 'low',
  };
}

/**
 * 日常トレーニングニュースを生成する。
 */
function generateTrainingNews(
  world: WorldState,
  rng: RNG,
): WorldNewsItem | null {
  const validSchools = world.schools.filter((s) => s.players.length > 0);
  if (validSchools.length === 0) return null;

  const school = rng.pick(validSchools);
  const { month } = world.currentDate;

  const trainingTopics = [
    `${school.name}が合宿で猛練習。選手たちの成長に期待`,
    `${school.name}の主将が練習メニューを見直し、チーム一丸となって取り組む`,
    `${school.name}で新たな投球フォームを習得中の投手が注目される`,
    `${school.name}の打線が状態上昇。夏の大会に向け調整を進める`,
    `${school.name}のディフェンスが安定。守備の堅固さに定評`,
    `${school.name}がスピード強化に特化した特訓を実施中`,
    `${school.name}の新1年生が早くも頭角を現す`,
    `${school.name}の2年生エースが球速アップを記録`,
  ];

  const campTopics = [
    `${school.name}が春季キャンプを開始。今年の飛躍を目指す`,
    `${school.name}の冬期強化合宿が終了。各選手が大きく成長`,
    `${school.name}が春に向けて集中トレーニング実施中`,
  ];

  const topics = (month >= 12 || month <= 3) ? [...trainingTopics, ...campTopics] : trainingTopics;
  const headline = rng.pick(topics);

  return {
    type: 'record',
    headline,
    involvedSchoolIds: [school.id],
    involvedPlayerIds: [],
    importance: 'low',
  };
}

/**
 * チーム状況ニュースを生成する（怪我・回復・注目選手）。
 */
function generateTeamSituationNews(
  world: WorldState,
  rng: RNG,
): WorldNewsItem | null {
  const validSchools = world.schools.filter((s) => s.players.length >= 5);
  if (validSchools.length === 0) return null;

  const school = rng.pick(validSchools);
  const injuredPlayers = school.players.filter((p) => p.condition.injury !== null);

  if (injuredPlayers.length > 0 && rng.chance(0.5)) {
    const player = rng.pick(injuredPlayers);
    return {
      type: 'injury',
      headline: `【負傷情報】${school.name}・${player.lastName}${player.firstName}選手が負傷。回復に専念`,
      involvedSchoolIds: [school.id],
      involvedPlayerIds: [player.id],
      importance: 'low',
    };
  }

  // 注目選手ニュース
  const topPlayers = school.players
    .filter((p) => p.condition.injury === null)
    .slice(0, 3);

  if (topPlayers.length === 0) return null;

  const player = rng.pick(topPlayers);
  const newsOptions = [
    `${school.name}・${player.lastName}${player.firstName}選手が絶好調。チームを牽引`,
    `${school.name}の${player.lastName}${player.firstName}選手が今季の出来に手応え`,
    `${school.name}・${player.lastName}${player.firstName}選手が練習試合で好パフォーマンス`,
  ];

  return {
    type: 'record',
    headline: rng.pick(newsOptions),
    involvedSchoolIds: [school.id],
    involvedPlayerIds: [player.id],
    importance: 'low',
  };
}

/**
 * 地域野球トピックを生成する（汎用的な野球ニュース）。
 */
function generateRegionalNews(
  world: WorldState,
  rng: RNG,
): WorldNewsItem | null {
  const { month } = world.currentDate;
  const prefecture = world.prefecture;

  const regionalTopics = [
    `${prefecture}県の高校野球界が活発な動き。各校が夏に向け調整中`,
    `${prefecture}の指導者研修会が開催。監督・コーチ陣が最新トレーニング手法を学ぶ`,
    `${prefecture}高野連が今季の日程を発表。各校の準備が加速`,
    `${prefecture}の強豪校が練習試合で貴重な実戦経験を積む`,
    `${prefecture}の注目校が連日の猛練習。選手の成長を確認`,
    `県内各校の選手たちが地域の期待を背に、今日も熱戦を繰り広げる`,
  ];

  const springTopics = [
    `センバツに向け各校がシード権争いを展開`,
    `春の地方大会に向けて各チームが準備を整える`,
  ];

  const summerTopics = [
    `夏の甲子園予選が迫る。各校が連日の実戦練習を積む`,
    `地方大会の組み合わせが決定。ダークホース校の躍進に注目`,
  ];

  const autumnTopics = [
    `秋季大会に向けて各チームが実力を磨く`,
    `来春センバツへの切符を懸けた秋季大会が迫る`,
  ];

  let topics = [...regionalTopics];
  if (month >= 2 && month <= 4) topics = [...topics, ...springTopics];
  if (month >= 6 && month <= 8) topics = [...topics, ...summerTopics];
  if (month >= 9 && month <= 11) topics = [...topics, ...autumnTopics];

  return {
    type: 'tournament_result',
    headline: rng.pick(topics),
    involvedSchoolIds: [],
    involvedPlayerIds: [],
    importance: 'low',
  };
}

// ============================================================
// メイン: 日次ニュース生成
// ============================================================

/**
 * 世界状態から日次ニュースを生成する。
 *
 * @param world  現在の WorldState
 * @param rng    乱数生成器
 * @returns      生成された WorldNewsItem[]
 */
export function generateDailyNews(
  world: WorldState,
  rng: RNG,
): WorldNewsItem[] {
  const news: WorldNewsItem[] = [];
  const { currentDate, middleSchoolPool, schools, personRegistry } = world;
  const newsRng = rng.derive('news');
  const { month, day } = currentDate;

  // ============================================================
  // シーズン節目ニュース（必ず生成）
  // ============================================================

  // 春の大会開始（4月1日）
  if (month === 4 && day === 1) {
    news.push({
      type: 'tournament_result',
      headline: '【開幕】新年度がスタート！各校の新チームが本格始動',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'high',
    });
  }

  // 春の練習試合シーズン開始（5月）
  if (month === 5 && day === 1) {
    news.push({
      type: 'tournament_result',
      headline: '【練習試合解禁】春季大会終了。各校が実戦で夏への調整を開始',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'medium',
    });
  }

  // 夏の大会（7月1日）
  if (month === 7 && day === 1) {
    news.push({
      type: 'tournament_result',
      headline: '【夏大会】地方大会が各地で開幕！頂点をかけた熱戦スタート',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'high',
    });
  }

  // 甲子園（8月6日）
  if (month === 8 && day === 6) {
    news.push({
      type: 'tournament_result',
      headline: '【甲子園開幕】全国高校野球選手権大会が開幕！49代表校が集結',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'high',
    });
  }

  // 秋の大会（9月1日）
  if (month === 9 && day === 1) {
    news.push({
      type: 'tournament_result',
      headline: '【秋大会】秋季地方大会が開幕。来春センバツへ向けた戦い',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'medium',
    });
  }

  // ドラフト（10月20日）
  if (month === 10 && day === 20) {
    news.push({
      type: 'draft',
      headline: '【プロ野球ドラフト会議】今年のドラフト会議が開催される',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'high',
    });
  }

  // 年末（12月）
  if (month === 12 && day === 1) {
    news.push({
      type: 'tournament_result',
      headline: '【冬季強化】各校が冬の練習に突入。春に向けた土台作りが始まる',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'medium',
    });
  }

  // センバツ選考発表（1月）
  if (month === 1 && day === 25) {
    news.push({
      type: 'tournament_result',
      headline: '【センバツ選考】春のセンバツ出場校が間もなく発表。注目校の行方は',
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'medium',
    });
  }

  // 新入生情報（4月上旬）
  if (month === 4 && day === 5) {
    const totalNew = schools.reduce((sum, s) => {
      const yr1 = s.players.filter(p => p.enrollmentYear === currentDate.year);
      return sum + yr1.length;
    }, 0);
    news.push({
      type: 'tournament_result',
      headline: `【新入生】県内各校に新1年生が入部。今年度は計${totalNew}人が野球部に加入`,
      involvedSchoolIds: [],
      involvedPlayerIds: [],
      importance: 'medium',
    });
  }

  // ============================================================
  // 注目中学生ニュース（月1日 or 低確率）
  // ============================================================
  const isMonthStart = day === 1;
  const shouldGenerateProspect = isMonthStart || newsRng.chance(0.04);

  if (shouldGenerateProspect) {
    const grade3 = middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 3);
    const prospects = grade3.filter((ms) => {
      const overall = computeMiddleSchoolOverall(ms);
      return overall >= 45; // B 級以上（従来より緩和）
    });

    if (prospects.length > 0) {
      const sorted = [...prospects].sort((a, b) =>
        computeMiddleSchoolOverall(b) - computeMiddleSchoolOverall(a)
      );
      const featured = isMonthStart ? sorted[0] : newsRng.pick(sorted);
      const overall = computeMiddleSchoolOverall(featured);
      if (overall >= 45) {
        news.push(generateProspectNews(featured, overall));
      }
    }

    // 中学2年生の有望株も時々ピックアップ
    if (newsRng.chance(0.3) && month >= 10) {
      const grade2 = middleSchoolPool.filter((ms) => ms.middleSchoolGrade === 2);
      const prospects2 = grade2.filter((ms) => computeMiddleSchoolOverall(ms) >= 55);
      if (prospects2.length > 0) {
        const featured2 = newsRng.pick(prospects2);
        const overall2 = computeMiddleSchoolOverall(featured2);
        news.push({
          type: 'upset',
          headline: `【来年の注目株】${featured2.prefecture}の${featured2.lastName}${featured2.firstName}（中2）が早くも各校に注目される`,
          involvedSchoolIds: [],
          involvedPlayerIds: [featured2.id],
          importance: 'low',
        });
      }
    }
  }

  // ============================================================
  // OB活躍ニュース（週1回: day % 7 === 0）
  // ============================================================
  const isWeeklyOBNews = day % 7 === 0;
  if (isWeeklyOBNews && personRegistry.entries.size > 0) {
    const graduates: { personId: string; name: string; schoolName: string; path: string; schoolId: string }[] = [];

    for (const [personId, entry] of personRegistry.entries) {
      if (entry.graduateSummary) {
        const g = entry.graduateSummary;
        if (g.careerPath.type === 'pro') {
          graduates.push({
            personId,
            name: g.name,
            schoolName: g.schoolName,
            path: g.careerPath.team,
            schoolId: g.schoolId,
          });
        }
      }
    }

    if (graduates.length > 0) {
      const featured = newsRng.pick(graduates);
      const achievements = [
        'が今季初安打を放つ',
        'が二軍で好投。一軍昇格へ向けアピール',
        'が一軍昇格を果たす',
        'が練習試合で本塁打を放つ',
        'が春季キャンプで指導陣の注目を浴びる',
        'が先発マウンドで好投。チームの勝利に貢献',
        'が規定打席に到達。打率3割をキープ',
        'が代打出場で値千金の一打',
      ];
      const achievement = newsRng.pick(achievements);
      news.push(generateOBActivityNews(
        featured.name,
        featured.schoolName,
        featured.path,
        achievement,
        featured.personId,
        featured.schoolId,
      ));
    } else if (personRegistry.entries.size > 0) {
      // 大学・社会人OBのニュース
      const uniGrads: { personId: string; name: string; schoolName: string; schoolId: string; team: string }[] = [];
      for (const [personId, entry] of personRegistry.entries) {
        if (entry.graduateSummary?.careerPath.type === 'university') {
          uniGrads.push({
            personId,
            name: entry.graduateSummary.name,
            schoolName: entry.graduateSummary.schoolName,
            schoolId: entry.graduateSummary.schoolId,
            team: entry.graduateSummary.careerPath.school,
          });
        }
      }
      if (uniGrads.length > 0 && newsRng.chance(0.4)) {
        const featured = newsRng.pick(uniGrads);
        const achievements = [
          'がリーグ戦でチームの主軸として活躍',
          'が大学選手権に出場。プロのスカウトが注目',
          'が明治神宮大会に向け調整中',
          'が大学入学後も着実に成長。プロ指名候補に浮上',
        ];
        news.push({
          type: 'record',
          headline: `【OB情報】${featured.schoolName}OB・${featured.name}（${featured.team}）${newsRng.pick(achievements)}`,
          involvedSchoolIds: [featured.schoolId],
          involvedPlayerIds: [featured.personId],
          importance: 'low',
        });
      }
    }
  }

  // ============================================================
  // 番狂わせニュース（大会シーズン中に高頻度）
  // ============================================================
  const inSummerTournament = (month === 7 || month === 8);
  const inAutumnTournament = month === 9;
  const inTournamentSeason = inSummerTournament || inAutumnTournament;

  const upsetChance = inSummerTournament ? 0.18 : inAutumnTournament ? 0.12 : 0.05;

  if (newsRng.chance(upsetChance)) {
    const validSchools = schools.filter((s) => s.reputation > 0);
    if (validSchools.length >= 2) {
      // ランダムに10校をサンプリングして上位/下位を選ぶ
      const shuffled = newsRng.pickN(validSchools, Math.min(validSchools.length, 10));
      const sorted = [...shuffled].sort((a, b) => b.reputation - a.reputation);
      if (sorted.length >= 2) {
        const strong = sorted[0];
        const weak = sorted[sorted.length - 1];
        if (strong.reputation - weak.reputation >= 15) {
          news.push(generateUpsetNews(
            weak.name, weak.reputation,
            strong.name, strong.reputation,
            weak.id, strong.id,
          ));
        }
      }
    }
  }

  // 非大会シーズンでも低確率で練習試合の番狂わせ
  if (!inTournamentSeason && newsRng.chance(0.03)) {
    const validSchools = schools.filter((s) => s.reputation > 0);
    if (validSchools.length >= 2) {
      const shuffled = newsRng.pickN(validSchools, Math.min(validSchools.length, 8));
      const sorted = [...shuffled].sort((a, b) => b.reputation - a.reputation);
      if (sorted.length >= 2 && sorted[0].reputation - sorted[sorted.length - 1].reputation >= 20) {
        news.push({
          type: 'upset',
          headline: `【練習試合】${sorted[sorted.length - 1].name}が強豪${sorted[0].name}に競り勝つ！`,
          involvedSchoolIds: [sorted[sorted.length - 1].id, sorted[0].id],
          involvedPlayerIds: [],
          importance: 'low',
        });
      }
    }
  }

  // ============================================================
  // 週次トピックニュース（毎週月曜: day % 7 === 1）
  // ============================================================
  if (day % 7 === 1) {
    // 週次の練習ニュース
    const trainingNews = generateTrainingNews(world, newsRng.derive('training'));
    if (trainingNews) {
      news.push(trainingNews);
    }
  }

  // ============================================================
  // 日常ニュース（毎日一定確率）
  // ============================================================

  // 3日に1回程度、チーム状況ニュース
  if (newsRng.chance(0.33)) {
    const situationNews = generateTeamSituationNews(world, newsRng.derive('situation'));
    if (situationNews) {
      news.push(situationNews);
    }
  }

  // 5日に1回程度、地域野球トピック
  if (newsRng.chance(0.2)) {
    const regionalNews = generateRegionalNews(world, newsRng.derive('regional'));
    if (regionalNews) {
      news.push(regionalNews);
    }
  }

  // ============================================================
  // ドラフト前後の注目ニュース（10月）
  // ============================================================
  if (month === 10 && newsRng.chance(0.15)) {
    const allSeniors = schools.flatMap((s) =>
      s.players.filter((p) => {
        const grade = currentDate.year - p.enrollmentYear + 1;
        return grade >= 3;
      })
    );
    if (allSeniors.length > 0) {
      const featured = newsRng.pick(allSeniors);
      const featuredSchool = schools.find((s) => s.players.some((p) => p.id === featured.id));
      if (featuredSchool) {
        const draftHeadlines = [
          `【ドラフト注目】${featuredSchool.name}・${featured.lastName}${featured.firstName}選手をプロ球団がマーク`,
          `【プロ注目】${featuredSchool.name}の${featured.lastName}${featured.firstName}選手が複数球団の視察を受ける`,
          `【ドラフト前哨戦】${featuredSchool.name}・${featured.lastName}${featured.firstName}の指名順位が注目される`,
        ];
        news.push({
          type: 'draft',
          headline: newsRng.pick(draftHeadlines),
          involvedSchoolIds: [featuredSchool.id],
          involvedPlayerIds: [featured.id],
          importance: 'medium',
        });
      }
    }
  }

  return news;
}
