use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Emitter};
use std::sync::atomic::{AtomicUsize, Ordering};
use regex::Regex;

static FETCHER_ID: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
enum ScoreType {
    LP,
    MR,
    Unknown,
}

#[derive(Debug, serde::Serialize)]
struct BattleEntry {
    date: String,
    player1_name: String,
    player1_result: String,
    player1_rank: String,
    player1_control: String,
    player1_score_type: ScoreType,
    player1_score: i32,
    player2_name: String,
    player2_result: String,
    player2_rank: String,
    player2_control: String,
    player2_score_type: ScoreType,
    player2_score: i32,
}

fn parse_score(raw: &str) -> (ScoreType, i32) {
    let trimmed = raw.trim();
    if trimmed.ends_with("LP") {
        let num_str: String = trimmed.chars().take_while(|c| c.is_ascii_digit() || *c == ' ').collect();
        let value = num_str.trim().parse::<i32>().unwrap_or(0);
        (ScoreType::LP, value)
    } else if trimmed.ends_with("MR") {
        let num_str: String = trimmed.chars().take_while(|c| c.is_ascii_digit() || *c == ' ').collect();
        let value = num_str.trim().parse::<i32>().unwrap_or(0);
        (ScoreType::MR, value)
    } else {
        let value = trimmed.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse::<i32>().unwrap_or(0);
        (ScoreType::Unknown, value)
    }
}

fn rank_number_to_name(n: u32) -> String {
    match n {
        1 => "Rookie 1".into(),
        2 => "Rookie 2".into(),
        3 => "Rookie 3".into(),
        4 => "Iron 1".into(),
        5 => "Iron 2".into(),
        6 => "Iron 3".into(),
        7 => "Bronze 1".into(),
        8 => "Bronze 2".into(),
        9 => "Bronze 3".into(),
        10 => "Silver 1".into(),
        11 => "Silver 2".into(),
        12 => "Silver 3".into(),
        13 => "Gold 1".into(),
        14 => "Gold 2".into(),
        15 => "Gold 3".into(),
        16 => "Platinum 1".into(),
        17 => "Platinum 2".into(),
        18 => "Platinum 3".into(),
        19 => "Diamond 1".into(),
        20 => "Diamond 2".into(),
        21 => "Diamond 3".into(),
        22 => "Diamond 4".into(),
        23 => "Diamond 5".into(),
        24 => "Master".into(),
        25 => "Master".into(),
        26 => "Master".into(),
        27 => "Master".into(),
        28 => "Master".into(),
        29 => "Legend".into(),
        _ => format!("Unknown({})", n),
    }
}

fn control_type_name(n: u32) -> &'static str {
    match n {
        0 => "Classic",
        1 => "Modern",
        2 => "Dynamic",
        _ => "Unknown",
    }
}

fn parse_username(html: &str) -> Option<String> {
    let re = Regex::new(r#"(?s)status_personal__\w+.*?status_name__\w+"[^>]*>([^<]+)<"#).unwrap();
    re.captures(html).map(|c| c[1].trim().to_string())
}

fn parse_battle_data(html: &str) -> Vec<BattleEntry> {
    let mut entries = Vec::new();

    // Split by each battle log entry: <li data-index="N">
    let re_entry = Regex::new(r#"<li data-index="\d+">"#).unwrap();
    let entry_positions: Vec<usize> = re_entry.find_iter(html).map(|m| m.start()).collect();

    let re_name_p1 = Regex::new(r#"battle_data_name_p1__\w+[^>]*>.*?battle_data_name__\w+"[^>]*>([^<]+)<"#).unwrap();
    let re_name_p2 = Regex::new(r#"battle_data_name_p2__\w+[^>]*>.*?battle_data_name__\w+"[^>]*>([^<]+)<"#).unwrap();
    let re_date = Regex::new(r#"battle_data_date__\w+"[^>]*>([^<]+)<"#).unwrap();
    let re_p1_div = Regex::new(r#"battle_data_player1__\w+\s+(battle_data_(win|lose)__\w+)"#).unwrap();
    let re_p2_div = Regex::new(r#"battle_data_player2__\w+\s+(battle_data_(win|lose)__\w+)"#).unwrap();
    let re_rank = Regex::new(r#"rank/rank(\d+)_s\.png"#).unwrap();
    let re_control = Regex::new(r#"icon_controltype(\d+)\.png"#).unwrap();
    let re_lp = Regex::new(r#"battle_data_lp__\w+"[^>]*>([^<]+)<"#).unwrap();

    for (i, &start) in entry_positions.iter().enumerate() {
        let end = if i + 1 < entry_positions.len() {
            entry_positions[i + 1]
        } else {
            html.len()
        };
        let block = &html[start..end];

        let date = re_date.find_iter(block).next()
            .and_then(|_| re_date.captures(block))
            .map(|c| c[1].trim().to_string())
            .unwrap_or_default();

        let p1_name = re_name_p1.captures(block)
            .map(|c| c[1].trim().to_string())
            .unwrap_or_default();

        let p2_name = re_name_p2.captures(block)
            .map(|c| c[1].trim().to_string())
            .unwrap_or_default();

        let p1_result = re_p1_div.captures(block)
            .map(|c| if &c[2] == "win" { "WIN" } else { "LOSE" }.to_string())
            .unwrap_or_default();

        let p2_result = re_p2_div.captures(block)
            .map(|c| if &c[2] == "win" { "WIN" } else { "LOSE" }.to_string())
            .unwrap_or_default();

        let ranks: Vec<String> = re_rank.captures_iter(block)
            .map(|c| rank_number_to_name(c[1].parse().unwrap_or(0)))
            .collect();

        let controls: Vec<String> = re_control.captures_iter(block)
            .map(|c| control_type_name(c[1].parse().unwrap_or(99)).to_string())
            .collect();

        let scores: Vec<(ScoreType, i32)> = re_lp.captures_iter(block)
            .map(|c| parse_score(c[1].trim()))
            .collect();

        let (p1_score_type, p1_score) = scores.first().cloned().unwrap_or((ScoreType::Unknown, 0));
        let (p2_score_type, p2_score) = scores.get(1).cloned().unwrap_or((ScoreType::Unknown, 0));

        entries.push(BattleEntry {
            date,
            player1_name: p1_name,
            player1_result: p1_result,
            player1_rank: ranks.first().cloned().unwrap_or_default(),
            player1_control: controls.first().cloned().unwrap_or_default(),
            player1_score_type: p1_score_type,
            player1_score: p1_score,
            player2_name: p2_name,
            player2_result: p2_result,
            player2_rank: ranks.get(1).cloned().unwrap_or_default(),
            player2_control: controls.get(1).cloned().unwrap_or_default(),
            player2_score_type: p2_score_type,
            player2_score: p2_score,
        });
    }

    entries
}

#[tauri::command]
fn parse_battle_html(html: String) -> Vec<BattleEntry> {
    let entries = parse_battle_data(&html);
    for (i, e) in entries.iter().enumerate() {
        println!("--- Battle {} ---", i + 1);
        println!("  Date: {}", e.date);
        println!("  P1: {} | {} | {} | {} | {:?} {}", e.player1_name, e.player1_result, e.player1_rank, e.player1_control, e.player1_score_type, e.player1_score);
        println!("  P2: {} | {} | {} | {} | {:?} {}", e.player2_name, e.player2_result, e.player2_rank, e.player2_control, e.player2_score_type, e.player2_score);
    }
    entries
}

#[derive(Debug, serde::Serialize)]
struct BattlelogUpdate {
    username: Option<String>,
    entries: Vec<BattleEntry>,
}

fn try_parse_battle_page(payload: &str) -> Option<BattlelogUpdate> {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) {
        if let Some(html) = json.get("html").and_then(|v| v.as_str()) {
            let username = parse_username(html);
            let entries = parse_battle_data(html);
            if !entries.is_empty() || username.is_some() {
                println!("=== Parsed {} battle entries, username: {:?} ===", entries.len(), username);
                for (i, e) in entries.iter().enumerate() {
                    println!("  Battle {}: {} | {} ({} {:?} {}) vs {} ({} {:?} {})",
                        i + 1, e.date,
                        e.player1_name, e.player1_result, e.player1_score_type, e.player1_score,
                        e.player2_name, e.player2_result, e.player2_score_type, e.player2_score,
                    );
                }
                println!("================================");
                return Some(BattlelogUpdate { username, entries });
            }
        }
    }
    None
}

#[tauri::command]
async fn open_login_window(app: AppHandle) -> Result<(), String> {
    // Attempt to get existing to avoid duplicates
    if let Some(win) = app.get_webview_window("login") {
        let _ = win.set_focus();
        return Ok(());
    }

    let app_clone = app.clone();
    // Cell<bool> gives interior mutability inside a Fn (non-mut) closure
    let announced = std::cell::Cell::new(false);

    let init_script = r#"
        window.addEventListener('DOMContentLoaded', function() {
            setInterval(function() {
                var links = document.querySelectorAll('a[href^="/6/buckler/profile/"], a[href^="https://www.streetfighter.com/6/buckler/profile/"]');
                for (var i = 0; i < links.length; i++) {
                    var href = links[i].getAttribute('href') || '';
                    var match = href.match(/\/6\/buckler\/profile\/(\d+)/);
                    if (match && match[1] && match[1].length > 5) {
                        var code = match[1];
                        if (!window.__sf6_code_sent) {
                            window.__sf6_code_sent = true;
                            // Fake navigation intercepted by Rust to avoid cross-origin protocol blocks
                            window.location.replace("https://www.streetfighter.com/6/buckler/__tauri_intercept/usercode?code=" + code);
                        }
                        break;
                    }
                }
            }, 1000);
        });
    "#;

    WebviewWindowBuilder::new(
        &app,
        "login",
        WebviewUrl::External("https://www.streetfighter.com/6/buckler/en/auth/loginep?redirect_url=/".parse().unwrap())
    )
    .title("Login to CFN / Buckler")
    .inner_size(1000.0, 700.0)
    .initialization_script(init_script)
    // Monitor every URL change in Rust — bypasses the site's CSP entirely
    .on_navigation(move |url| {
        if announced.get() {
            return true; // already reported, allow all navigation
        }
        let url_str = url.to_string();
        
        let mut found_code = None;

        // Directly via auth redirect or user clicking profile
        if let Some(start) = url_str.find("/buckler/profile/") {
            let rest = &url_str[start + "/buckler/profile/".len()..];
            let code: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if !code.is_empty() {
                found_code = Some(code);
            }
        } 
        // Via our injected script detection
        else if let Some(start) = url_str.find("__tauri_intercept/usercode?code=") {
            let rest = &url_str[start + "__tauri_intercept/usercode?code=".len()..];
            let code: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
            if !code.is_empty() {
                found_code = Some(code);
            }
        }

        if let Some(code) = found_code {
            announced.set(true);
            let _ = app_clone.emit("cfn_user_code_detected", code);
            if let Some(win) = app_clone.get_webview_window("login") {
                let _ = win.destroy();
            }
            return false; // prevent the actual navigation to the fake URL
        }

        true // always allow the navigation to proceed
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn fetch_buckler_data(app: AppHandle, endpoint: String) -> Result<(), String> {
    let id = FETCHER_ID.fetch_add(1, Ordering::SeqCst);
    let label = format!("data_fetcher_{}", id);

    // Script that reads the page content after load and sends to custom URI
    // Navigate away to sf6data://payload=... which Rust intercepts
    let init_script = format!(r#"
        window.addEventListener('DOMContentLoaded', function() {{
            setTimeout(function() {{
                try {{
                    var data;
                    var text = document.body.innerText || document.body.textContent;
                    try {{
                        data = JSON.parse(text);
                    }} catch(e) {{
                        data = {{ html: document.documentElement.outerHTML }};
                    }}
                    
                    var jsonStr = JSON.stringify(data);
                    var url = "https://www.streetfighter.com/6/buckler/__tauri_intercept/data?label={}&payload=" + encodeURIComponent(jsonStr);
                    window.location.replace(url);
                }} catch(e) {{
                    var errStr = JSON.stringify({{ error: 'Failed to parse', raw: e.toString() }});
                    window.location.replace("https://www.streetfighter.com/6/buckler/__tauri_intercept/data?label={}&payload=" + encodeURIComponent(errStr));
                }}
            }}, 3000);
        }});
    "#, label, label);

    WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::External(endpoint.parse().unwrap())
    )
    .visible(false)
    .initialization_script(&init_script)
    .on_navigation({
        let app_clone = app.clone();
        let label_clone = label.clone();
        move |url| {
            let url_str = url.to_string();
            if let Some(start) = url_str.find("__tauri_intercept/data?") {
                let query = &url_str[start + "__tauri_intercept/data?".len()..];
                let mut payload_opt = None;
                
                for part in query.split('&') {
                    if part.starts_with("payload=") {
                        payload_opt = Some(&part["payload=".len()..]);
                    }
                }

                if let Some(payload_encoded) = payload_opt {
                    if let Ok(decoded) = urlencoding::decode(payload_encoded) {
                        if let Some(update) = try_parse_battle_page(&decoded) {
                            let _ = app_clone.emit("battlelog_update", &update);
                        }
                        let _ = app_clone.emit("buckler_data_received", decoded.to_string());

                        if let Some(win) = app_clone.get_webview_window(&label_clone) {
                            let _ = win.destroy();
                        }
                    }
                }
                return false; // prevent the navigation
            }
            true
        }
    })
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![open_login_window, fetch_buckler_data, parse_battle_html])
        .register_uri_scheme_protocol("sf6data", move |ctx, request| {
            if let Some(query) = request.uri().query() {
                // Handling User Code auto detection: sf6data://usercode?code=xxx
                if request.uri().authority().map_or(false, |a| a.as_str() == "usercode") {
                    if let Some(code_str) = query.split('&').find(|p| p.starts_with("code=")) {
                        let code = &code_str["code=".len()..];
                        let _ = ctx.app_handle().emit("cfn_user_code_detected", code.to_string());
                        if let Some(win) = ctx.app_handle().get_webview_window("login") {
                            let _ = win.destroy();
                        }
                    }
                } 
                // Handling JSON Data fetching: sf6data://data?label=xxx&payload=yyy
                else if request.uri().authority().map_or(false, |a| a.as_str() == "data") {
                    let mut label_opt = None;
                    let mut payload_opt = None;
                    
                    for part in query.split('&') {
                        if part.starts_with("label=") {
                            label_opt = Some(&part["label=".len()..]);
                        } else if part.starts_with("payload=") {
                            payload_opt = Some(&part["payload=".len()..]);
                        }
                    }

                    if let (Some(label), Some(payload_encoded)) = (label_opt, payload_opt) {
                        if let Ok(decoded) = urlencoding::decode(payload_encoded) {
                            if let Some(update) = try_parse_battle_page(&decoded) {
                                let _ = ctx.app_handle().emit("battlelog_update", &update);
                            }

                            let _ = ctx.app_handle().emit("buckler_data_received", decoded.to_string());
                            
                            // Close this specific fetcher window since we're done
                            if let Some(win) = ctx.app_handle().get_webview_window(label) {
                                let _ = win.destroy();
                            }
                        }
                    }
                }
            }
            
            // Return empty 200 OK
            tauri::http::Response::builder()
                .status(200)
                .body(Vec::new())
                .unwrap()
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_html() -> &'static str {
        r#"
        <article class="battle_data_battle_data__zKb2c ">
            <div class="battle_data_inner__erFEC">
                <ul class="battle_data_battlelog__list__JNDjG">
                    <li data-index="0">
                        <div class="battle_data_inner_log__p5QL6">
                            <div class="battle_data_name_space__iCss5">
                                <p class="battle_data_name_p1__Ookss"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">Koroちん</span></p>
                                <p class="battle_data_date__f1sP6">03/19/2026 21:33</p>
                                <p class="battle_data_name_p2__ua7Oo"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">cai10</span></p>
                            </div>
                            <div class="battle_data_player1__MIpvf battle_data_win__8Y4Me">
                                <ul>
                                    <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype0.png"></li>
                                    <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank27_s.png"></li>
                                    <li class="battle_data_lp__6v5G9">15243 LP</li>
                                </ul>
                            </div>
                            <div class="battle_data_player2__tymNR battle_data_lose__ltUN0">
                                <ul>
                                    <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype1.png"></li>
                                    <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank26_s.png"></li>
                                    <li class="battle_data_lp__6v5G9">15063 LP</li>
                                </ul>
                            </div>
                        </div>
                    </li>
                    <li data-index="1">
                        <div class="battle_data_inner_log__p5QL6">
                            <div class="battle_data_name_space__iCss5">
                                <p class="battle_data_name_p1__Ookss"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">cai10</span></p>
                                <p class="battle_data_date__f1sP6">03/19/2026 21:31</p>
                                <p class="battle_data_name_p2__ua7Oo"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">TestPlayer</span></p>
                            </div>
                            <div class="battle_data_player1__MIpvf battle_data_lose__ltUN0">
                                <ul>
                                    <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype1.png"></li>
                                    <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank24_s.png"></li>
                                    <li class="battle_data_lp__6v5G9">14500 LP</li>
                                </ul>
                            </div>
                            <div class="battle_data_player2__tymNR battle_data_win__8Y4Me">
                                <ul>
                                    <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype0.png"></li>
                                    <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank19_s.png"></li>
                                    <li class="battle_data_lp__6v5G9">12000 LP</li>
                                </ul>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>
        </article>
        "#
    }

    #[test]
    fn test_parse_entry_count() {
        let entries = parse_battle_data(sample_html());
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn test_parse_first_entry() {
        let entries = parse_battle_data(sample_html());
        let e = &entries[0];

        assert_eq!(e.date, "03/19/2026 21:33");
        assert_eq!(e.player1_name, "Koroちん");
        assert_eq!(e.player2_name, "cai10");
        assert_eq!(e.player1_result, "WIN");
        assert_eq!(e.player2_result, "LOSE");
        assert_eq!(e.player1_rank, "Master");
        assert_eq!(e.player2_rank, "Master");
        assert_eq!(e.player1_control, "Classic");
        assert_eq!(e.player2_control, "Modern");
        assert_eq!(e.player1_score_type, ScoreType::LP);
        assert_eq!(e.player1_score, 15243);
        assert_eq!(e.player2_score_type, ScoreType::LP);
        assert_eq!(e.player2_score, 15063);
    }

    #[test]
    fn test_parse_second_entry_reversed_result() {
        let entries = parse_battle_data(sample_html());
        let e = &entries[1];

        assert_eq!(e.date, "03/19/2026 21:31");
        assert_eq!(e.player1_name, "cai10");
        assert_eq!(e.player2_name, "TestPlayer");
        assert_eq!(e.player1_result, "LOSE");
        assert_eq!(e.player2_result, "WIN");
        assert_eq!(e.player1_rank, "Master");
        assert_eq!(e.player2_rank, "Diamond 1");
        assert_eq!(e.player1_control, "Modern");
        assert_eq!(e.player2_control, "Classic");
        assert_eq!(e.player1_score_type, ScoreType::LP);
        assert_eq!(e.player1_score, 14500);
        assert_eq!(e.player2_score_type, ScoreType::LP);
        assert_eq!(e.player2_score, 12000);
    }

    #[test]
    fn test_parse_empty_html() {
        let entries = parse_battle_data("<html><body></body></html>");
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_username() {
        let html = r#"
            <section class="status_personal__JO1zh">
                <ul class="status_personal__info__zU_gn">
                    <li class="status_bbc_title__QLzS6">Brand NewMaster</li>
                    <li class="status_name__gXNo9"><span class="status_platform__Pp1nu"><span></span></span><span class="status_name__gXNo9">cai10</span></li>
                    <li class="status_sid__P91rn">User Code:2123870218</li>
                </ul>
            </section>
        "#;
        assert_eq!(parse_username(html), Some("cai10".to_string()));
    }

    #[test]
    fn test_parse_username_not_found() {
        assert_eq!(parse_username("<html><body></body></html>"), None);
    }

    // ============================================================
    // parse_score tests
    // ============================================================

    #[test]
    fn test_parse_score_lp() {
        let (t, v) = parse_score("15243 LP");
        assert_eq!(t, ScoreType::LP);
        assert_eq!(v, 15243);
    }

    #[test]
    fn test_parse_score_mr() {
        let (t, v) = parse_score("1500 MR");
        assert_eq!(t, ScoreType::MR);
        assert_eq!(v, 1500);
    }

    #[test]
    fn test_parse_score_lp_with_whitespace() {
        let (t, v) = parse_score("  25000 LP  ");
        assert_eq!(t, ScoreType::LP);
        assert_eq!(v, 25000);
    }

    #[test]
    fn test_parse_score_mr_with_whitespace() {
        let (t, v) = parse_score("  1800 MR  ");
        assert_eq!(t, ScoreType::MR);
        assert_eq!(v, 1800);
    }

    #[test]
    fn test_parse_score_zero_lp() {
        let (t, v) = parse_score("0 LP");
        assert_eq!(t, ScoreType::LP);
        assert_eq!(v, 0);
    }

    #[test]
    fn test_parse_score_zero_mr() {
        let (t, v) = parse_score("0 MR");
        assert_eq!(t, ScoreType::MR);
        assert_eq!(v, 0);
    }

    #[test]
    fn test_parse_score_large_lp() {
        let (t, v) = parse_score("99999 LP");
        assert_eq!(t, ScoreType::LP);
        assert_eq!(v, 99999);
    }

    #[test]
    fn test_parse_score_large_mr() {
        let (t, v) = parse_score("2500 MR");
        assert_eq!(t, ScoreType::MR);
        assert_eq!(v, 2500);
    }

    #[test]
    fn test_parse_score_unknown_suffix() {
        let (t, v) = parse_score("500 XP");
        assert_eq!(t, ScoreType::Unknown);
        assert_eq!(v, 500);
    }

    #[test]
    fn test_parse_score_pure_number() {
        let (t, v) = parse_score("12345");
        assert_eq!(t, ScoreType::Unknown);
        assert_eq!(v, 12345);
    }

    #[test]
    fn test_parse_score_empty_string() {
        let (t, v) = parse_score("");
        assert_eq!(t, ScoreType::Unknown);
        assert_eq!(v, 0);
    }

    #[test]
    fn test_parse_score_only_whitespace() {
        let (t, v) = parse_score("   ");
        assert_eq!(t, ScoreType::Unknown);
        assert_eq!(v, 0);
    }

    #[test]
    fn test_parse_score_no_digits() {
        let (t, v) = parse_score("LP");
        assert_eq!(t, ScoreType::LP);
        assert_eq!(v, 0);
    }

    // ============================================================
    // rank_number_to_name tests
    // ============================================================

    #[test]
    fn test_rank_rookie() {
        assert_eq!(rank_number_to_name(1), "Rookie 1");
        assert_eq!(rank_number_to_name(2), "Rookie 2");
        assert_eq!(rank_number_to_name(3), "Rookie 3");
    }

    #[test]
    fn test_rank_iron() {
        assert_eq!(rank_number_to_name(4), "Iron 1");
        assert_eq!(rank_number_to_name(5), "Iron 2");
        assert_eq!(rank_number_to_name(6), "Iron 3");
    }

    #[test]
    fn test_rank_bronze() {
        assert_eq!(rank_number_to_name(7), "Bronze 1");
        assert_eq!(rank_number_to_name(8), "Bronze 2");
        assert_eq!(rank_number_to_name(9), "Bronze 3");
    }

    #[test]
    fn test_rank_silver() {
        assert_eq!(rank_number_to_name(10), "Silver 1");
        assert_eq!(rank_number_to_name(11), "Silver 2");
        assert_eq!(rank_number_to_name(12), "Silver 3");
    }

    #[test]
    fn test_rank_gold() {
        assert_eq!(rank_number_to_name(13), "Gold 1");
        assert_eq!(rank_number_to_name(14), "Gold 2");
        assert_eq!(rank_number_to_name(15), "Gold 3");
    }

    #[test]
    fn test_rank_platinum() {
        assert_eq!(rank_number_to_name(16), "Platinum 1");
        assert_eq!(rank_number_to_name(17), "Platinum 2");
        assert_eq!(rank_number_to_name(18), "Platinum 3");
    }

    #[test]
    fn test_rank_diamond() {
        assert_eq!(rank_number_to_name(19), "Diamond 1");
        assert_eq!(rank_number_to_name(20), "Diamond 2");
        assert_eq!(rank_number_to_name(21), "Diamond 3");
        assert_eq!(rank_number_to_name(22), "Diamond 4");
        assert_eq!(rank_number_to_name(23), "Diamond 5");
    }

    #[test]
    fn test_rank_master() {
        for n in 24..=28 {
            assert_eq!(rank_number_to_name(n), "Master");
        }
    }

    #[test]
    fn test_rank_legend() {
        assert_eq!(rank_number_to_name(29), "Legend");
    }

    #[test]
    fn test_rank_unknown_zero() {
        assert_eq!(rank_number_to_name(0), "Unknown(0)");
    }

    #[test]
    fn test_rank_unknown_high() {
        assert_eq!(rank_number_to_name(30), "Unknown(30)");
        assert_eq!(rank_number_to_name(100), "Unknown(100)");
    }

    // ============================================================
    // control_type_name tests
    // ============================================================

    #[test]
    fn test_control_classic() {
        assert_eq!(control_type_name(0), "Classic");
    }

    #[test]
    fn test_control_modern() {
        assert_eq!(control_type_name(1), "Modern");
    }

    #[test]
    fn test_control_dynamic() {
        assert_eq!(control_type_name(2), "Dynamic");
    }

    #[test]
    fn test_control_unknown() {
        assert_eq!(control_type_name(3), "Unknown");
        assert_eq!(control_type_name(99), "Unknown");
    }

    // ============================================================
    // parse_username additional tests
    // ============================================================

    #[test]
    fn test_parse_username_with_spaces() {
        let html = r#"
            <section class="status_personal__JO1zh">
                <ul class="status_personal__info__zU_gn">
                    <li class="status_name__gXNo9"><span class="status_name__gXNo9">  Player Name  </span></li>
                </ul>
            </section>
        "#;
        assert_eq!(parse_username(html), Some("Player Name".to_string()));
    }

    #[test]
    fn test_parse_username_japanese() {
        let html = r#"
            <section class="status_personal__ABC12">
                <ul>
                    <li class="status_name__XYZ99">テストプレイヤー</li>
                </ul>
            </section>
        "#;
        assert_eq!(parse_username(html), Some("テストプレイヤー".to_string()));
    }

    #[test]
    fn test_parse_username_empty_html() {
        assert_eq!(parse_username(""), None);
    }

    // ============================================================
    // parse_battle_data additional tests
    // ============================================================

    fn sample_mr_html() -> &'static str {
        r#"
        <ul class="battle_data_battlelog__list__JNDjG">
            <li data-index="0">
                <div class="battle_data_inner_log__p5QL6">
                    <div class="battle_data_name_space__iCss5">
                        <p class="battle_data_name_p1__Ookss"><span class="battle_data_name__IPyjF">MRPlayer1</span></p>
                        <p class="battle_data_date__f1sP6">03/20/2026 10:00</p>
                        <p class="battle_data_name_p2__ua7Oo"><span class="battle_data_name__IPyjF">MRPlayer2</span></p>
                    </div>
                    <div class="battle_data_player1__MIpvf battle_data_win__8Y4Me">
                        <ul>
                            <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype0.png"></li>
                            <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank29_s.png"></li>
                            <li class="battle_data_lp__6v5G9">1800 MR</li>
                        </ul>
                    </div>
                    <div class="battle_data_player2__tymNR battle_data_lose__ltUN0">
                        <ul>
                            <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype2.png"></li>
                            <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank29_s.png"></li>
                            <li class="battle_data_lp__6v5G9">1750 MR</li>
                        </ul>
                    </div>
                </div>
            </li>
        </ul>
        "#
    }

    #[test]
    fn test_parse_mr_entry() {
        let entries = parse_battle_data(sample_mr_html());
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(e.player1_name, "MRPlayer1");
        assert_eq!(e.player2_name, "MRPlayer2");
        assert_eq!(e.player1_score_type, ScoreType::MR);
        assert_eq!(e.player1_score, 1800);
        assert_eq!(e.player2_score_type, ScoreType::MR);
        assert_eq!(e.player2_score, 1750);
        assert_eq!(e.player1_result, "WIN");
        assert_eq!(e.player2_result, "LOSE");
        assert_eq!(e.player1_rank, "Legend");
        assert_eq!(e.player2_rank, "Legend");
        assert_eq!(e.player1_control, "Classic");
        assert_eq!(e.player2_control, "Dynamic");
        assert_eq!(e.date, "03/20/2026 10:00");
    }

    #[test]
    fn test_parse_single_entry() {
        let html = r#"
        <ul>
            <li data-index="0">
                <div>
                    <div>
                        <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">Solo</span></p>
                        <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                        <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">Opponent</span></p>
                    </div>
                    <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                        <ul>
                            <li class="battle_data_lp__XYZ">5000 LP</li>
                        </ul>
                    </div>
                    <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                        <ul>
                            <li class="battle_data_lp__XYZ">4000 LP</li>
                        </ul>
                    </div>
                </div>
            </li>
        </ul>
        "#;
        let entries = parse_battle_data(html);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].player1_name, "Solo");
        assert_eq!(entries[0].player2_name, "Opponent");
        assert_eq!(entries[0].player1_score, 5000);
        assert_eq!(entries[0].player2_score, 4000);
    }

    #[test]
    fn test_parse_entry_missing_rank_and_control() {
        let html = r#"
        <ul>
            <li data-index="0">
                <div>
                    <div>
                        <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">P1</span></p>
                        <p class="battle_data_date__f1sP6">02/15/2026 12:00</p>
                        <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">P2</span></p>
                    </div>
                    <div class="battle_data_player1__MIpvf battle_data_lose__ABC">
                        <ul>
                            <li class="battle_data_lp__XYZ">3000 LP</li>
                        </ul>
                    </div>
                    <div class="battle_data_player2__tymNR battle_data_win__DEF">
                        <ul>
                            <li class="battle_data_lp__XYZ">3500 LP</li>
                        </ul>
                    </div>
                </div>
            </li>
        </ul>
        "#;
        let entries = parse_battle_data(html);
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(e.player1_rank, "");
        assert_eq!(e.player2_rank, "");
        assert_eq!(e.player1_control, "");
        assert_eq!(e.player2_control, "");
        assert_eq!(e.player1_result, "LOSE");
        assert_eq!(e.player2_result, "WIN");
    }

    #[test]
    fn test_parse_entry_missing_score() {
        let html = r#"
        <ul>
            <li data-index="0">
                <div>
                    <div>
                        <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">NoScore1</span></p>
                        <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                        <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">NoScore2</span></p>
                    </div>
                    <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                        <ul></ul>
                    </div>
                    <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                        <ul></ul>
                    </div>
                </div>
            </li>
        </ul>
        "#;
        let entries = parse_battle_data(html);
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(e.player1_score_type, ScoreType::Unknown);
        assert_eq!(e.player1_score, 0);
        assert_eq!(e.player2_score_type, ScoreType::Unknown);
        assert_eq!(e.player2_score, 0);
    }

    #[test]
    fn test_parse_entry_missing_names() {
        let html = r#"
        <ul>
            <li data-index="0">
                <div>
                    <div>
                        <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                    </div>
                    <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                        <ul>
                            <li class="battle_data_lp__XYZ">1000 LP</li>
                        </ul>
                    </div>
                    <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                        <ul>
                            <li class="battle_data_lp__XYZ">900 LP</li>
                        </ul>
                    </div>
                </div>
            </li>
        </ul>
        "#;
        let entries = parse_battle_data(html);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].player1_name, "");
        assert_eq!(entries[0].player2_name, "");
    }

    #[test]
    fn test_parse_no_li_entries() {
        let html = r#"<ul class="battle_data_battlelog__list__JNDjG"></ul>"#;
        let entries = parse_battle_data(html);
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_all_rookie_ranks() {
        let html = r#"
        <ul>
            <li data-index="0">
                <div>
                    <div>
                        <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">R1</span></p>
                        <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                        <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">R2</span></p>
                    </div>
                    <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                        <ul>
                            <li><img src="/6/buckler/assets/images/material/rank/rank1_s.png"></li>
                            <li class="battle_data_lp__XYZ">100 LP</li>
                        </ul>
                    </div>
                    <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                        <ul>
                            <li><img src="/6/buckler/assets/images/material/rank/rank3_s.png"></li>
                            <li class="battle_data_lp__XYZ">200 LP</li>
                        </ul>
                    </div>
                </div>
            </li>
        </ul>
        "#;
        let entries = parse_battle_data(html);
        assert_eq!(entries[0].player1_rank, "Rookie 1");
        assert_eq!(entries[0].player2_rank, "Rookie 3");
    }

    // ============================================================
    // try_parse_battle_page tests
    // ============================================================

    #[test]
    fn test_try_parse_battle_page_valid_json_with_entries() {
        let html = sample_html();
        let json = serde_json::json!({ "html": html }).to_string();
        let result = try_parse_battle_page(&json);
        assert!(result.is_some());
        let update = result.unwrap();
        assert_eq!(update.entries.len(), 2);
    }

    #[test]
    fn test_try_parse_battle_page_valid_json_with_username() {
        let html = r#"
            <section class="status_personal__JO1zh">
                <ul><li class="status_name__gXNo9">TestUser</li></ul>
            </section>
        "#;
        let json = serde_json::json!({ "html": html }).to_string();
        let result = try_parse_battle_page(&json);
        assert!(result.is_some());
        let update = result.unwrap();
        assert_eq!(update.username, Some("TestUser".to_string()));
        assert!(update.entries.is_empty());
    }

    #[test]
    fn test_try_parse_battle_page_invalid_json() {
        let result = try_parse_battle_page("not json at all");
        assert!(result.is_none());
    }

    #[test]
    fn test_try_parse_battle_page_json_without_html_key() {
        let json = serde_json::json!({ "data": "something" }).to_string();
        let result = try_parse_battle_page(&json);
        assert!(result.is_none());
    }

    #[test]
    fn test_try_parse_battle_page_empty_html() {
        let json = serde_json::json!({ "html": "<html></html>" }).to_string();
        let result = try_parse_battle_page(&json);
        assert!(result.is_none()); // no entries and no username
    }

    #[test]
    fn test_try_parse_battle_page_html_null() {
        let json = serde_json::json!({ "html": null }).to_string();
        let result = try_parse_battle_page(&json);
        assert!(result.is_none());
    }

    #[test]
    fn test_try_parse_battle_page_empty_string() {
        let result = try_parse_battle_page("");
        assert!(result.is_none());
    }

    #[test]
    fn test_try_parse_battle_page_both_username_and_entries() {
        let html = format!(
            r#"
            <section class="status_personal__ABC">
                <ul><li class="status_name__XYZ">MyUser</li></ul>
            </section>
            {}
            "#,
            // Inline a single battle entry
            r#"
            <ul>
                <li data-index="0">
                    <div>
                        <div>
                            <p class="battle_data_name_p1__A"><span class="battle_data_name__B">P1</span></p>
                            <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                            <p class="battle_data_name_p2__C"><span class="battle_data_name__D">P2</span></p>
                        </div>
                        <div class="battle_data_player1__MIpvf battle_data_win__E">
                            <ul><li class="battle_data_lp__F">1000 LP</li></ul>
                        </div>
                        <div class="battle_data_player2__tymNR battle_data_lose__G">
                            <ul><li class="battle_data_lp__H">900 LP</li></ul>
                        </div>
                    </div>
                </li>
            </ul>
            "#
        );
        let json = serde_json::json!({ "html": html }).to_string();
        let result = try_parse_battle_page(&json);
        assert!(result.is_some());
        let update = result.unwrap();
        assert_eq!(update.username, Some("MyUser".to_string()));
        assert_eq!(update.entries.len(), 1);
    }
}
