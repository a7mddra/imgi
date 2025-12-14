use tauri_plugin_cli::CliExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Check for CLI args (e.g., file paths passed on startup)
            match app.cli().matches() {
                Ok(matches) => {
                    if let Some(arg) = matches.args.get("image") {
                        println!("Image argument received: {:?}", arg.value);
                        // Future: Emit event to frontend to load this image
                    }
                }
                Err(_) => {}
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}