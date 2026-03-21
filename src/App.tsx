import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "./App.css";

type MatchData = {
  currentMR: number;
  sessionChange: number;
  lastDelta: number;
  wins: number;
  losses: number;
};

type BattleRecord = {
  result: "win" | "loss";
  mrChange: number;
  playerCharacter: string;
  opponentCharacter: string;
  timestamp: string;
};

// 动画滚动数字组件
function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    let start = displayValue;
    const end = value;
    if (start === end) return;

    const duration = 500;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easing = progress === 1 ? 1 : 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(start + (end - start) * easing));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span>{displayValue}</span>;
}

function App() {
  const [cfnId, setCfnId] = useState(() => localStorage.getItem("sf6_cfn_id") || "");
  const [isPolling, setIsPolling] = useState(() => !!localStorage.getItem("sf6_cfn_id"));
  const [status, setStatus] = useState("Idle");
  const [stats, setStats] = useState<MatchData>({ currentMR: 0, sessionChange: 0, lastDelta: 0, wins: 0, losses: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [scoreType, setScoreType] = useState<"MR" | "LP">("MR");
  const [battleHistory, setBattleHistory] = useState<BattleRecord[]>([]);
  const [alwaysOnTop] = useState(() => localStorage.getItem("sf6_top") === "true");
  const [loginStatus, setLoginStatus] = useState<"idle" | "logging_in" | "logged_in">("idle");

  // Track initial MR for session change calculation
  const initialMR = useRef<number | null>(null);
  const lastMR = useRef<number | null>(null);
  const baselineReplayId = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem("sf6_top", alwaysOnTop ? "true" : "false");
    getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  // Listen for auto-detected User Code from login window
  useEffect(() => {
    const unlisten = listen<string>("cfn_user_code_detected", (event) => {
      const detectedCode = event.payload;
      console.log("Auto-detected User Code:", detectedCode);
      if (detectedCode) {
        setCfnId(detectedCode);
        localStorage.setItem("sf6_cfn_id", detectedCode);
        setLoginStatus("logged_in");
        setStatus("✅ User Code detected: " + detectedCode);
        setIsPolling(true); // Automatically start tracking!
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [cfnId]);

  // Listen for buckler data
  useEffect(() => {
    const unlisten = listen<string>("buckler_data_received", (event) => {
      try {
        const payload = JSON.parse(event.payload);
        console.log("Received buckler data:", payload);

        if (payload.error) {
          console.warn("Data fetch error:", payload.error, payload.raw);
          setStatus("⚠️ Failed to fetch data, retrying...");
          return;
        }

        // Try to extract profile data (from profile endpoint)
        if (payload.fighter_banner_info) {
          const leagueInfo = payload.fighter_banner_info?.league_info;
          if (leagueInfo) {
            const mr = leagueInfo.master_rating ?? 0;
            const lp = leagueInfo.league_point ?? 0;
            const currentScore = scoreType === "MR" ? mr : lp;

            const oldScore = lastMR.current;
            lastMR.current = currentScore;
            
            if (initialMR.current === null) {
              initialMR.current = currentScore;
            }

            let newLastDelta = 0;
            if (oldScore !== null && currentScore !== oldScore) {
               newLastDelta = currentScore - oldScore;
            }

            setStats(prev => ({
              ...prev,
              currentMR: currentScore,
              sessionChange: currentScore - (initialMR.current ?? currentScore),
              lastDelta: newLastDelta !== 0 ? newLastDelta : prev.lastDelta
            }));

            // Attach the MR change to the absolutely newest battle record if there's a change
            if (newLastDelta !== 0) {
               setBattleHistory(prevHistory => {
                  if (prevHistory.length > 0 && prevHistory[0].mrChange === 0) {
                      const newList = [...prevHistory];
                      newList[0] = { ...newList[0], mrChange: newLastDelta };
                      return newList;
                  }
                  return prevHistory;
               });
            }

            setStatus("✅ Profile data updated!");
          }
        }

        // Try to extract battlelog data (from battlelog page)
        // The buckler battlelog page embeds data as a Next.js __NEXT_DATA__ script
        // Or it might be returned as API JSON - handle both cases
        if (payload.replay_list || payload.data?.replay_list) {
          const replays = payload.replay_list || payload.data?.replay_list;
          parseBattleLog(replays);
        }

      } catch (err) {
        console.error("Failed to parse buckler data:", err);
        setStatus("⚠️ Parse error, retrying...");
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [scoreType]);

  const parseBattleLog = (replays: any[]) => {
    if (!replays || !Array.isArray(replays) || replays.length === 0) return;

    if (baselineReplayId.current === null) {
      baselineReplayId.current = replays[0].replay_id || replays[0].uploaded_at;
      setStatus(`✅ Baseline set. Waiting for new matches...`);
      return; 
    }

    let newWins = 0;
    let newLosses = 0;
    const newRecords: BattleRecord[] = [];

    for (const replay of replays) {
      const id = replay.replay_id || replay.uploaded_at;
      if (id === baselineReplayId.current) {
        break; // reached the previously parsed matches
      }

      try {
        const player1 = replay.player1_info || replay.replay_battle_type_info?.player1;
        const player2 = replay.player2_info || replay.replay_battle_type_info?.player2;

        const isPlayer1 = String(player1?.player?.short_id) === cfnId ||
          String(player1?.player?.fighter_id) === cfnId;

        const myInfo = isPlayer1 ? player1 : player2;
        const opponentInfo = isPlayer1 ? player2 : player1;

        const didWin = replay.player1_round_results && replay.player2_round_results
          ? (isPlayer1 ? replay.player1_round_results > replay.player2_round_results : replay.player2_round_results > replay.player1_round_results)
          : (myInfo?.round_win ?? 0) > (opponentInfo?.round_win ?? 0);

        if (didWin) newWins++;
        else newLosses++;

        newRecords.push({
          result: didWin ? "win" : "loss",
          mrChange: 0, // Will be updated by profile fetch if it triggers
          playerCharacter: myInfo?.character_name || `Char ${myInfo?.character_id || "?"}`,
          opponentCharacter: opponentInfo?.character_name || `Char ${opponentInfo?.character_id || "?"}`,
          timestamp: id,
        });
      } catch (e) {
        console.warn("Failed to parse replay:", e, replay);
      }
    }

    if (newRecords.length > 0) {
      baselineReplayId.current = newRecords[0].timestamp; // new latest
      setStats(prev => ({ ...prev, wins: prev.wins + newWins, losses: prev.losses + newLosses }));
      setBattleHistory(prev => [...newRecords, ...prev]);
      setStatus(`✅ Found ${newRecords.length} new battles!`);
    }
  };

  // Poller - fetch both profile and battlelog
  useEffect(() => {
    if (!isPolling || !cfnId) return;

    localStorage.setItem("sf6_cfn_id", cfnId);
    getCurrentWindow().setSize(new LogicalSize(475, 175)).catch(console.error);

    const fetchData = () => {
      setStatus("📡 Fetching data...");

      // Fetch profile data for MR/LP
      invoke("fetch_buckler_data", {
        endpoint: `https://www.streetfighter.com/6/buckler/api/v1/profile/${cfnId}`
      }).catch(err => console.error("Profile fetch failed:", err));

      // Fetch battlelog data for win/loss records
      // Scraping the exact HTML page the user sees, extracting the __NEXT_DATA__ embedded script
      invoke("fetch_buckler_data", {
        endpoint: `https://www.streetfighter.com/6/buckler/profile/${cfnId}/battlelog`
      }).catch(err => console.error("Battlelog fetch failed:", err));
    };

    // Initial fetch
    fetchData();

    // Poll every 15 seconds
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isPolling, cfnId]);

  const handleLogin = () => {
    invoke("open_login_window");
    setLoginStatus("logging_in");
    setStatus("🔐 Please login in the popup window...");
  };

  const winRate = stats.wins + stats.losses > 0
    ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
    : 0;

  return (
    <>
      {/* 隐形拖动层 */}
      <div className="drag-region" data-tauri-drag-region></div>

      <div className="container">
        <div className="top-bar">
          <div className="top-bar-left">
            {isPolling && (
              <div className="stats-top-row">
                <span className="stat-item">Total: {stats.wins + stats.losses}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">W: {stats.wins}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">L: {stats.losses}</span>
                <span className="stat-separator">|</span>
                <span className="stat-item">WR: {winRate}%</span>
              </div>
            )}
          </div>
          <div className="top-bar-right">
            <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
              ⚙️
            </button>
            <button className="btn-icon" onClick={() => getCurrentWindow().close()} title="Exit">
              ✕
            </button>
          </div>
          {showSettings && (
            <div className="settings-menu">
              <button
                className="btn-primary menu-btn"
                onClick={() => {
                  const newType = scoreType === "MR" ? "LP" : "MR";
                  setScoreType(newType);
                  initialMR.current = null;
                  lastMR.current = null;
                  setShowSettings(false);
                }}
              >
                Switch to {scoreType === "MR" ? "LP" : "MR"} Mode
              </button>

              {isPolling && (
                <>
                  <button className="btn-primary menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                    setStats({ currentMR: 0, sessionChange: 0, lastDelta: 0, wins: 0, losses: 0 });
                    setBattleHistory([]);
                    initialMR.current = null;
                    lastMR.current = null;
                    baselineReplayId.current = null;
                    setShowSettings(false);
                    setStatus("🔄 Session reset. Waiting for new matches...");
                  }}>Reset Session</button>
                  <button className="btn-danger menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                    setIsPolling(false);
                    setShowSettings(false);
                    initialMR.current = null;
                    lastMR.current = null;
                    baselineReplayId.current = null;
                    setStatus("Stopped tracking.");
                  }}>Stop Tracking</button>
                  {import.meta.env.DEV && (
                    <>
                      <button className="btn-mock menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        const defaultScore = scoreType === "MR" ? 1500 : 25000;
                        setStats(prev => ({ ...prev, currentMR: defaultScore, sessionChange: 0 }));
                        initialMR.current = defaultScore;
                        lastMR.current = defaultScore;
                        setShowSettings(false);
                      }}>Set Default Score ({scoreType === "MR" ? "1500" : "25000"})</button>
                      <button className="btn-success menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        const delta = Math.floor(Math.random() * 30) + 20;
                        setStats(prev => ({ ...prev, wins: prev.wins + 1, currentMR: prev.currentMR + delta, lastDelta: delta, sessionChange: prev.sessionChange + delta }));
                        setShowSettings(false);
                      }}>Mock Win</button>
                      <button className="btn-danger menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                        const delta = -(Math.floor(Math.random() * 30) + 20);
                        setStats(prev => ({ ...prev, losses: prev.losses + 1, currentMR: prev.currentMR + delta, lastDelta: delta, sessionChange: prev.sessionChange + delta }));
                        setShowSettings(false);
                      }}>Mock Loss</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {!isPolling ? (
          <div className="setup-section">
            <h1 className="title">SF6Detector Setup</h1>
            <button className="btn-primary" onClick={handleLogin}>
              {loginStatus === "logged_in" ? "✅ Logged In" : "1. Login to CFN"}
            </button>
            <div className="input-group">
              <input
                type="text"
                placeholder="Enter CFN User Code"
                value={cfnId}
                onChange={(e) => setCfnId(e.target.value)}
                className="input-cfn"
              />
              <button
                className="btn-success"
                onClick={() => setIsPolling(true)}
                disabled={!cfnId}
              >
                2. Start Tracking
              </button>
            </div>
            <p className="status-text">{status}</p>
          </div>
        ) : (
          <div className="dashboard">
            <div className="score-main">
              <div className="mr-value">
                <AnimatedNumber value={stats.currentMR} />
                <span style={{ fontSize: "min(16vh, 5vw)", color: "var(--text-muted)", marginLeft: "0.5vw" }}>{scoreType}</span>
              </div>
              <div className={`mr-change ${stats.sessionChange >= 0 ? 'positive' : 'negative'}`}>
                {stats.sessionChange >= 0 ? "+" : ""}
                <AnimatedNumber value={stats.sessionChange} />
              </div>
            </div>

          </div>
        )}
      </div>
    </>
  );
}

export default App;
