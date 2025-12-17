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
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

// Import the Auth module (ensure auth.rs is in the same folder)
mod auth;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

struct AppState {
    // Stores "data:image/png;base64,..." for the initial load
    image_data: Arc<Mutex<Option<String>>>,
    // Kill switch for the background clipboard thread
    watcher_running: Arc<AtomicBool>,
}

impl AppState {
    fn new() -> Self {
        Self {
            image_data: Arc::new(Mutex::new(None)),
            watcher_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

// ============================================================================
// HELPER FUNCTIONS (Internal)
// ============================================================================

// --- File & Path Helpers ---

fn get_app_config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("Could not resolve app config dir")
}

// --- Image Processing ---

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

    // Smart Format Detection
    let mime_type = image::guess_format(&buffer)
        .map(|f| f.to_mime_type())
        .unwrap_or("image/jpeg");

    let base64_image = general_purpose::STANDARD.encode(&buffer);
    let data_url = format!("data:{};base64,{}", mime_type, base64_image);

    // Update Global State (Mutex Lock)
    let mut image_lock = state.image_data.lock();
    *image_lock = Some(data_url.clone());

    Ok(data_url)
}

// --- Cryptography & Security ---

// Generates a stable, machine-specific passphrase hash
fn get_stable_passphrase() -> String {
    let home_dir = dirs::home_dir().expect("Could not find home directory");
    let home_str = home_dir.to_string_lossy();
    let mut hasher = Sha256::new();
    hasher.update(home_str.as_bytes());
    hex::encode(hasher.finalize())
}

// Key Derivation (PBKDF2) - CPU Intensive!
fn derive_key(passphrase: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2::<hmac::Hmac<Sha256>>(passphrase.as_bytes(), salt, 150_000, &mut key)
        .expect("PBKDF2 derivation failed");
    key
}

// Decrypts a specific provider key file
fn get_decrypted_key_internal(app: &AppHandle, provider: &str) -> Option<String> {
    let config_dir = get_app_config_dir(app);
    let file_path = config_dir.join(format!("{}_key.json", provider));

    if !file_path.exists() {
        return None;
    }

    // 1. Read JSON Structure
    let file_content = fs::read_to_string(file_path).ok()?;
    let payload: serde_json::Value = serde_json::from_str(&file_content).ok()?;

    // 2. Decode Base64 components
    let salt = general_purpose::STANDARD.decode(payload["salt"].as_str()?).ok()?;
    let iv = general_purpose::STANDARD.decode(payload["iv"].as_str()?).ok()?;
    let tag = general_purpose::STANDARD.decode(payload["tag"].as_str()?).ok()?;
    let ciphertext = general_purpose::STANDARD.decode(payload["ciphertext"].as_str()?).ok()?;

    // 3. Re-Derive Key (Expensive!)
    let passphrase = get_stable_passphrase();
    let key_bytes = derive_key(&passphrase, &salt);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&iv);

    // 4. Combine Ciphertext + Tag for decryption
    let mut encrypted_data = ciphertext;
    encrypted_data.extend_from_slice(&tag);

    // 5. Decrypt
    let plaintext_bytes = cipher.decrypt(nonce, encrypted_data.as_ref()).ok()?;

    String::from_utf8(plaintext_bytes).ok()
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

// --- 1. Image Operations ---

#[tauri::command]
fn get_initial_image(state: State<AppState>) -> Option<String> {
    let image_lock = state.image_data.lock();
    image_lock.clone()
}

#[tauri::command]
fn process_image_path(path: String, state: State<AppState>) -> Result<String, String> {
    process_and_store_image(&path, &state)
}

#[tauri::command]
fn process_image_bytes(bytes: Vec<u8>, state: State<AppState>) -> Result<String, String> {
    process_bytes_internal(bytes, &state)
}

#[tauri::command]
fn read_image_file(path: String, state: State<AppState>) -> Result<serde_json::Value, String> {
    let base64 = process_and_store_image(&path, &state)?;
    // Split mime and data for the frontend
    let parts: Vec<&str> = base64.splitn(2, ",").collect();
    let mime_type = parts[0].replace("data:", "").replace(";base64", "");

    Ok(serde_json::json!({
        "base64": base64,
        "mimeType": mime_type
    }))
}

// --- 2. Security & Clipboard ---

#[tauri::command]
async fn start_clipboard_watcher(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Kill existing watcher to prevent duplicates
    if state.watcher_running.load(Ordering::SeqCst) {
        state.watcher_running.store(false, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(500));
    }

    state.watcher_running.store(true, Ordering::SeqCst);
    let running_flag = state.watcher_running.clone();
    let app_handle = app.clone();

    // Spawn background thread
    thread::spawn(move || {
        // Robust Initialization Loop
        let mut clipboard = loop {
            match arboard::Clipboard::new() {
                Ok(cb) => break cb,
                Err(e) => {
                    eprintln!("Clipboard init failed, retrying in 1s: {}", e);
                    if !running_flag.load(Ordering::SeqCst) { return; }
                    thread::sleep(Duration::from_secs(1));
                }
            }
        };

        // Ignore current content to prevent stale key triggering
        let mut last_text = clipboard.get_text().unwrap_or_default().trim().to_string();
        println!("Watcher started. Ignoring current clipboard content.");

        while running_flag.load(Ordering::SeqCst) {
            if let Ok(text) = clipboard.get_text() {
                let trimmed = text.trim().to_string();

                if !trimmed.is_empty() && trimmed != last_text {
                    last_text = trimmed.clone();

                    // Logic: Detect Gemini Key (starts with AIza)
                    if trimmed.starts_with("AIzaS") {
                        println!("Gemini Key Detected");
                        let _ = app_handle.emit(
                            "clipboard-text",
                            serde_json::json!({ "provider": "gemini", "key": trimmed }),
                        );
                    } 
                    // Logic: Detect ImgBB Key (32 char alphanumeric)
                    else if trimmed.len() == 32 && trimmed.chars().all(char::is_alphanumeric) {
                        println!("ImgBB Key Detected");
                        let _ = app_handle.emit(
                            "clipboard-text",
                            serde_json::json!({ "provider": "imgbb", "key": trimmed }),
                        );
                    }
                }
            }
            thread::sleep(Duration::from_millis(500)); // Poll every 500ms
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
    // Running heavy crypto on blocking thread to prevent UI freeze
    tauri::async_runtime::spawn_blocking(move || {
        // 1. Prepare Crypto Components
        let passphrase = get_stable_passphrase();
        let mut salt = [0u8; 16];
        let mut iv = [0u8; 12];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut iv);

        // 2. Derive Key & Encrypt
        let key_bytes = derive_key(&passphrase, &salt);
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(&iv);

        let encrypted_data = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        // 3. Combine parts
        let (ciphertext, tag) = encrypted_data.split_at(encrypted_data.len() - 16);

        // 4. Construct Payload
        let payload = serde_json::json!({
            "version": 1,
            "algo": "aes-256-gcm",
            "salt": general_purpose::STANDARD.encode(salt),
            "iv": general_purpose::STANDARD.encode(iv),
            "tag": general_purpose::STANDARD.encode(tag),
            "ciphertext": general_purpose::STANDARD.encode(ciphertext)
        });

        // 5. Save to File
        let config_dir = get_app_config_dir(&app);
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        }

        let file_path = config_dir.join(format!("{}_key.json", provider));
        let mut file = File::create(&file_path).map_err(|e| e.to_string())?;

        file.write_all(
            serde_json::to_string_pretty(&payload).unwrap().as_bytes(),
        )
        .map_err(|e| e.to_string())?;

        // 6. Close ImgBB Window if applicable
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

// --- 3. Key Retrieval & Auth Management ---

#[tauri::command]
fn check_file_exists(app: AppHandle, filename: String) -> bool {
    let path = get_app_config_dir(&app).join(filename);
    path.exists()
}

// Async getter prevents UI freeze during decryption
#[tauri::command]
async fn get_api_key(app: AppHandle, provider: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_decrypted_key_internal(&app, &provider).unwrap_or_default()
    })
    .await
    .map_err(|e| e.to_string())
}

// Hard Reset (Async Delete)
#[tauri::command]
async fn reset_api_key(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);
        // We use .ok() to ignore errors if files are already gone
        let _ = fs::remove_file(config_dir.join("gemini_key.json")).ok();
        let _ = fs::remove_file(config_dir.join("imgbb_key.json")).ok();
        let _ = fs::remove_file(config_dir.join("profile.json")).ok();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn start_google_auth(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        }
        // Call the auth module (runs local server)
        auth::start_google_auth_flow(app, config_dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn logout(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let config_dir = get_app_config_dir(&app);
        // Only remove user profile, keep API keys
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
    
    // Fallback if no profile exists
    serde_json::json!({ 
        "name": "Guest User", 
        "email": "Not logged in", 
        "avatar": "" 
    })
}

// --- 4. Window & Utility Commands ---

#[tauri::command]
async fn open_imgbb_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("imgbb-setup") {
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
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

    Ok(())
}

#[tauri::command]
fn close_imgbb_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("imgbb-setup") {
        let _ = win.close();
    }
}

// Async wrapper to ensure xdg-open doesn't block main thread
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

// --- 5. Stubs (State-Only Settings) ---
// These are currently handled via frontend localStorage/files, 
// but we keep the commands to satisfy IPC contracts if needed.

#[tauri::command] fn get_prompt() -> String { "".to_string() }
#[tauri::command] fn get_model() -> String { "gemini-2.5-flash".to_string() }
#[tauri::command] fn get_session_path() -> Option<String> { None }
#[tauri::command] fn save_prompt(_prompt: String) {}
#[tauri::command] fn save_model(_model: String) {}
#[tauri::command] fn set_theme(_theme: String) {}
#[tauri::command] fn reset_prompt() -> String { "".to_string() }
#[tauri::command] fn reset_model() -> String { "gemini-2.5-flash".to_string() }
#[tauri::command] fn trigger_lens_search() {}


// ============================================================================
// ENTRY POINT
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Image
            process_image_path,
            process_image_bytes,
            read_image_file,
            get_initial_image,
            // Auth / Watcher / Keys
            start_clipboard_watcher,
            stop_clipboard_watcher,
            encrypt_and_save,
            check_file_exists,
            get_api_key,
            reset_api_key,
            start_google_auth,
            logout,
            get_user_data,
            // Window / Utils
            open_imgbb_window,
            close_imgbb_window,
            open_external_url,
            clear_cache,
            // Stubs
            get_prompt,
            get_model,
            get_session_path,
            save_prompt,
            save_model,
            set_theme,
            reset_prompt,
            reset_model,
            trigger_lens_search,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // CLI Argument Handling (Load image on startup)
            let args: Vec<String> = std::env::args().collect();
            // Skip binary name (0), find first arg that isn't a flag
            if let Some(path) = args.iter().skip(1).find(|arg| !arg.starts_with("-")) {
                println!("CLI Image argument detected: {}", path);
                let state = handle.state::<AppState>();
                if let Ok(_data_url) = process_and_store_image(path, &state) {
                    let _ = handle.emit("image-path", path);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}