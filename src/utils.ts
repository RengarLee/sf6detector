export type CharacterLeagueData = {
  character: string;
  leaguePoint: number;
  masterRate: number;
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

/** Pick the character with the highest LP (used for first-load default). */
export function pickDefaultCharacter(data: CharacterLeagueData[]): CharacterLeagueData | null {
  return data
    .filter((c) => c.leaguePoint > 0)
    .sort((a, b) => b.leaguePoint - a.leaguePoint)[0] ?? null;
}

export type CharacterScoreChange = {
  character: string;
  currentLP: number;
  currentMR: number;
};

export function detectCharacterChange(
  previous: CharacterLeagueData[],
  current: CharacterLeagueData[],
): CharacterScoreChange | null {
  for (const curr of current) {
    const prev = previous.find((p) => p.character === curr.character);
    if (!prev) continue;

    const lpChanged = curr.leaguePoint !== prev.leaguePoint && curr.leaguePoint > 0;
    const mrChanged = curr.masterRate !== prev.masterRate && curr.masterRate > 0;

    if (lpChanged || mrChanged) {
      return {
        character: curr.character,
        currentLP: curr.leaguePoint,
        currentMR: curr.masterRate,
      };
    }
  }
  return null;
}

export function parseCharacterLeagueData(html: string): CharacterLeagueData[] {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/,
  );
  if (!match) return [];

  try {
    const data = JSON.parse(match[1]);
    const infos =
      data?.props?.pageProps?.play?.character_league_infos as
        | unknown[]
        | undefined;
    if (!Array.isArray(infos)) return [];

    return infos.map((item: any) => ({
      character: item.character_alpha as string,
      leaguePoint: item.league_info.league_point as number,
      masterRate: item.league_info.master_rating as number,
    }));
  } catch {
    return [];
  }
}
