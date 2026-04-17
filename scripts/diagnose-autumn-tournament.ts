/**
 * diagnose-autumn-tournament.ts — 秋大会バグ診断スクリプト
 *
 * 実行: npx tsx scripts/diagnose-autumn-tournament.ts
 *
 * 新規ゲーム開始 → 日を進めて夏大会 → 秋大会まで進行し、各マイルストーンを確認する。
 */

import { createRNG } from '../src/engine/core/rng';
import { createWorldState } from '../src/engine/world/create-world';
import { advanceWorldDay } from '../src/engine/world/world-ticker';
import { generatePlayer } from '../src/engine/player/generate';
import type { WorldState } from '../src/engine/world/world-state';
import type { TournamentBracket } from '../src/engine/world/tournament-bracket';
import type { PracticeMenuId } from '../src/engine/types/calendar';

// ============================================================
// 設定
// ============================================================

const SEED = 'diagnose-autumn-2026';

// ============================================================
// ヘルパー
// ============================================================

function dateStr(world: WorldState): string {
  const d = world.currentDate;
  return `Year${d.year}/${d.month}/${d.day}`;
}

function findPlayerInBracket(bracket: TournamentBracket, playerSchoolId: string): {
  found: boolean;
  roundNumber: number;
  slot: 'home' | 'away' | null;
} {
  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.homeSchoolId === playerSchoolId) {
        return { found: true, roundNumber: round.roundNumber, slot: 'home' };
      }
      if (match.awaySchoolId === playerSchoolId) {
        return { found: true, roundNumber: round.roundNumber, slot: 'away' };
      }
    }
  }
  return { found: false, roundNumber: -1, slot: null };
}

function descBracket(bracket: TournamentBracket, playerSchoolId: string): string {
  const lines: string[] = [];
  lines.push(`  type=${bracket.type}, id=${bracket.id}, isCompleted=${bracket.isCompleted}`);
  for (const round of bracket.rounds) {
    const playerMatches = round.matches.filter(
      (m) => m.homeSchoolId === playerSchoolId || m.awaySchoolId === playerSchoolId,
    );
    if (playerMatches.length > 0) {
      for (const m of playerMatches) {
        lines.push(
          `  Round${round.roundNumber}: home=${m.homeSchoolId ?? 'null'}, away=${m.awaySchoolId ?? 'null'}, ` +
          `winnerId=${m.winnerId ?? 'null'}`,
        );
      }
    }
  }
  return lines.join('\n');
}

// ============================================================
// メイン
// ============================================================

async function main() {
  console.log('='.repeat(70));
  console.log('秋大会バグ診断スクリプト');
  console.log('='.repeat(70));

  const rng = createRNG(SEED);

  // 自校作成
  const players = [];
  for (let i = 0; i < 18; i++) {
    const p = generatePlayer(rng.derive(`p${i}`), { enrollmentYear: 1, schoolReputation: 55 });
    players.push({ ...p, enrollmentYear: 1 });
  }

  const playerTeam = {
    id: 'diagnose-player-school',
    name: '診断高校',
    prefecture: '新潟',
    reputation: 55,
    players,
    lineup: null,
    facilities: { ground: 3, bullpen: 3, battingCage: 3, gym: 3 } as const,
  };

  const manager = {
    name: '診断監督',
    yearsActive: 0,
    fame: 10,
    totalWins: 0,
    totalLosses: 0,
    koshienAppearances: 0,
    koshienWins: 0,
  };

  let world = createWorldState(playerTeam, manager, '新潟', SEED, rng.derive('world-init'));

  console.log(`\n開始: ${dateStr(world)}`);
  console.log(`playerSchoolId: ${world.playerSchoolId}`);
  const psInit = world.schools.find((s) => s.id === world.playerSchoolId);
  console.log(`自校reputation: ${psInit?.reputation}`);
  console.log(`全校数: ${world.schools.length}`);

  const practice: PracticeMenuId = 'batting_basic';
  const checkpoints: Record<string, boolean> = {
    '7/10_summer_created': false,
    '7/31_summer_ended': false,
    '9/15_autumn_created': false,
    '9/15_player_in_bracket': false,
    '10/15_autumn_completed': false,
  };

  // 詳細ログ
  const issues: string[] = [];

  // Year 1 の 10/20 まで進める
  const TARGET = { year: 1, month: 10, day: 20 };

  let prevPhase = world.seasonState.phase;

  while (
    world.currentDate.year < TARGET.year ||
    (world.currentDate.year === TARGET.year && world.currentDate.month < TARGET.month) ||
    (world.currentDate.year === TARGET.year &&
      world.currentDate.month === TARGET.month &&
      world.currentDate.day < TARGET.day)
  ) {
    const dayRng = rng.derive(
      `day-${world.currentDate.year}-${world.currentDate.month}-${world.currentDate.day}`,
    );
    const { nextWorld, result } = advanceWorldDay(world, practice, dayRng);
    const prev = world;
    world = nextWorld;

    const d = world.currentDate;

    // フェーズ変化をログ
    if (world.seasonState.phase !== prevPhase) {
      console.log(
        `\n📅 [${dateStr(world)}] フェーズ変化: ${prevPhase} → ${world.seasonState.phase}`,
      );
      prevPhase = world.seasonState.phase;
    }

    // ========== チェックポイント ==========

    // 7/10: summer 大会が作られているか
    if (d.month === 7 && d.day === 10) {
      const hasSummer = world.activeTournament !== null && world.activeTournament?.type === 'summer';
      checkpoints['7/10_summer_created'] = hasSummer;
      console.log(`\n🔍 [7/10] activeTournament: ${world.activeTournament?.type ?? 'null'}`);
      if (!hasSummer) {
        issues.push('⚠️  7/10: summer activeTournament が作成されていない');
      } else {
        const ps = findPlayerInBracket(world.activeTournament!, world.playerSchoolId);
        console.log(
          `   自校はブラケットに存在: ${ps.found} (Round${ps.roundNumber}, slot=${ps.slot})`,
        );
        if (!ps.found) {
          issues.push('⚠️  7/10: 自校が summer ブラケットに存在しない');
        }
      }
    }

    // 7/31: summer 大会が終了しているか
    if (d.month === 7 && d.day === 31) {
      const summerDone = world.activeTournament === null;
      checkpoints['7/31_summer_ended'] = summerDone;
      const histCount = world.tournamentHistory?.length ?? 0;
      console.log(
        `\n🔍 [7/31] activeTournament: ${world.activeTournament?.type ?? 'null'}, ` +
        `history: ${histCount}件`,
      );
      if (!summerDone) {
        issues.push(
          `⚠️  7/31: summer 大会がまだ終了していない (${world.activeTournament?.type}, ` +
          `isCompleted=${world.activeTournament?.isCompleted})`,
        );
      }

      // 夏大会における自校の結果を確認
      const summerHist = world.tournamentHistory?.find((t) => t.type === 'summer');
      if (summerHist) {
        const ps = findPlayerInBracket(summerHist, world.playerSchoolId);
        console.log(
          `   自校の夏大会最終位置: Round${ps.roundNumber}, slot=${ps.slot}`,
        );
        let bestRound = 0;
        for (const round of summerHist.rounds) {
          for (const m of round.matches) {
            if (
              (m.homeSchoolId === world.playerSchoolId ||
                m.awaySchoolId === world.playerSchoolId) &&
              m.winnerId === world.playerSchoolId
            ) {
              if (round.roundNumber > bestRound) bestRound = round.roundNumber;
            }
          }
        }
        console.log(`   自校の最高到達ラウンド: ${bestRound}`);
      }
    }

    // 9/1: autumn まだ作られていないことを確認
    if (d.month === 9 && d.day === 1) {
      console.log(
        `\n🔍 [9/1] activeTournament: ${world.activeTournament?.type ?? 'null'}, ` +
        `phase: ${world.seasonState.phase}`,
      );
      if (world.activeTournament !== null) {
        issues.push(
          `⚠️  9/1: activeTournament が null でない (type=${world.activeTournament?.type})`,
        );
      }
    }

    // 9/15: autumn 大会が作られているか
    if (d.month === 9 && d.day === 15) {
      const hasAutumn =
        world.activeTournament !== null && world.activeTournament?.type === 'autumn';
      checkpoints['9/15_autumn_created'] = hasAutumn;
      console.log(
        `\n🔍 [9/15] activeTournament: ${world.activeTournament?.type ?? 'null'}, ` +
        `phase: ${world.seasonState.phase}`,
      );
      if (!hasAutumn) {
        issues.push(
          `❌ 9/15: autumn activeTournament が作成されていない! (activeTournament=${world.activeTournament?.type ?? 'null'})`,
        );
        // 前日の状態を確認
        const prevTournament = prev.activeTournament;
        console.log(
          `   前日(9/14)のactiveTournament: ${prevTournament?.type ?? 'null'}, ` +
          `isCompleted=${prevTournament?.isCompleted ?? 'N/A'}`,
        );
      } else {
        const ps = findPlayerInBracket(world.activeTournament!, world.playerSchoolId);
        checkpoints['9/15_player_in_bracket'] = ps.found;
        console.log(
          `   自校はブラケットに存在: ${ps.found} (Round${ps.roundNumber}, slot=${ps.slot})`,
        );
        if (!ps.found) {
          issues.push('❌ 9/15: 自校が autumn ブラケットに存在しない');
          console.log('   ブラケット全体:');
          console.log(descBracket(world.activeTournament!, world.playerSchoolId));
        } else {
          console.log('   ブラケット内の自校試合:');
          console.log(descBracket(world.activeTournament!, world.playerSchoolId));
        }

        // 全48校がブラケットに含まれるか確認
        const allIds = new Set<string>();
        for (const round of world.activeTournament!.rounds) {
          for (const m of round.matches) {
            if (m.homeSchoolId) allIds.add(m.homeSchoolId);
            if (m.awaySchoolId) allIds.add(m.awaySchoolId);
          }
        }
        console.log(`   ブラケットに含まれる学校数（初期配置）: ${allIds.size}/48`);
        if (allIds.size !== 48) {
          issues.push(`❌ 9/15: ブラケットに含まれる学校数が${allIds.size}（48校でない）`);
        }
      }
    }

    // 秋大会期間中の各ラウンド確認
    if (
      world.activeTournament?.type === 'autumn' &&
      result.playerMatchResult !== undefined
    ) {
      if (result.playerMatchResult !== null) {
        const score = result.playerMatchResult.finalScore;
        const won = result.playerMatchResult.winner === result.playerMatchSide;
        console.log(
          `\n⚾ [${dateStr(world)}] 自校の試合: ` +
          `${score.home}-${score.away} (自校=${result.playerMatchSide}, ` +
          `${won ? '✅勝利' : '❌敗退'})`,
        );
      }
    }

    // 10/15: autumn 大会が完了しているか
    if (d.month === 10 && d.day === 15) {
      const autumnDone = world.activeTournament === null;
      checkpoints['10/15_autumn_completed'] = autumnDone;
      const histCount = world.tournamentHistory?.length ?? 0;
      console.log(
        `\n🔍 [10/15] activeTournament: ${world.activeTournament?.type ?? 'null'}, ` +
        `history: ${histCount}件, phase: ${world.seasonState.phase}`,
      );
      if (!autumnDone) {
        issues.push(
          `⚠️  10/15: autumn 大会が完了していない (isCompleted=${world.activeTournament?.isCompleted})`,
        );
        if (world.activeTournament) {
          console.log('   未完了ラウンド:');
          for (const round of world.activeTournament.rounds) {
            const undecided = round.matches.filter(
              (m) =>
                m.winnerId === null &&
                (m.homeSchoolId !== null || m.awaySchoolId !== null),
            );
            if (undecided.length > 0) {
              console.log(`   Round${round.roundNumber}: 未決定試合 ${undecided.length}件`);
            }
          }
        }
      } else {
        const autumnHist = world.tournamentHistory?.find((t) => t.type === 'autumn');
        if (autumnHist) {
          const champion = world.schools.find((s) => s.id === autumnHist.champion)?.name ?? autumnHist.champion;
          console.log(`   優勝: ${champion}`);
          let bestRound = 0;
          for (const round of autumnHist.rounds) {
            for (const m of round.matches) {
              if (
                (m.homeSchoolId === world.playerSchoolId ||
                  m.awaySchoolId === world.playerSchoolId) &&
                m.winnerId === world.playerSchoolId
              ) {
                if (round.roundNumber > bestRound) bestRound = round.roundNumber;
              }
            }
          }
          console.log(`   自校の最高到達ラウンド: ${bestRound}`);
        }
      }
    }
  }

  // ========== 結果サマリー ==========
  console.log('\n' + '='.repeat(70));
  console.log('診断結果');
  console.log('='.repeat(70));

  for (const [key, value] of Object.entries(checkpoints)) {
    console.log(`  ${value ? '✅' : '❌'} ${key}: ${value ? 'OK' : 'FAIL'}`);
  }

  if (issues.length > 0) {
    console.log('\n⚠️  発見された問題:');
    for (const issue of issues) {
      console.log(`  ${issue}`);
    }
  } else {
    console.log('\n🎉 問題は検出されませんでした（再現しなかった可能性があります）');
  }

  console.log(`\n最終状態: ${dateStr(world)}, phase=${world.seasonState.phase}`);
  console.log('='.repeat(70));
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
