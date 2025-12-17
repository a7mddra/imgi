use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tiny_http::{Server, Response, Header};
use url::Url;

// 1. Embed external files at Compile Time
// This embeds the files into the .exe/binary so you don't need to ship json files.
const SECRETS_JSON: &str = include_str!("data/credentials.json");
const HTML_TEMPLATE: &str = include_str!("data/success.html");

const REDIRECT_PORT: u16 = 3456;

// --- CONFIG STRUCTS ---
#[derive(Deserialize)]
struct OAuthSecrets {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    auth_url: String,
    token_url: String,
    user_info_url: String,
}

// --- DATA STRUCTS ---
#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct UserProfile {
    names: Option<Vec<Name>>,
    email_addresses: Option<Vec<Email>>,
    photos: Option<Vec<Photo>>,
}

#[derive(Deserialize)]
struct Name { display_name: Option<String> }
#[derive(Deserialize)]
struct Email { value: Option<String> }
#[derive(Deserialize)]
struct Photo { url: Option<String> }

#[derive(Serialize)]
struct SavedProfile {
    name: String,
    email: String,
    avatar: String,
}

// --- MAIN FUNCTION ---

pub fn start_google_auth_flow(app: AppHandle, config_dir: PathBuf) -> Result<(), String> {
    // 2. Parse Secrets
    let secrets: OAuthSecrets = serde_json::from_str(SECRETS_JSON)
        .map_err(|e| format!("Failed to parse secrets.json: {}", e))?;

    // 3. Start Server
    let server = Server::http(format!("127.0.0.1:{}", REDIRECT_PORT))
        .map_err(|e| format!("Failed to start server: {}", e))?;

    // 4. Generate URL dynamically
    let auth_url_full = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=profile email&access_type=offline",
        secrets.auth_url, secrets.client_id, secrets.redirect_uri
    );

    opener::open(&auth_url_full).map_err(|e| e.to_string())?;

    // 5. Wait for Callback
    if let Some(request) = server.recv().ok() {
        let url_string = format!("http://localhost:{}{}", REDIRECT_PORT, request.url());
        let url = Url::parse(&url_string).map_err(|_| "Failed to parse URL")?;
        
        let code_pair = url.query_pairs().find(|(key, _)| key == "code");

        if let Some((_, code)) = code_pair {
            // A. Exchange Code
            let client = reqwest::blocking::Client::new();
            let token_res = client.post(&secrets.token_url)
                .form(&[
                    ("client_id", &secrets.client_id),
                    ("client_secret", &secrets.client_secret),
                    ("code", &code.to_string()),
                    ("grant_type", &"authorization_code".to_string()),
                    ("redirect_uri", &secrets.redirect_uri),
                ])
                .send()
                .map_err(|e| e.to_string())?;

            if !token_res.status().is_success() {
                return respond_html(request, "Authentication Failed", "Google refused the code exchange.", true);
            }

            let token_data: TokenResponse = token_res.json().map_err(|e| e.to_string())?;

            // B. Get Profile
            let profile_res = client.get(&secrets.user_info_url)
                .bearer_auth(token_data.access_token)
                .send()
                .map_err(|e| e.to_string())?;

            let profile: UserProfile = profile_res.json().map_err(|e| e.to_string())?;

            // C. Extract Data
            let name = profile.names.and_then(|n| n.first().and_then(|x| x.display_name.clone())).unwrap_or_default();
            let email = profile.email_addresses.and_then(|e| e.first().and_then(|x| x.value.clone())).unwrap_or_default();
            let avatar = profile.photos.and_then(|p| p.first().and_then(|x| x.url.clone())).unwrap_or_default();

            // D. Save to Disk
            let user_data = SavedProfile { name, email, avatar };
            let profile_path = config_dir.join("profile.json");
            let file = File::create(profile_path).map_err(|e| e.to_string())?;
            serde_json::to_writer_pretty(file, &user_data).map_err(|e| e.to_string())?;

            // E. Notify Frontend
            let _ = app.emit("auth-success", &user_data);

            // F. Respond with Success Page
            let _ = respond_html(
                request, 
                "Authentication Successful", 
                "<p>Spatialshot is now connected to your Google Account.</p><p>You can close this tab.</p>", 
                false
            );
        } else {
            let _ = respond_html(request, "Authentication Failed", "No code found.", true);
        }
    }

    Ok(())
}

fn respond_html(request: tiny_http::Request, title: &str, content: &str, is_error: bool) -> Result<(), String> {
    let color = if is_error { "#d93025" } else { "#202124" };
    
    // Replace placeholders in your external HTML file
    let html = HTML_TEMPLATE
        .replace("${title}", title)
        .replace("${bodyContent}", content) // Changed to bodyContent to match your vanilla HTML
        .replace("${breadcrumb}", if is_error { "Error" } else { "Success" })
        .replace("${dynamicStyle}", &format!("<style>:root {{ --title-color: {}; }}</style>", color));

    let response = Response::from_string(html)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());

    request.respond(response).map_err(|e| e.to_string())
}