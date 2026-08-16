# CALAMOX ULTRON - MULTI-DEVICE OS & HOLOGRAPHIC JARVIS ENGINE
====================================================================================================
SYSTEM ARCHITECTURE & PRODUCTION CODING DIRECTIVES
====================================================================================================

You are tasked with building "Calamox Ultron" - a true Iron Man class local OS assistant, 
Multi-Device Controller (Android ADB Bridge), Holographic 3D Viewport HUD, and Automated Desktop Agent.

DO NOT build a simple web chatbot. Build an integrated Desktop App (FastAPI + Next.js + PyAutoGUI + ADB) 
capable of physical system control, screen perception, multi-phone automation, and 3D Model Rendering.

----------------------------------------------------------------------------------------------------
1. CORE CAPABILITIES TO IMPLEMENT
----------------------------------------------------------------------------------------------------
1. Multi-Device Control Engine (ADB over Wi-Fi / WebSockets):
   - Pair local Android devices via QR Code / IP Address.
   - Command batch execution: Send parallel ADB commands (`adb shell input keyevent 26`, unlock screen, trigger intent apps, sync audio playback across all connected phones).

2. 3D Holographic Viewport Canvas (Three.js / React Three Fiber):
   - Center UI contains a glowing holographic orange/blue particle reactor.
   - Real-time 3D Model Viewer (`.gltf` / `.glb` renderer) inside the HUD to load assets like Iron Man Mark 85 or custom CAD files upon voice/text query.

3. OS App Automation & Computer Control Engine:
   - Control native desktop software: Notepad, WhatsApp Web/Desktop (auto-message sending), File Explorer (auto-organize Downloads by file extension).
   - Instant Document Generation: Auto-generate PowerPoint (.pptx) presentations and Excel (.xlsx) spreadsheets on demand via python background tasks.

4. Screen Perception & Camera Vision Engine:
   - Capture active desktop screenshot or webcam feed.
   - Analyze screen content using Gemini / Qwen VL / Ollama multimodal models and speak back live insights.
   - Audio Clap / Hand Gesture listener using OpenCV / PyAudio to trigger HUD states.

5. Multilingual Voice & Audio Interactivity:
   - Real-time Speech Recognition supporting Native English, Hindi, and Hinglish.
   - Synthesis via Edge-TTS / Whisper for natural human-like voice response without robotic glitches.

----------------------------------------------------------------------------------------------------
2. FRONTEND UI/UX DESIGN (JARVIS SPARK & BRAHMA ECHO HYBRID)
----------------------------------------------------------------------------------------------------
- Theme: Deep Pitch Black (`#050508`), Glowing Amber/Orange (`#FF6B00`) & Electric Blue (`#00D2FF`) holographic accents.
- Layout Architecture:
  a. Left Panel (Fixed Width 320px): Task Manager, Local System Health Logs, Connected Devices Status (Phone 1, Phone 2, Phone 3 with IP status indicators).
  b. Center Panel (Flex 1): 3D Viewport Canvas with interactive Three.js Hologram, audio pulse frequency waves, and 3D Asset projection window.
  c. Right Panel (Resizable Width 360px - 600px): Multilingual Voice/Chat Console, Slash `/` Command Menu, and Live Terminal Logs / Screen Perception preview.

----------------------------------------------------------------------------------------------------
3. REPOSITORY DIRECTORY STRUCTURE
----------------------------------------------------------------------------------------------------
calamox/
├── install.sh
├── setup.py
├── calamox/
│   ├── cli.py                       # Big ASCII Banner & FastAPi Server Boot
│   ├── backend/
│   │   ├── main.py                  # FastAPI + WebSocket Orchestrator
│   │   ├── adb_device_manager.py    # Multi-Device Android ADB Control
│   │   ├── os_automation.py         # PyAutoGUI, App Launcher, File Organizer
│   │   ├── doc_generator.py         # Automated PPTX & XLSX generation
│   │   ├── vision_engine.py         # Screen Analysis & Webcam Gesture Detection
│   │   ├── tts_stt_engine.py        # Edge-TTS / Whisper Multilingual Voice
│   │   ├── agent_router.py          # Intent Router (Task vs OS Command vs Vision)
│   │   └── agents_config.json
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   │   ├── Viewport3DCanvas.jsx   # Three.js 3D Model & Particles Viewer
│       │   │   ├── DevicesPanel.jsx       # Multi-Phone Status & Controls
│       │   │   ├── ChatVoiceConsole.jsx   # Hinglish Chat & Audio Wave
│       │   │   └── VisionPreview.jsx      # Live Screen & Camera Overlay
│       │   └── pages/
└── plugins/
    └── adb_scripts/

----------------------------------------------------------------------------------------------------
EXECUTION INSTRUCTION FOR CODING AGENT:
Generate complete, production-ready code for all components. Wire every front-end control button and voice command directly to the backend Python modules (ADB commands, PyAutoGUI, Three.js loader, and Document generator). Ensure zero fake text mocks.