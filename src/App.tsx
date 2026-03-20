import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type MatchData = {
  currentMR: number;
  sessionChange: number;
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
  const [isPolling, setIsPolling] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [stats, setStats] = useState<MatchData>({ currentMR: 0, sessionChange: 0, wins: 0, losses: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [scoreType, setScoreType] = useState<"MR" | "LP">("MR");
  const [battleHistory, setBattleHistory] = useState<BattleRecord[]>([]);
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => localStorage.getItem("sf6_top") === "true");
  const [loginStatus, setLoginStatus] = useState<"idle" | "logging_in" | "logged_in">("idle");

  // Track initial MR for session change calculation
  const initialMR = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem("sf6_top", alwaysOnTop ? "true" : "false");
    getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  // Listen for auto-detected User Code from login window
  useEffect(() => {
    const unlisten = listen<string>("cfn_user_code_detected", (event) => {
      const detectedCode = event.payload;
      console.log("Auto-detected User Code:", detectedCode);
      if (detectedCode && detectedCode !== cfnId) {
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

            if (initialMR.current === null) {
              initialMR.current = currentScore;
            }

            setStats(prev => ({
              ...prev,
              currentMR: currentScore,
              sessionChange: currentScore - (initialMR.current ?? currentScore),
            }));
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
    if (!replays || !Array.isArray(replays)) return;

    let wins = 0;
    let losses = 0;
    const records: BattleRecord[] = [];

    for (const replay of replays) {
      try {
        // Typical Buckler battlelog replay structure
        const player1 = replay.player1_info || replay.replay_battle_type_info?.player1;
        const player2 = replay.player2_info || replay.replay_battle_type_info?.player2;

        // Determine which player is us based on the short_id
        const isPlayer1 = String(player1?.player?.short_id) === cfnId ||
          String(player1?.player?.fighter_id) === cfnId;

        const myInfo = isPlayer1 ? player1 : player2;
        const opponentInfo = isPlayer1 ? player2 : player1;

        const didWin = replay.player1_round_results && replay.player2_round_results
          ? (isPlayer1 ? replay.player1_round_results > replay.player2_round_results : replay.player2_round_results > replay.player1_round_results)
          : (myInfo?.round_win ?? 0) > (opponentInfo?.round_win ?? 0);

        if (didWin) wins++;
        else losses++;

        records.push({
          result: didWin ? "win" : "loss",
          mrChange: 0, // Will be calculated if data available
          playerCharacter: myInfo?.character_name || `Char ${myInfo?.character_id || "?"}`,
          opponentCharacter: opponentInfo?.character_name || `Char ${opponentInfo?.character_id || "?"}`,
          timestamp: replay.uploaded_at || replay.replay_id || "",
        });
      } catch (e) {
        console.warn("Failed to parse replay:", e, replay);
      }
    }

    setStats(prev => ({ ...prev, wins, losses }));
    setBattleHistory(records);
    setStatus(`✅ Found ${records.length} battles (W:${wins} / L:${losses})`);
  };

  // Poller - fetch both profile and battlelog
  useEffect(() => {
    if (!isPolling || !cfnId) return;

    localStorage.setItem("sf6_cfn_id", cfnId);

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

    // Poll every 2 minutes
    const interval = setInterval(fetchData, 120000);
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
        {/* Settings button */}
        <div className="settings-container" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
            ⚙️
          </button>
          {showSettings && (
            <div className="settings-menu">
              <button
                className="btn-primary menu-btn"
                onClick={() => {
                  const newType = scoreType === "MR" ? "LP" : "MR";
                  setScoreType(newType);
                  initialMR.current = null; // Reset session tracking
                  setShowSettings(false);
                }}
              >
                Switch to {scoreType === "MR" ? "LP" : "MR"} Mode
              </button>

              <button
                className="btn-mock menu-btn"
                onClick={() => setAlwaysOnTop(!alwaysOnTop)}
              >
                {alwaysOnTop ? "☑️ Always On Top" : "☐ Always On Top"}
              </button>

              {isPolling && (
                <button className="btn-danger menu-btn" style={{ marginTop: "5px" }} onClick={() => {
                  setIsPolling(false);
                  setShowSettings(false);
                  initialMR.current = null;
                  setStatus("Stopped tracking.");
                }}>Stop Tracking</button>
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
            <div className="stats-top-row">
              <span className="stat-item">Total: {stats.wins + stats.losses}</span>
              <span className="stat-separator">|</span>
              <span className="stat-item">W: {stats.wins}</span>
              <span className="stat-separator">|</span>
              <span className="stat-item">L: {stats.losses}</span>
              <span className="stat-separator">|</span>
              <span className="stat-item">WR: {winRate}%</span>
            </div>

            <div className="score-main">
              <div className="mr-value">
                <AnimatedNumber value={stats.currentMR} />
                <span style={{ fontSize: "1rem", color: "var(--text-muted)", marginLeft: "8px" }}>{scoreType}</span>
              </div>
              <div className={`mr-change ${stats.sessionChange >= 0 ? 'positive' : 'negative'}`}>
                {stats.sessionChange >= 0 ? "+" : ""}
                <AnimatedNumber value={stats.sessionChange} />
              </div>
            </div>

            {battleHistory.length > 0 && (
              <div className="battle-history" style={{ width: '100%', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                  {battleHistory.slice(0, 50).map((record, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      borderLeft: `4px solid ${record.result === 'win' ? 'var(--success)' : 'var(--danger)'}`,
                      fontSize: '0.9rem'
                    }}>
                      <span style={{ color: record.result === 'win' ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold', width: '20px' }}>
                        {record.result === 'win' ? 'W' : 'L'}
                      </span>
                      <span style={{ color: 'var(--text-main)', flex: 1, textAlign: 'center' }}>
                        {record.playerCharacter} vs {record.opponentCharacter}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="status-text" style={{ marginTop: '10px' }}>{status}</p>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
