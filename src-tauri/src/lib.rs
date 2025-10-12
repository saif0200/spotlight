use base64::{engine::general_purpose, Engine as _};
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_store::StoreBuilder;

#[cfg(target_os = "macos")]
use core_foundation::data::CFData;
#[cfg(target_os = "macos")]
use core_graphics::display::CGDisplay;
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

// Constants
const UNLIMITED_THINKING_BUDGET: i32 = -1;
const GEMINI_API_ENDPOINT: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_ICON_ID: &str = "spotlight-tray";
const MENU_ITEM_SHOW: &str = "tray-show";
const MENU_ITEM_HIDE: &str = "tray-hide";
const MENU_ITEM_QUIT: &str = "tray-quit";
const MENU_ITEM_API_SETTINGS: &str = "menu-api-settings";
const TRAY_TOOLTIP: &str = "Spotlight";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const SETTINGS_STORE_PATH: &str = "settings.json";
const SETTINGS_STORE_KEY: &str = "GEMINI_API_KEY";
const API_KEY_UPDATED_EVENT: &str = "api-key-updated";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiKeyPayload {
    api_key: Option<String>,
}

#[derive(Clone)]
struct TrayMenuState {
    show_item: MenuItem<tauri::Wry>,
    hide_item: MenuItem<tauri::Wry>,
}

impl TrayMenuState {
    fn set_visibility(&self, is_visible: bool) {
        if let Err(err) = self.show_item.set_enabled(!is_visible) {
            eprintln!("Failed to update Show menu item: {err}");
        }
        if let Err(err) = self.hide_item.set_enabled(is_visible) {
            eprintln!("Failed to update Hide menu item: {err}");
        }
    }
}

#[tauri::command]
async fn capture_screen(window: tauri::Window) -> Result<String, String> {
    capture_screen_inner(&window)
}

#[tauri::command]
fn sync_tray_visibility(state: State<'_, TrayMenuState>, visible: bool) {
    state.set_visibility(visible);
}

#[tauri::command]
fn open_api_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn close_api_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.close().map_err(|e| e.to_string())
    } else {
        Ok(())
    }
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

    #[cfg(target_os = "windows")]
    {
        match capture_screen_without_overlay_windows(_window) {
            Ok(png_bytes) => return Ok(general_purpose::STANDARD.encode(png_bytes)),
            Err(err) => {
                eprintln!("Falling back to regular capture: {}", err);
            }
        }
    }

    capture_full_display_base64()
}

fn capture_full_display_png() -> Result<Vec<u8>, String> {
    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.first().ok_or("No screens found")?;

    let image = screen.capture().map_err(|e| e.to_string())?;
    image.to_png().map_err(|e| e.to_string())
}

fn capture_full_display_base64() -> Result<String, String> {
    capture_full_display_png().map(|png_bytes| general_purpose::STANDARD.encode(png_bytes))
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

#[cfg(target_os = "windows")]
fn capture_screen_without_overlay_windows(window: &tauri::Window) -> Result<Vec<u8>, String> {
    use std::{thread, time::Duration};

    let was_visible = window
        .is_visible()
        .map_err(|e| format!("Failed to determine window visibility: {}", e))?;

    if was_visible {
        window
            .hide()
            .map_err(|e| format!("Failed to hide window before capture: {}", e))?;
        // Reduced delay for better UX - modern compositors are fast
        thread::sleep(Duration::from_millis(80));
    }

    let capture_result = capture_full_display_png();

    if was_visible {
        if let Err(err) = window.show() {
            eprintln!("Failed to restore window visibility after capture: {}", err);
        } else {
            // Reduced delay - window redraws quickly on modern systems
            thread::sleep(Duration::from_millis(30));
        }

        if let Err(err) = window.set_focus() {
            eprintln!("Failed to refocus window after capture: {}", err);
        }
    }

    capture_result
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
                thinking_budget: if enabled {
                    UNLIMITED_THINKING_BUDGET
                } else {
                    0
                },
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
    let url = format!("{}?key={}", GEMINI_API_ENDPOINT, api_key);

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
                        web.uri.as_ref().map(|uri| {
                            let title =
                                web.title
                                    .as_ref()
                                    .map(|t| t.to_string())
                                    .unwrap_or_else(|| {
                                        // Fallback to hostname if title not available
                                        uri.split("://")
                                            .nth(1)
                                            .and_then(|s| s.split('/').next())
                                            .unwrap_or(uri)
                                            .to_string()
                                    });
                            SourceInfo {
                                title,
                                uri: uri.to_string(),
                            }
                        })
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

fn show_main_window(app: &AppHandle) {
    if let Err(err) = app.emit("spotlight-show", ()) {
        eprintln!("Failed to emit show event: {err}");
    }
    if let Some(state) = app.try_state::<TrayMenuState>() {
        state.set_visibility(true);
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Err(err) = app.emit("spotlight-hide", ()) {
        eprintln!("Failed to emit hide event: {err}");
    }
    if let Some(state) = app.try_state::<TrayMenuState>() {
        state.set_visibility(false);
    }
}

fn open_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let settings_window = WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("settings.html".into()),
    )
    .title("Spotlight Settings")
    .inner_size(500.0, 320.0)
    .resizable(false)
    .visible(true)
    .decorations(false)
    .transparent(true)
    .center()
    .build()?;

    settings_window.set_focus()?;
    Ok(())
}

fn settings_store(
    app: &AppHandle,
) -> Result<Arc<tauri_plugin_store::Store<tauri::Wry>>, tauri_plugin_store::Error> {
    let store = StoreBuilder::new(app, SETTINGS_STORE_PATH).build()?;
    // ensure cache reflects on-disk contents
    if let Err(err) = store.reload() {
        eprintln!("Failed to reload settings store: {err}");
    }
    Ok(store)
}

fn emit_api_key_update(app: &AppHandle, value: Option<String>) {
    if let Err(err) = app.emit(API_KEY_UPDATED_EVENT, ApiKeyPayload { api_key: value }) {
        eprintln!("Failed to emit API key update event: {err}");
    }
}

#[tauri::command]
fn get_api_key(app: AppHandle) -> Result<Option<String>, String> {
    let store = settings_store(&app).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_STORE_KEY)
        .and_then(|json| json.as_str().map(|s| s.to_string()));
    Ok(value)
}

#[tauri::command]
fn set_api_key(app: AppHandle, api_key: String) -> Result<(), String> {
    let store = settings_store(&app).map_err(|e| e.to_string())?;
    store.set(SETTINGS_STORE_KEY, api_key.clone());
    store.save().map_err(|e| e.to_string())?;
    emit_api_key_update(&app, Some(api_key));
    Ok(())
}

#[tauri::command]
fn clear_api_key(app: AppHandle) -> Result<(), String> {
    let store = settings_store(&app).map_err(|e| e.to_string())?;
    store.delete(SETTINGS_STORE_KEY);
    store.save().map_err(|e| e.to_string())?;
    emit_api_key_update(&app, None);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|app_handle| {
            let api_settings_item = MenuItem::with_id(
                app_handle,
                MENU_ITEM_API_SETTINGS,
                "API Key Settings...",
                true,
                Some("CmdOrCtrl+,"),
            )?;
            #[cfg(target_os = "linux")]
            let quit_item = MenuItem::with_id(
                app_handle,
                MENU_ITEM_QUIT,
                "Quit Spotlight",
                true,
                Some("CmdOrCtrl+Q"),
            )?;
            #[cfg(not(target_os = "linux"))]
            let quit_item = PredefinedMenuItem::quit(app_handle, Some("Quit Spotlight"))?;

            let spotlight_menu = SubmenuBuilder::with_id(
                app_handle,
                "spotlight-app-menu",
                "Spotlight",
            )
                .item(&api_settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app_handle, "Edit")
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            MenuBuilder::new(app_handle)
                .item(&spotlight_menu)
                .item(&edit_menu)
                .build()
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_ITEM_API_SETTINGS => {
                if let Err(err) = open_settings_window(app) {
                    eprintln!("Failed to open settings window from menu: {err}");
                }
            }
            MENU_ITEM_QUIT => app.exit(0),
            _ => {}
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Accessory);

            let handle = app.handle();

            let tray_menu = {
                let menu = Menu::new(handle)?;
                let show_item = MenuItem::with_id(
                    handle,
                    MENU_ITEM_SHOW,
                    "Show Spotlight",
                    true,
                    None::<&str>,
                )?;
                let hide_item = MenuItem::with_id(
                    handle,
                    MENU_ITEM_HIDE,
                    "Hide Spotlight",
                    true,
                    None::<&str>,
                )?;
                let settings_item = MenuItem::with_id(
                    handle,
                    MENU_ITEM_API_SETTINGS,
                    "API Key Settings...",
                    true,
                    None::<&str>,
                )?;
                let quit_item = MenuItem::with_id(
                    handle,
                    MENU_ITEM_QUIT,
                    "Quit Spotlight",
                    true,
                    None::<&str>,
                )?;
                menu.append(&show_item)?;
                menu.append(&hide_item)?;
                menu.append(&settings_item)?;
                menu.append(&PredefinedMenuItem::separator(handle)?)?;
                menu.append(&quit_item)?;
                let tray_state = TrayMenuState {
                    show_item: show_item.clone(),
                    hide_item: hide_item.clone(),
                };
                tray_state.set_visibility(false);
                app.manage(tray_state);
                menu
            };

            let mut tray_builder = TrayIconBuilder::with_id(TRAY_ICON_ID)
                .tooltip(TRAY_TOOLTIP)
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app_handle, event| match event.id().as_ref() {
                    MENU_ITEM_SHOW => show_main_window(app_handle),
                    MENU_ITEM_HIDE => hide_main_window(app_handle),
                    MENU_ITEM_API_SETTINGS => {
                        if let Err(err) = open_settings_window(app_handle) {
                            eprintln!("Failed to open settings window from tray: {err}");
                        }
                    }
                    MENU_ITEM_QUIT => app_handle.exit(0),
                    _ => {}
                });

            if let Some(default_icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(default_icon);
            }

            #[cfg(target_os = "macos")]
            {
                tray_builder = tray_builder.icon_as_template(true);
            }

            let tray_icon = tray_builder.build(app)?;
            app.manage(tray_icon);

            if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = main_window.hide();
                let window_for_event = main_window.clone();
                let app_handle_for_event = handle.clone();
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Err(err) = window_for_event.hide() {
                            eprintln!("Failed to hide window on close request: {err}");
                        }
                        hide_main_window(&app_handle_for_event);
                    }
                });
            }

            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::{apply_acrylic, apply_blur};

                if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    if apply_acrylic(&window, Some((255, 255, 255, 125))).is_err() {
                        let _ = apply_blur(&window, Some((255, 255, 255, 125)));
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            send_to_gemini,
            sync_tray_visibility,
            open_api_settings_window,
            close_api_settings_window,
            get_api_key,
            set_api_key,
            clear_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
