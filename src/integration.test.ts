import { describe, it, expect } from "vitest";
import {
  parseCharacterLeagueData,
  detectCharacterChange,
  processNewEntries,
  findMyData,
  calcWinRate,
  pickDefaultCharacter,
} from "./utils";
import { makeEntry, makeNextDataHtml } from "./test-helpers";

// ============================================================
// Integration: Session initialization
// ============================================================

describe("Integration: session initialization from play page", () => {
  it("first play page load picks the highest-LP character and sets initial scores", () => {
    const html = makeNextDataHtml([
      { char: "RYU", lp: -1, mr: 0 },
      { char: "KEN", lp: 22620, mr: 0 },
      { char: "ZANGIEF", lp: 17838, mr: 0 },
    ]);

    const leagueData = parseCharacterLeagueData(html);
    expect(leagueData).toHaveLength(3);

    const best = pickDefaultCharacter(leagueData);
    expect(best).not.toBeNull();
    expect(best!.character).toBe("KEN");
    expect(best!.leaguePoint).toBe(22620);
    expect(best!.masterRate).toBe(0);
  });

  it("returns null default when all characters are unplayed", () => {
    const html = makeNextDataHtml([
      { char: "RYU", lp: -1, mr: 0 },
      { char: "KEN", lp: -1, mr: 0 },
    ]);

    const leagueData = parseCharacterLeagueData(html);
    const best = pickDefaultCharacter(leagueData);
    expect(best).toBeNull();
  });

  it("Master player initializes with both LP and MR", () => {
    const html = makeNextDataHtml([
      { char: "JURI", lp: 25000, mr: 1800 },
      { char: "KEN", lp: 22620, mr: 0 },
    ]);

    const leagueData = parseCharacterLeagueData(html);
    const best = pickDefaultCharacter(leagueData);
    expect(best!.character).toBe("JURI");
    expect(best!.leaguePoint).toBe(25000);
    expect(best!.masterRate).toBe(1800);
  });
});

// ============================================================
// Integration: Battle updates (win/loss tracking)
// ============================================================

describe("Integration: battlelog win/loss tracking", () => {
  it("first battlelog sets baseline, second battlelog counts new results", () => {
    const username = "Player1";

    // First poll — 2 existing battles, set baseline
    const firstPoll = [
      makeEntry({ date: "d2", player1_result: "WIN" }),
      makeEntry({ date: "d1", player1_result: "LOSE" }),
    ];
    const baselineDate = firstPoll[0].date; // "d2"

    // Second poll — 1 new battle prepended
    const secondPoll = [
      makeEntry({ date: "d3", player1_result: "WIN" }),
      ...firstPoll,
    ];

    const { newEntries, newWins, newLosses } = processNewEntries(secondPoll, baselineDate, username);
    expect(newEntries).toHaveLength(1);
    expect(newWins).toBe(1);
    expect(newLosses).toBe(0);
  });

  it("accumulates wins and losses across multiple polls", () => {
    const username = "Player1";
    let baseline = "d0";
    let totalWins = 0;
    let totalLosses = 0;

    // Poll 1: 2 new battles
    const poll1 = [
      makeEntry({ date: "d2", player1_result: "WIN" }),
      makeEntry({ date: "d1", player1_result: "LOSE" }),
      makeEntry({ date: "d0" }),
    ];
    const r1 = processNewEntries(poll1, baseline, username);
    totalWins += r1.newWins;
    totalLosses += r1.newLosses;
    baseline = r1.newEntries[0].date;

    // Poll 2: 3 more battles
    const poll2 = [
      makeEntry({ date: "d5", player1_result: "WIN" }),
      makeEntry({ date: "d4", player1_result: "WIN" }),
      makeEntry({ date: "d3", player1_result: "LOSE" }),
      ...poll1,
    ];
    const r2 = processNewEntries(poll2, baseline, username);
    totalWins += r2.newWins;
    totalLosses += r2.newLosses;

    expect(totalWins).toBe(3);
    expect(totalLosses).toBe(2);
    expect(calcWinRate(totalWins, totalLosses)).toBe(60);
  });

  it("correctly identifies player2 wins", () => {
    const username = "Player2";
    const entries = [
      makeEntry({ date: "d2", player2_result: "WIN" }),
      makeEntry({ date: "d1", player2_result: "WIN" }),
      makeEntry({ date: "d0" }),
    ];

    const { newWins, newLosses } = processNewEntries(entries, "d0", username);
    expect(newWins).toBe(2);
    expect(newLosses).toBe(0);

    // Verify findMyData agrees
    const myData = findMyData(entries[0], username);
    expect(myData.myResult).toBe("WIN");
  });
});

// ============================================================
// Integration: Score change after battle
// ============================================================

describe("Integration: score change detection after battle", () => {
  it("detects LP increase after a win", () => {
    const initialHtml = makeNextDataHtml([
      { char: "KEN", lp: 22620, mr: 0 },
      { char: "ZANGIEF", lp: 17838, mr: 0 },
    ]);
    const afterWinHtml = makeNextDataHtml([
      { char: "KEN", lp: 22800, mr: 0 },
      { char: "ZANGIEF", lp: 17838, mr: 0 },
    ]);

    const initial = parseCharacterLeagueData(initialHtml);
    const afterWin = parseCharacterLeagueData(afterWinHtml);

    const change = detectCharacterChange(initial, afterWin);
    expect(change).toEqual({ character: "KEN", currentLP: 22800, currentMR: 0 });

    // Score delta
    const lpDelta = change!.currentLP - initial.find((c) => c.character === "KEN")!.leaguePoint;
    expect(lpDelta).toBe(180);
  });

  it("detects LP decrease after a loss", () => {
    const before = parseCharacterLeagueData(
      makeNextDataHtml([{ char: "KEN", lp: 22620, mr: 0 }]),
    );
    const after = parseCharacterLeagueData(
      makeNextDataHtml([{ char: "KEN", lp: 22400, mr: 0 }]),
    );

    const change = detectCharacterChange(before, after);
    expect(change).not.toBeNull();
    expect(change!.currentLP).toBe(22400);

    const lpDelta = change!.currentLP - before[0].leaguePoint;
    expect(lpDelta).toBe(-220);
  });

  it("detects both LP and MR change for a Master player", () => {
    const before = parseCharacterLeagueData(
      makeNextDataHtml([{ char: "JURI", lp: 25000, mr: 1800 }]),
    );
    const after = parseCharacterLeagueData(
      makeNextDataHtml([{ char: "JURI", lp: 25100, mr: 1830 }]),
    );

    const change = detectCharacterChange(before, after);
    expect(change).toEqual({ character: "JURI", currentLP: 25100, currentMR: 1830 });
  });

  it("no change detected when scores stay the same between polls", () => {
    const html = makeNextDataHtml([
      { char: "KEN", lp: 22620, mr: 0 },
      { char: "ZANGIEF", lp: 17838, mr: 0 },
    ]);
    const data = parseCharacterLeagueData(html);

    expect(detectCharacterChange(data, data)).toBeNull();
  });
});

// ============================================================
// Integration: Character switch
// ============================================================

describe("Integration: character switch detection", () => {
  it("detects switch from KEN to ZANGIEF when ZANGIEF's score changes", () => {
    const poll1 = parseCharacterLeagueData(
      makeNextDataHtml([
        { char: "KEN", lp: 22800, mr: 0 },
        { char: "ZANGIEF", lp: 17838, mr: 0 },
      ]),
    );
    // User played a game with ZANGIEF
    const poll2 = parseCharacterLeagueData(
      makeNextDataHtml([
        { char: "KEN", lp: 22800, mr: 0 },
        { char: "ZANGIEF", lp: 18000, mr: 0 },
      ]),
    );

    const change = detectCharacterChange(poll1, poll2);
    expect(change).not.toBeNull();
    expect(change!.character).toBe("ZANGIEF");
    expect(change!.currentLP).toBe(18000);
  });

  it("tracks cumulative delta from initial snapshot per character", () => {
    // Simulate: initial → play KEN → play ZANGIEF → play KEN again
    const initial = parseCharacterLeagueData(
      makeNextDataHtml([
        { char: "KEN", lp: 22620, mr: 0 },
        { char: "ZANGIEF", lp: 17838, mr: 0 },
      ]),
    );

    // After KEN win
    const snap2 = parseCharacterLeagueData(
      makeNextDataHtml([
        { char: "KEN", lp: 22800, mr: 0 },
        { char: "ZANGIEF", lp: 17838, mr: 0 },
      ]),
    );
    const change1 = detectCharacterChange(initial, snap2);
    expect(change1!.character).toBe("KEN");

    // After ZANGIEF win (compare with snap2, not initial)
    const snap3 = parseCharacterLeagueData(
      makeNextDataHtml([
        { char: "KEN", lp: 22800, mr: 0 },
        { char: "ZANGIEF", lp: 18100, mr: 0 },
      ]),
    );
    const change2 = detectCharacterChange(snap2, snap3);
    expect(change2!.character).toBe("ZANGIEF");

    // Cumulative deltas from initial
    const kenDelta = snap3.find((c) => c.character === "KEN")!.leaguePoint - initial.find((c) => c.character === "KEN")!.leaguePoint;
    const zangiefDelta = snap3.find((c) => c.character === "ZANGIEF")!.leaguePoint - initial.find((c) => c.character === "ZANGIEF")!.leaguePoint;
    expect(kenDelta).toBe(180);
    expect(zangiefDelta).toBe(262);
  });

  it("after switching back to KEN, initial delta is still from session start", () => {
    const initial = parseCharacterLeagueData(
      makeNextDataHtml([{ char: "KEN", lp: 22620, mr: 0 }]),
    );
    // KEN wins, then loses
    const afterWin = parseCharacterLeagueData(
      makeNextDataHtml([{ char: "KEN", lp: 22800, mr: 0 }]),
    );
    const afterLoss = parseCharacterLeagueData(
      makeNextDataHtml([{ char: "KEN", lp: 22600, mr: 0 }]),
    );

    // Delta from initial, not from previous
    const totalDelta = afterLoss[0].leaguePoint - initial[0].leaguePoint;
    expect(totalDelta).toBe(-20);
  });
});

// ============================================================
// Integration: Full session flow
// ============================================================

describe("Integration: full session flow", () => {
  it("simulates a complete tracking session", () => {
    // Step 1: First play page load → initialize
    const playHtml1 = makeNextDataHtml([
      { char: "KEN", lp: 22620, mr: 0 },
      { char: "ZANGIEF", lp: 17838, mr: 0 },
      { char: "RYU", lp: -1, mr: 0 },
    ]);
    const initialData = parseCharacterLeagueData(playHtml1);
    const defaultChar = pickDefaultCharacter(initialData);
    expect(defaultChar!.character).toBe("KEN");

    let previousData = initialData;
    let wins = 0;
    let losses = 0;

    // Step 2: First battlelog → set baseline
    const battlelog1 = [
      makeEntry({ date: "d1", player1_result: "WIN" }),
    ];
    const baselineDate = battlelog1[0].date;

    // Step 3: User wins a game with KEN
    const battlelog2 = [
      makeEntry({ date: "d2", player1_result: "WIN" }),
      ...battlelog1,
    ];
    const r1 = processNewEntries(battlelog2, baselineDate, "Player1");
    wins += r1.newWins;
    losses += r1.newLosses;
    expect(wins).toBe(1);

    // Step 4: Play page updates — KEN LP went up
    const playHtml2 = makeNextDataHtml([
      { char: "KEN", lp: 22800, mr: 0 },
      { char: "ZANGIEF", lp: 17838, mr: 0 },
      { char: "RYU", lp: -1, mr: 0 },
    ]);
    const currentData2 = parseCharacterLeagueData(playHtml2);
    const change2 = detectCharacterChange(previousData, currentData2);
    expect(change2!.character).toBe("KEN");
    expect(change2!.currentLP).toBe(22800);
    previousData = currentData2;

    // Delta from initial
    const kenInitialLP = initialData.find((c) => c.character === "KEN")!.leaguePoint;
    expect(change2!.currentLP - kenInitialLP).toBe(180);

    // Step 5: User loses a game
    const battlelog3 = [
      makeEntry({ date: "d3", player1_result: "LOSE" }),
      ...battlelog2,
    ];
    const r2 = processNewEntries(battlelog3, r1.newEntries[0].date, "Player1");
    wins += r2.newWins;
    losses += r2.newLosses;
    expect(wins).toBe(1);
    expect(losses).toBe(1);
    expect(calcWinRate(wins, losses)).toBe(50);

    // Step 6: Play page — KEN LP went down
    const playHtml3 = makeNextDataHtml([
      { char: "KEN", lp: 22600, mr: 0 },
      { char: "ZANGIEF", lp: 17838, mr: 0 },
      { char: "RYU", lp: -1, mr: 0 },
    ]);
    const currentData3 = parseCharacterLeagueData(playHtml3);
    const change3 = detectCharacterChange(previousData, currentData3);
    expect(change3!.character).toBe("KEN");
    expect(change3!.currentLP - kenInitialLP).toBe(-20);
    previousData = currentData3;

    // Step 7: User switches to ZANGIEF and wins
    const playHtml4 = makeNextDataHtml([
      { char: "KEN", lp: 22600, mr: 0 },
      { char: "ZANGIEF", lp: 18100, mr: 0 },
      { char: "RYU", lp: -1, mr: 0 },
    ]);
    const currentData4 = parseCharacterLeagueData(playHtml4);
    const change4 = detectCharacterChange(previousData, currentData4);
    expect(change4!.character).toBe("ZANGIEF");
    expect(change4!.currentLP).toBe(18100);

    const zangiefInitialLP = initialData.find((c) => c.character === "ZANGIEF")!.leaguePoint;
    expect(change4!.currentLP - zangiefInitialLP).toBe(262);
  });
});
