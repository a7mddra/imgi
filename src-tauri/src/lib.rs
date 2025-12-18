use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use parking_lot::Mutex;
use pbkdf2::pbkdf2;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Manager, Size, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

mod auth;

struct AppState {
    image_data: Arc<Mutex<Option<String>>>,

    watcher_running: Arc<AtomicBool>,

    auth_running: Arc<AtomicBool>,
}

impl AppState {
    fn new() -> Self {
        Self {
            image_data: Arc::new(Mutex::new(None)),
            watcher_running: Arc::new(AtomicBool::new(false)),
            auth_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn calculate_dynamic_window(
    app: &AppHandle,
    base_w: f64,
    base_h: f64,
) -> Result<(f64, f64, f64, f64), String> {
    let monitor = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor found")?;

    let size = monitor.size();
    let pos = monitor.position();

    let screen_w = size.width as f64;
    let screen_h = size.height as f64;

    let frac_w = base_w / 1366.0;
    let frac_h = base_h / 768.0;

    let win_w = (frac_w * screen_w).floor();
    let win_h = (frac_h * screen_h).floor();

    let x = pos.x as f64 + (screen_w - win_w) / 2.0;
    let y = pos.y as f64 + (screen_h - win_h) / 2.0;

    Ok((x, y, win_w, win_h))
}

fn spawn_app_window(
    app: &AppHandle,
    label: &str,
    url: &str,
    base_w: f64,
    base_h: f64,
    title: &str,
) -> Result<(), String> {
    if app.get_webview_window(label).is_some() {
        return Ok(());
    }

    let (x, y, w, h) =
        calculate_dynamic_window(app, base_w, base_h).unwrap_or((100.0, 100.0, base_w, base_h));

    let visible = label != "main";

    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .position(x, y)
        .inner_size(w, h)
        .visible(visible)
        .resizable(true)
        .decorations(true)
        .background_color(tauri::window::Color(10, 10, 10, 255))
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn get_app_config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("Could not resolve app config dir")
}

fn process_and_store_image(path: &str, state: &State<AppState>) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    process_bytes_internal(buffer, state)
}

fn process_bytes_internal(buffer: Vec<u8>, state: &State<AppState>) -> Result<String, String> {
    if buffer.is_empty() {
        return Err("Empty image buffer".to_string());
    }

    let mime_type = image::guess_format(&buffer)
        .map(|f| f.to_mime_type())
        .unwrap_or("image/jpeg");

    let base64_image = general_purpose::STANDARD.encode(&buffer);
    let data_url = format!("data:{};base64,{}", mime_type, base64_image);

    let mut image_lock = state.image_data.lock();
    *image_lock = Some(data_url.clone());

    Ok(data_url)
}

fn get_stable_passphrase() -> String {
    let home_dir = dirs::home_dir().expect("Could not find home directory");
    let home_str = home_dir.to_string_lossy();
    let mut hasher = Sha256::new();
    hasher.update(home_str.as_bytes());
    hex::encode(hasher.finalize())
}

fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2::<hmac::Hmac<Sha256>>(passphrase.as_bytes(), salt, 150_000, &mut key)
        .expect("PBKDF2 derivation failed");
    key
}

fn get_decrypted_key_internal(app: &AppHandle, provider: &str) -> Option<String> {
    let config_dir = get_app_config_dir(app);
    let file_path = config_dir.join(format!("{}_key.json", provider));

    if !file_path.exists() {
        return None;
    }

    let file_content = fs::read_to_string(file_path).ok()?;
    let payload: serde_json::Value = serde_json::from_str(&file_content).ok()?;

    let salt = general_purpose::STANDARD
        .decode(payload["salt"].as_str()?)
        .ok()?;
    let iv = general_purpose::STANDARD
        .decode(payload["iv"].as_str()?)
        .ok()?;
    let tag = general_purpose::STANDARD
        .decode(payload["tag"].as_str()?)
        .ok()?;
    let ciphertext = general_purpose::STANDARD
        .decode(payload["ciphertext"].as_str()?)
        .ok()?;

    let passphrase = get_stable_passphrase();
    let key_bytes = derive_key(&passphrase, &salt);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&iv);

    let mut encrypted_data = ciphertext;
    encrypted_data.extend_from_slice(&tag);

    let plaintext_bytes = cipher.decrypt(nonce, encrypted_data.as_ref()).ok()?;

    String::from_utf8(plaintext_bytes).ok()
}

#[tauri::command]
fn get_initial_image(state: State<AppState>) -> Option<String> {
    let image_lock = state.image_data.lock();
    image_lock.clone()
}

#[tauri::command]
fn process_image_path(path: String) -> Result<serde_json::Value, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File does not exist".into());
    }
    let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
    Ok(serde_json::json!({
        "path": path,
        "mimeType": mime
    }))
}

#[tauri::command]
fn process_image_bytes(bytes: Vec<u8>, state: State<AppState>) -> Result<String, String> {
    process_bytes_internal(bytes, &state)
}

#[tauri::command]
fn read_image_file(path: String, state: State<AppState>) -> Result<serde_json::Value, String> {
    let base64 = process_and_store_image(&path, &state)?;

    let parts: Vec<&str> = base64.splitn(2, ",").collect();
    let mime_type = parts[0].replace("data:", "").replace(";base64", "");

    Ok(serde_json::json!({
        "base64": base64,
        "mimeType": mime_type
    }))
}

#[tauri::command]
async fn start_clipboard_watcher(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.watcher_running.load(Ordering::SeqCst) {
        state.watcher_running.store(false, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(500));
    }

    state.watcher_running.store(true, Ordering::SeqCst);
    let running_flag = state.watcher_running.clone();
    let app_handle = app.clone();

    thread::spawn(move || {
        let mut clipboard = loop {
            match arboard::Clipboard::new() {
                Ok(cb) => break cb,
                Err(e) => {
                    eprintln!("Clipboard init failed, retrying in 1s: {}", e);
                    if !running_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    thread::sleep(Duration::from_secs(1));
                }
            }
        };

        let mut last_text = clipboard.get_text().unwrap_or_default().trim().to_string();
        println!("Watcher started. Ignoring current clipboard content.");

        while running_flag.load(Ordering::SeqCst) {
            if let Ok(text) = clipboard.get_text() {
                let trimmed = text.trim().to_string();

                if !trimmed.is_empty() && trimmed != last_text {
                    last_text = trimmed.clone();

                    if trimmed.starts_with("AIzaS") {
                        println!("Gemini Key Detected");
                        let _ = app_handle.emit(
                            "clipboard-text",
                            serde_json::json!({ "provider": "gemini", "key": trimmed }),
                        );
                    } else if trimmed.len() == 32 && trimmed.chars().all(char::is_alphanumeric) {
                        println!("ImgBB Key Detected");
                        let _ = app_handle.emit(
                            "clipboard-text",
                            serde_json::json!({ "provider": "imgbb", "key": trimmed }),
                        );
                    }
                }
            }
            thread::sleep(Duration::from_millis(2000));
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_clipboard_watcher(state: State<'_, AppState>) -> Result<(), String> {
    state.watcher_running.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
async fn encrypt_and_save(
    app: AppHandle,
    plaintext: String,
    provider: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let passphrase = get_stable_passphrase();
        let mut salt = [0u8; 16];
        let mut iv = [0u8; 12];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut iv);

        let key_bytes = derive_key(&passphrase, &salt);
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&iv);

        let encrypted_data = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        let (ciphertext, tag) = encrypted_data.split_at(encrypted_data.len() - 16);

        let payload = serde_json::json!({
            "version": 1,
            "algo": "aes-256-gcm",
            "salt": general_purpose::STANDARD.encode(salt),
            "iv": general_purpose::STANDARD.encode(iv),
            "tag": general_purpose::STANDARD.encode(tag),
            "ciphertext": general_purpose::STANDARD.encode(ciphertext)
        });

        let config_dir = get_app_config_dir(&app);
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        }

        let file_path = config_dir.join(format!("{}_key.json", provider));
        let mut file = File::create(&file_path).map_err(|e| e.to_string())?;

        file.write_all(serde_json::to_string_pretty(&payload).unwrap().as_bytes())
            .map_err(|e| e.to_string())?;

        if provider == "imgbb" {
            if let Some(win) = app.get_webview_window("imgbb-setup") {
                let _ = win.close();
            }
        }

        Ok(file_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn check_file_exists(app: AppHandle, filename: String) -> bool {
    let path = get_app_config_dir(&app).join(filename);
    path.exists()
}

#[tauri::command]
async fn get_api_key(app: AppHandle, provider: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_decrypted_key_internal(&app, &provider).unwrap_or_default()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reset_api_key(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);

        let _ = fs::remove_file(config_dir.join("gemini_key.json")).ok();
        let _ = fs::remove_file(config_dir.join("imgbb_key.json")).ok();
        let _ = fs::remove_file(config_dir.join("profile.json")).ok();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn start_google_auth(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if state.auth_running.load(Ordering::SeqCst) {
        return Err("Authentication already in progress".into());
    }

    state.auth_running.store(true, Ordering::SeqCst);
    let auth_lock = state.auth_running.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);
        if !config_dir.exists() {
            match fs::create_dir_all(&config_dir) {
                Ok(_) => {}
                Err(e) => return Err(e.to_string()),
            }
        }

        auth::start_google_auth_flow(app, config_dir)
    })
    .await;

    auth_lock.store(false, Ordering::SeqCst);

    result.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn logout(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);

        let _ = fs::remove_file(config_dir.join("profile.json")).ok();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_user_data(app: AppHandle) -> serde_json::Value {
    let config_dir = get_app_config_dir(&app);
    let profile_path = config_dir.join("profile.json");

    if profile_path.exists() {
        if let Ok(file) = File::open(profile_path) {
            if let Ok(json) = serde_json::from_reader(file) {
                return json;
            }
        }
    }

    serde_json::json!({
        "name": "Guest User",
        "email": "Not logged in",
        "avatar": ""
    })
}

#[tauri::command]
async fn open_imgbb_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("imgbb-setup") {
        let _ = window.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        &app,
        "imgbb-setup",
        WebviewUrl::App("index.html?mode=imgbb".into()),
    )
    .title("ImgBB Setup")
    .inner_size(480.0, 430.0)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .always_on_top(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    let app_handle = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            println!("ImgBB window closed/destroyed event detected");
            let _ = app_handle.emit("imgbb-popup-closed", ());
        }
        _ => {}
    });
    Ok(())
}

#[tauri::command]
fn close_imgbb_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("imgbb-setup") {
        let _ = win.close();
    }
}

#[tauri::command]
async fn resize_window(
    app: AppHandle,
    width: f64,
    height: f64,
    show: Option<bool>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let (x, y, target_w, target_h) = calculate_dynamic_window(&app, width, height)?;

    window
        .set_size(Size::Physical(tauri::PhysicalSize {
            width: target_w as u32,
            height: target_h as u32,
        }))
        .map_err(|e| e.to_string())?;

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: x as i32,
            y: y as i32,
        }))
        .map_err(|e| e.to_string())?;

    if show.unwrap_or(false) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = opener::open(url);
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_cache(app: AppHandle) {
    app.webview_windows().iter().for_each(|(_, window)| {
        let _ = window.clear_all_browsing_data();
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            process_image_path,
            process_image_bytes,
            read_image_file,
            get_initial_image,
            start_clipboard_watcher,
            stop_clipboard_watcher,
            encrypt_and_save,
            check_file_exists,
            get_api_key,
            reset_api_key,
            start_google_auth,
            logout,
            get_user_data,
            open_imgbb_window,
            close_imgbb_window,
            open_external_url,
            clear_cache,
            resize_window,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let args: Vec<String> = std::env::args().collect();

            if let Some(path) = args.iter().skip(1).find(|arg| !arg.starts_with("-")) {
                println!("CLI Image argument detected: {}", path);
                let state = handle.state::<AppState>();
                if let Ok(_data_url) = process_and_store_image(path, &state) {
                    let _ = handle.emit("image-path", path);
                }
            }

            spawn_app_window(&handle, "main", "index.html", 900.0, 700.0, "spatialshot")
                .expect("Failed to spawn main window");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
