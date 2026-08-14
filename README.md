# Ustaad's Eye 👁️ — Dropout Risk Early Warning System

An AI-powered Progressive Web App that helps Pakistani school teachers detect students at risk of dropping out — before it's too late.

## Tech Stack
- **Backend**: Python + FastAPI + SQLite
- **AI**: Google Gemini API (multi-signal risk analysis + intervention drafts)
- **Frontend**: React + Vite (PWA — installable, works offline)

## Quick Start

### 1. Set your Gemini API Key
Edit `backend/.env`:
```
GEMINI_API_KEY=your_actual_key_here
```
Get a free key at: https://aistudio.google.com/app/apikey

### 2. Launch the app (Windows)
Double-click **`start.bat`** — it starts both servers automatically!

Or manually:
```bash
# Terminal 1 — Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### 3. Open the app
- **App**: http://localhost:5173
- **API Docs**: http://localhost:8000/docs

## Features
- 📊 **Dashboard** — Color-coded risk cards for all students (HIGH/MEDIUM/LOW)
- 🤖 **AI Analysis** — Gemini analyzes attendance + scores + fee trends together
- ⚠️ **Interventions** — AI drafts parent SMS, counselor alerts, and meeting agendas
- ✏️ **Log Entry** — Easy forms to log attendance, test scores, fee status
- 📱 **PWA** — Install from browser, works offline
- 🎭 **Demo Data** — 6 pre-seeded students including Amina (HIGH risk)

## Pre-loaded Students
| Name | Risk | Issue |
|------|------|-------|
| Amina Bibi | 🔴 HIGH | 52% attendance, failing scores, 2 months fee overdue |
| Hina Akhtar | 🔴 HIGH | 25% attendance, very low scores, 3 months overdue |
| Zainab Khatoon | 🟡 MEDIUM | 55% attendance, declining scores |
| Sara Naz | 🟡 MEDIUM | Fee delays starting |
| Nadia Parveen | 🟢 LOW | Mostly on track |
| Fatima Zahra | 🟢 LOW | Top performer |
