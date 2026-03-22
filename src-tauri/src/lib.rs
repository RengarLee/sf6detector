use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Emitter};
use std::sync::atomic::{AtomicUsize, Ordering};

pub mod parser;
use parser::*;

static FETCHER_ID: AtomicUsize = AtomicUsize::new(0);

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
async fn open_community_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("community") {
        let _ = win.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "community",
        WebviewUrl::App("community.html".into()),
    )
    .title("Community / 社区")
    .inner_size(450.0, 480.0)
    .resizable(false)
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![open_login_window, open_community_window, fetch_buckler_data, parse_battle_html])
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
