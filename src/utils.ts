export type ScoreData = {
  current: number;
  initial: number;
};

export type MatchData = {
  mr: ScoreData;
  lp: ScoreData;
  wins: number;
  losses: number;
};

export type RustBattleEntry = {
  date: string;
  player1_name: string;
  player1_result: string;
  player1_score_type: string;
  player1_score: number;
  player2_name: string;
  player2_result: string;
  player2_score_type: string;
  player2_score: number;
};

export type MyData = {
  myResult: string;
  myScore: number;
  myScoreType: "MR" | "LP";
};

export function findMyData(entry: RustBattleEntry, username: string): MyData {
  const isP1 = entry.player1_name === username;
  return {
    myResult: isP1 ? entry.player1_result : entry.player2_result,
    myScore: isP1 ? entry.player1_score : entry.player2_score,
    myScoreType: (isP1 ? entry.player1_score_type : entry.player2_score_type) as "MR" | "LP",
  };
}

export function calcWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

export function processNewEntries(
  entries: RustBattleEntry[],
  baselineDate: string | null,
  username: string,
): { newEntries: RustBattleEntry[]; newWins: number; newLosses: number } {
  if (!username || entries.length === 0) {
    return { newEntries: [], newWins: 0, newLosses: 0 };
  }

  // Find new entries since baseline
  const newEntries: RustBattleEntry[] = [];
  for (const entry of entries) {
    if (entry.date === baselineDate) break;
    newEntries.push(entry);
  }

  let newWins = 0;
  let newLosses = 0;
  for (const entry of newEntries) {
    const { myResult } = findMyData(entry, username);
    if (myResult === "WIN") newWins++;
    else newLosses++;
  }

  return { newEntries, newWins, newLosses };
}

export function updateStatsWithNewEntries(
  prev: MatchData,
  newWins: number,
  newLosses: number,
  currentScore: number,
  scoreType: "MR" | "LP",
): MatchData {
  const updated: MatchData = {
    ...prev,
    wins: prev.wins + newWins,
    losses: prev.losses + newLosses,
  };

  if (scoreType === "MR") {
    updated.mr = { ...prev.mr, current: currentScore };
    if (prev.mr.initial === 0) updated.mr.initial = currentScore;
  } else {
    updated.lp = { ...prev.lp, current: currentScore };
    if (prev.lp.initial === 0) updated.lp.initial = currentScore;
  }

  return updated;
}

export function initializeBaseline(
  prev: MatchData,
  score: number,
  scoreType: "MR" | "LP",
): MatchData {
  const updated = { ...prev };
  if (scoreType === "MR") {
    updated.mr = { current: score, initial: score };
  } else {
    updated.lp = { current: score, initial: score };
  }
  return updated;
}
