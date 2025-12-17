use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tiny_http::{Server, Response, Header};
use url::Url;

// Embed external files at Compile Time
const SECRETS_JSON: &str = include_str!("data/credentials.json");
// We assume src-tauri/src/data/success.html contains your FULL original HTML template
const HTML_TEMPLATE: &str = include_str!("data/success.html");

// FIX: Use Port 3000 to match Google Console default & avoid Vite (3456) collision
const REDIRECT_PORT: u16 = 3000;
const REDIRECT_URI: &str = "http://localhost:3000";
const USER_INFO_URL: &str = "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos";

// --- CONFIG STRUCTS ---
#[derive(Deserialize, Debug)]
struct GoogleCredentials {
    installed: Option<OAuthConfig>,
    web: Option<OAuthConfig>,
}

#[derive(Deserialize, Debug, Clone)]
struct OAuthConfig {
    client_id: String,
    client_secret: String,
    auth_uri: String,
    token_uri: String,
}

// --- DATA STRUCTS ---
#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct UserProfile {
    names: Option<Vec<Name>>,
    emailAddresses: Option<Vec<Email>>,
    photos: Option<Vec<Photo>>,
}

#[derive(Deserialize)]
struct Name { displayName: Option<String> }
#[derive(Deserialize)]
struct Email { value: Option<String> }
#[derive(Deserialize)]
struct Photo { url: Option<String> }

// The clean format we save to disk
#[derive(Serialize)]
struct SavedProfile {
    name: String,
    email: String,
    avatar: String,
}

// --- MAIN FUNCTION ---

// ... imports and structs remain the same ...

pub fn start_google_auth_flow(app: AppHandle, config_dir: PathBuf) -> Result<(), String> {
    // 1. Parse Credentials
    let wrapper: GoogleCredentials = serde_json::from_str(SECRETS_JSON)
        .map_err(|e| format!("Failed to parse credentials.json: {}", e))?;

    let secrets = wrapper.installed.or(wrapper.web)
        .ok_or("Invalid credentials.json: missing 'installed' or 'web' object")?;

    // 2. Start Local Server
    let server = Server::http(format!("127.0.0.1:{}", REDIRECT_PORT))
        .map_err(|e| format!("Failed to start auth server on port {}: {}", REDIRECT_PORT, e))?;

    // 3. Generate Auth URL
    let auth_url_full = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=profile email&access_type=offline&prompt=consent",
        secrets.auth_uri, secrets.client_id, REDIRECT_URI
    );

    // 4. Open Default Browser
    opener::open(&auth_url_full).map_err(|e| e.to_string())?;

    // 5. Wait for VALID Callback (Loop to ignore favicons)
    // We loop here so that if the browser requests a favicon first, we don't crash/exit.
    loop {
        let request = match server.recv() {
            Ok(rq) => rq,
            Err(e) => {
                println!("Server receive error: {}", e);
                break; 
            }
        };

        let url_string = format!("http://localhost:{}{}", REDIRECT_PORT, request.url());
        
        // FIX: Ignore favicon requests so they don't consume the one-time token slot
        if url_string.contains("favicon.ico") {
            // Send a 404 for the icon so the browser stops asking
            let _ = request.respond(Response::empty(404));
            continue; // Go back to top of loop and wait for the real request
        }

        // Logic for real callback
        let url = Url::parse(&url_string).map_err(|_| "Failed to parse callback URL")?;
        let code_pair = url.query_pairs().find(|(key, _)| key == "code");

        if let Some((_, code)) = code_pair {
            // A. Exchange Authorization Code for Access Token
            let client = reqwest::blocking::Client::new();
            let token_res = client.post(&secrets.token_uri)
                .form(&[
                    ("client_id", &secrets.client_id),
                    ("client_secret", &secrets.client_secret),
                    ("code", &code.to_string()),
                    ("grant_type", &"authorization_code".to_string()),
                    ("redirect_uri", &REDIRECT_URI.to_string()),
                ])
                .send()
                .map_err(|e| format!("Token Exchange Failed: {}", e))?;

            if !token_res.status().is_success() {
                return respond_html(request, "Auth Failed", "Google refused the code exchange.", true);
            }

            let token_data: TokenResponse = token_res.json().map_err(|e| e.to_string())?;

            // B. Fetch User Profile
            let profile_res = client.get(USER_INFO_URL)
                .bearer_auth(token_data.access_token)
                .send()
                .map_err(|e| format!("Profile Fetch Failed: {}", e))?;

            let profile: UserProfile = profile_res.json().map_err(|e| e.to_string())?;

            // C. Extract & Clean Data
            let name = profile.names.and_then(|n| n.first().and_then(|x| x.displayName.clone())).unwrap_or("Spatial User".to_string());
            let email = profile.emailAddresses.and_then(|e| e.first().and_then(|x| x.value.clone())).unwrap_or_default();
            
            let mut avatar = profile.photos.and_then(|p| p.first().and_then(|x| x.url.clone())).unwrap_or_default();
            if avatar.starts_with("http://") {
                avatar = avatar.replace("http://", "https://");
            }

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

            // SUCCESS! Break the loop and finish the command.
            return Ok(());
        } else {
            // Handle "Access Denied" or missing code
            let _ = respond_html(request, "Authentication Failed", "No authorization code found.", true);
            // We return OK here to stop the thread, assuming the user denied access.
            return Ok(());
        }
    }

    Ok(())
}

fn respond_html(request: tiny_http::Request, title: &str, content: &str, is_error: bool) -> Result<(), String> {
    let title_color = if is_error { "#d93025" } else { "#202124" };
    let breadcrumb = if is_error { "Error" } else { "Confirmation" };
    // This matches your original logic: const dynamicStyle = `<style>:root { --title-color: ${titleColor}; }</style>`;
    let dynamic_style = format!("<style>:root {{ --title-color: {}; }}</style>", title_color);
    
    // Inject variables into the HTML template
    // Note: We use ${placeholder} in the template file, just like your Node code
    let html = HTML_TEMPLATE
        .replace("${title}", title)
        .replace("${dynamicStyle}", &dynamic_style)
        .replace("${breadcrumb}", breadcrumb)
        .replace("${bodyContent}", content);

    let response = Response::from_string(html)
        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());

    request.respond(response).map_err(|e| e.to_string())
}