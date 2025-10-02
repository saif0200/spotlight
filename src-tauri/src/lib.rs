use base64::{engine::general_purpose, Engine as _};
use screenshots::Screen;
use serde::{Deserialize, Serialize};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn capture_screen() -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.first().ok_or("No screens found")?;

    let image = screen.capture().map_err(|e| e.to_string())?;

    // Convert image to PNG bytes (screenshots::Image::to_png now returns Vec<u8>)
    let png_bytes = image.to_png().map_err(|e| e.to_string())?;

    // Encode to base64
    let base64_image = general_purpose::STANDARD.encode(&png_bytes);

    Ok(base64_image)
}

#[derive(Serialize, Deserialize)]
struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inline_data: Option<InlineData>,
}

#[derive(Serialize, Deserialize)]
struct InlineData {
    mime_type: String,
    data: String,
}

#[derive(Serialize, Deserialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<Candidate>,
}

#[derive(Deserialize)]
struct Candidate {
    content: Content,
}

#[derive(Deserialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Deserialize)]
struct Part {
    text: String,
}

#[tauri::command]
async fn send_to_gemini(
    message: String,
    image_data: Option<String>,
    api_key: String,
) -> Result<String, String> {
    let mut parts = vec![];

    // Add text part
    parts.push(GeminiPart {
        text: Some(message),
        inline_data: None,
    });

    // Add image part if provided
    if let Some(img_data) = image_data {
        parts.push(GeminiPart {
            text: None,
            inline_data: Some(InlineData {
                mime_type: "image/png".to_string(),
                data: img_data,
            }),
        });
    }

    let request = GeminiRequest {
        contents: vec![GeminiContent { parts }],
    };

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={}",
        api_key
    );

    let response = client
        .post(&url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API error: {}", error_text));
    }

    let gemini_response: GeminiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    gemini_response
        .candidates
        .first()
        .and_then(|c| c.content.parts.first())
        .map(|p| p.text.clone())
        .ok_or_else(|| "No response from Gemini".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, capture_screen, send_to_gemini])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
