use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Emitter};
use std::sync::atomic::{AtomicUsize, Ordering};

static FETCHER_ID: AtomicUsize = AtomicUsize::new(0);

#[tauri::command]
async fn open_login_window(app: AppHandle) -> Result<(), String> {
    // Attempt to get existing to avoid duplicates
    if let Some(win) = app.get_webview_window("login") {
        let _ = win.set_focus();
        return Ok(());
    }

    // Script to detect the user code from the URL after login redirect
    // When Buckler redirects after login, the URL contains /profile/{user_code}/
    // We navigate an invisible iframe to sf6data://usercode?code=xxx to tell Rust
    let detect_script = r#"
        (function() {
            var announced = false;
            function checkUrl() {
                if (announced) return;
                var url = window.location.href;
                var match = url.match(/\/buckler\/profile\/(\d+)/);
                if (match) {
                    announced = true;
                    // Use a fetch request to our custom protocol
                    fetch('sf6data://usercode?code=' + match[1]).catch(() => {});
                }
            }
            // Check on page load and on navigation changes
            checkUrl();
            var observer = new MutationObserver(function() { checkUrl(); });
            observer.observe(document.body, { childList: true, subtree: true });
            setInterval(checkUrl, 2000);
        })();
    "#;

    WebviewWindowBuilder::new(
        &app,
        "login",
        WebviewUrl::External("https://www.streetfighter.com/6/buckler/".parse().unwrap())
    )
    .title("Login to CFN / Buckler")
    .inner_size(1000.0, 700.0)
    .initialization_script(detect_script)
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
                    var nextData = document.getElementById('__NEXT_DATA__');
                    if (nextData) {{
                        var parsed = JSON.parse(nextData.textContent);
                        data = parsed.props.pageProps || parsed;
                    }} else {{
                        var text = document.body.innerText || document.body.textContent;
                        data = JSON.parse(text);
                    }}
                    
                    var jsonStr = JSON.stringify(data);
                    var url = "sf6data://data?label={}&payload=" + encodeURIComponent(jsonStr);
                    window.location.href = url;
                }} catch(e) {{
                    var errStr = JSON.stringify({{ error: 'Failed to parse', raw: e.toString() }});
                    window.location.href = "sf6data://data?label={}&payload=" + encodeURIComponent(errStr);
                }}
            }}, 3000);
        }});
    "#, label, label);

    WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::External(endpoint.parse().unwrap())
    )
    .visible(false)
    .initialization_script(&init_script)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![open_login_window, fetch_buckler_data])
        .register_uri_scheme_protocol("sf6data", move |ctx, request| {
            if let Some(query) = request.uri().query() {
                // Handling User Code auto detection: sf6data://usercode?code=xxx
                if request.uri().authority().map_or(false, |a| a.as_str() == "usercode") {
                    if let Some(code_str) = query.split('&').find(|p| p.starts_with("code=")) {
                        let code = &code_str["code=".len()..];
                        let _ = ctx.app_handle().emit("cfn_user_code_detected", code.to_string());
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
