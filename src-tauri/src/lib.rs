// FILE: src-tauri/src/lib.rs

use base64::{engine::general_purpose, Engine as _};
use parking_lot::Mutex;
use std::fs::File;
use std::io::Read;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::{WebviewWindowBuilder, WebviewUrl};

// 1. Define AppState to hold the loaded image data
struct AppState {
    image_data: Arc<Mutex<Option<String>>>, // Stores "data:image/png;base64,..."
}

impl AppState {
    fn new() -> Self {
        Self {
            image_data: Arc::new(Mutex::new(None)),
        }
    }
}

// 2. Helper Functions (as requested)
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

    // Guess format or default to jpeg
    let mime_type = image::guess_format(&buffer)
        .map(|f| f.to_mime_type())
        .unwrap_or("image/jpeg");

    let base64_image = general_purpose::STANDARD.encode(&buffer);
    let data_url = format!("data:{};base64,{}", mime_type, base64_image);

    // Update state
    let mut image_lock = state.image_data.lock();
    *image_lock = Some(data_url.clone());

    Ok(data_url)
}

// 3. Tauri Commands

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
    // Split mime and data for the frontend format
    let parts: Vec<&str> = base64.splitn(2, ",").collect();
    let mime_type = parts[0].replace("data:", "").replace(";base64", "");

    Ok(serde_json::json!({
        "base64": base64, // sending full data url as base64 field for simplicity in this stage
        "mimeType": mime_type
    }))
}

// Stub commands to prevent frontend crashes

#[tauri::command]
fn get_api_key() -> String {
    "".to_string()
}

#[tauri::command]
fn get_prompt() -> String {
    "".to_string()
}

#[tauri::command]
fn get_model() -> String {
    "gemini-2.5-flash".to_string()
}

#[tauri::command]
fn get_user_data() -> serde_json::Value {
    serde_json::json!({ "name": "Dev User", "email": "dev@lochhhhhhhhhuhuuhuhuhuhal", "avatar": "" })
}

#[tauri::command]
fn get_session_path() -> Option<String> {
    None
}

#[tauri::command]
fn save_prompt(_prompt: String) {}

#[tauri::command]
fn save_model(_model: String) {}

#[tauri::command]
fn set_theme(_theme: String) {}

#[tauri::command]
fn clear_cache(app: AppHandle) {
    app.webview_windows().iter().for_each(|(_, window)| {
        let _ = window.clear_all_browsing_data();
    });
}

#[tauri::command]
fn open_external_url(url: String) {
    let _ = opener::open(url);
}

#[tauri::command]
fn reset_prompt() -> String {
    "".to_string()
}

#[tauri::command]
fn reset_model() -> String {
    "gemini-2.5-flash".to_string()
}

#[tauri::command]
fn logout() {}

#[tauri::command]
fn reset_api_key() {}

#[tauri::command]
fn trigger_lens_search() {}

#[tauri::command]
async fn open_imgbb_window(app: AppHandle) -> Result<(), String> {
    // 1. Check if window exists to focus it instead of opening duplicate
    if let Some(window) = app.get_webview_window("imgbb-setup") {
        let _ = window.set_focus();
        return Ok(());
    }

    // 2. Create the window matching Electron's "dims" and "preferences"
    // Electron: width: 480, height: 430, resizable: false, minimizable: false...
    let win = WebviewWindowBuilder::new(
        &app,
        "imgbb-setup", // The label
        WebviewUrl::App("index.html?mode=imgbb".into()) // The URL with query param
    )
    .title("ImgBB Setup")
    .inner_size(480.0, 430.0)
    .resizable(false)
    .minimizable(false) // Match Electron
    .maximizable(false) // Match Electron
    .always_on_top(true)
    .center() // Helper to center it like Electron's getDynamicDims often does
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new()) // Initialize State
        .invoke_handler(tauri::generate_handler![
            process_image_path,
            process_image_bytes,
            read_image_file,
            get_api_key,
            get_prompt,
            get_model,
            get_user_data,
            get_session_path,
            save_prompt,
            save_model,
            set_theme,
            clear_cache,
            open_external_url,
            reset_prompt,
            reset_model,
            logout,
            reset_api_key,
            trigger_lens_search,
            get_initial_image,
            open_imgbb_window
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            
            // CLI Argument Handling
            // This logic is already good for production. 
            // It ignores flags (starts with -) and grabs the first file path.
            let args: Vec<String> = std::env::args().collect();
            
            // Skip binary name (0), find first arg that isn't a flag
            if let Some(path) = args.iter().skip(1).find(|arg| !arg.starts_with("-")) {
                 println!("CLI Image argument detected: {}", path);
                 let state = handle.state::<AppState>();
                 
                 // This stores the Base64 in the AppState Mutex
                 if let Ok(_data_url) = process_and_store_image(path, &state) {
                    // We keep the emit for hot-reloading or late events, 
                    // but the frontend will rely on 'get_initial_image' for startup.
                    let _ = handle.emit("image-path", path);
                 }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
