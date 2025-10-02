use base64::{engine::general_purpose, Engine as _};
use screenshots::Screen;
use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
use core_foundation::data::CFData;
#[cfg(target_os = "macos")]
use core_graphics::display::CGDisplay;
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn capture_screen(window: tauri::Window) -> Result<String, String> {
    capture_screen_inner(&window)
}

fn capture_screen_inner(_window: &tauri::Window) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        match capture_screen_without_overlay_mac(_window) {
            Ok(png_bytes) => return Ok(general_purpose::STANDARD.encode(png_bytes)),
            Err(err) => {
                eprintln!("Falling back to regular capture: {}", err);
            }
        }
    }

    capture_full_display_base64()
}

fn capture_full_display_base64() -> Result<String, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.first().ok_or("No screens found")?;

    let image = screen.capture().map_err(|e| e.to_string())?;
    let png_bytes = image.to_png().map_err(|e| e.to_string())?;

    Ok(general_purpose::STANDARD.encode(&png_bytes))
}

#[cfg(target_os = "macos")]
fn capture_screen_without_overlay_mac(window: &tauri::Window) -> Result<Vec<u8>, String> {
    use core_graphics::window::{
        create_image, kCGWindowImageDefault, kCGWindowListOptionOnScreenBelowWindow,
    };
    use objc::runtime::Object;
    use png::{BitDepth, ColorType, Encoder};

    let ns_window_ptr = window
        .ns_window()
        .map_err(|e| format!("Failed to access native window: {}", e))?;
    let ns_window = ns_window_ptr as *mut Object;

    #[allow(unexpected_cfgs)]
    let window_number: u32 = unsafe { msg_send![ns_window, windowNumber] };

    let bounds = CGDisplay::main().bounds();
    let cg_image = create_image(
        bounds,
        kCGWindowListOptionOnScreenBelowWindow,
        window_number,
        kCGWindowImageDefault,
    )
    .ok_or_else(|| "CGWindowListCreateImage returned null".to_string())?;

    let width = cg_image.width() as usize;
    let height = cg_image.height() as usize;
    let bytes_per_row = cg_image.bytes_per_row() as usize;

    let cf_data: CFData = cg_image.data();
    let data: &[u8] = cf_data.as_ref();

    if data.len() < bytes_per_row * height {
        return Err("Unexpected pixel buffer length".to_string());
    }

    let mut rgba = vec![0u8; width * height * 4];
    for y in 0..height {
        let src_offset = y * bytes_per_row;
        let dst_offset = y * width * 4;
        let src_row = &data[src_offset..src_offset + width * 4];
        let dst_row = &mut rgba[dst_offset..dst_offset + width * 4];

        for (dst_px, src_px) in dst_row.chunks_exact_mut(4).zip(src_row.chunks_exact(4)) {
            // Convert BGRA -> RGBA
            dst_px[0] = src_px[2];
            dst_px[1] = src_px[1];
            dst_px[2] = src_px[0];
            dst_px[3] = src_px[3];
        }
    }

    let mut png_bytes = Vec::new();
    {
        let mut encoder = Encoder::new(&mut png_bytes, width as u32, height as u32);
        encoder.set_color(ColorType::Rgba);
        encoder.set_depth(BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("Failed to write PNG header: {}", e))?;
        writer
            .write_image_data(&rgba)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;
    }

    Ok(png_bytes)
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
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
struct GoogleSearch {}

#[derive(Serialize, Deserialize)]
struct Tool {
    #[serde(skip_serializing_if = "Option::is_none")]
    google_search: Option<GoogleSearch>,
}

#[derive(Serialize, Deserialize)]
struct ThinkingConfig {
    #[serde(rename = "thinkingBudget")]
    thinking_budget: i32,
}

#[derive(Serialize, Deserialize)]
struct GenerationConfig {
    #[serde(rename = "thinkingConfig")]
    thinking_config: ThinkingConfig,
}

#[derive(Serialize, Deserialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "generationConfig")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Deserialize, Serialize, Clone)]
struct WebInfo {
    uri: Option<String>,
    title: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
struct GroundingChunk {
    web: Option<WebInfo>,
}

#[derive(Deserialize, Serialize, Clone)]
struct GroundingMetadata {
    #[serde(rename = "groundingChunks")]
    grounding_chunks: Option<Vec<GroundingChunk>>,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<Candidate>,
    #[serde(rename = "groundingMetadata")]
    grounding_metadata: Option<GroundingMetadata>,
}

#[derive(Deserialize)]
struct Candidate {
    content: Content,
    #[serde(rename = "groundingMetadata")]
    grounding_metadata: Option<GroundingMetadata>,
}

#[derive(Deserialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Deserialize)]
struct Part {
    text: String,
}

#[derive(Serialize, Clone)]
struct SourceInfo {
    title: String,
    uri: String,
}

#[derive(Serialize)]
struct GeminiResult {
    text: String,
    sources: Option<Vec<SourceInfo>>,
}

#[tauri::command]
async fn send_to_gemini(
    message: String,
    image_data: Option<String>,
    api_key: String,
    grounding_enabled: Option<bool>,
    thinking_enabled: Option<bool>,
    chat_history: Vec<ChatMessage>,
) -> Result<String, String> {
    // Build conversation history
    let mut contents: Vec<GeminiContent> = chat_history
        .iter()
        .map(|msg| {
            let role = if msg.role == "assistant" {
                "model".to_string()
            } else {
                msg.role.clone()
            };
            GeminiContent {
                role,
                parts: vec![GeminiPart {
                    text: Some(msg.content.clone()),
                    inline_data: None,
                }],
            }
        })
        .collect();

    // Add current message with optional image
    let mut current_parts = vec![GeminiPart {
        text: Some(message),
        inline_data: None,
    }];

    // Add image part if provided
    if let Some(img_data) = image_data {
        current_parts.push(GeminiPart {
            text: None,
            inline_data: Some(InlineData {
                mime_type: "image/png".to_string(),
                data: img_data,
            }),
        });
    }

    contents.push(GeminiContent {
        role: "user".to_string(),
        parts: current_parts,
    });

    let tools = if grounding_enabled.unwrap_or(false) {
        Some(vec![Tool {
            google_search: Some(GoogleSearch {}),
        }])
    } else {
        None
    };

    let generation_config = if let Some(enabled) = thinking_enabled {
        Some(GenerationConfig {
            thinking_config: ThinkingConfig {
                thinking_budget: if enabled { -1 } else { 0 },
            },
        })
    } else {
        None
    };

    let request = GeminiRequest {
        contents,
        tools,
        generation_config,
    };

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={}",
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

    let text = gemini_response
        .candidates
        .first()
        .and_then(|c| c.content.parts.first())
        .map(|p| p.text.clone())
        .ok_or_else(|| "No response from Gemini".to_string())?;

    // Extract sources from grounding metadata
    let sources = gemini_response
        .candidates
        .first()
        .and_then(|c| c.grounding_metadata.as_ref())
        .or(gemini_response.grounding_metadata.as_ref())
        .and_then(|metadata| metadata.grounding_chunks.as_ref())
        .map(|chunks| {
            chunks
                .iter()
                .filter_map(|chunk| {
                    chunk.web.as_ref().and_then(|web| {
                        let uri = web.uri.clone()?;
                        let title = web.title.clone().unwrap_or_else(|| {
                            // Fallback to hostname if title not available
                            uri.split("://")
                                .nth(1)
                                .and_then(|s| s.split('/').next())
                                .unwrap_or(&uri)
                                .to_string()
                        });
                        Some(SourceInfo { title, uri })
                    })
                })
                .collect::<Vec<SourceInfo>>()
        });

    let result = GeminiResult {
        text,
        sources: if sources.as_ref().map_or(false, |s| !s.is_empty()) {
            sources
        } else {
            None
        },
    };

    serde_json::to_string(&result).map_err(|e| format!("Failed to serialize result: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            capture_screen,
            send_to_gemini
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
