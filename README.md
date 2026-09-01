# SynapTwin | Community Energy Flexibility & Shared-Battery Digital Twin

[![Live Production Demo](https://img.shields.io/badge/Live_Demo-synaptwin.onrender.com-brightgreen?style=for-the-badge&logo=render&logoColor=white)](https://synaptwin.onrender.com/)
[![React 19](https://img.shields.io/badge/Frontend-React_19_%2B_Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://synaptwin.onrender.com/)
[![Flask](https://img.shields.io/badge/Backend-Flask_REST_API-4B8BBE?style=for-the-badge&logo=flask&logoColor=white)](https://synaptwin.onrender.com/)

> 🌐 **Live Website URL:** [https://synaptwin.onrender.com/](https://synaptwin.onrender.com/)

SynapTwin is an institutional-scale digital twin and microgrid orchestration platform designed for the Siksha 'O' Anusandhan (SOA) ITER Campus in Bhubaneswar, Odisha. The system coordinates rooftop solar generation across 16 buildings, a shared 120 kW / 360 kWh second-life EV battery energy storage system (BESS), and a campus-wide fleet of 12 shared electric scooters (driEV).

## Repository Architecture

```
/
├── s24_backend/                # Flask REST API, optimization & simulation engine
│   ├── server.py               # Main Flask application & static file server
│   ├── requirements.txt        # Production Python dependencies
│   ├── data/                   # Open-Meteo, NASA POWER, OSM geo & load models
│   ├── optimizer/              # Max-Min LP, disaster triage, battery health, driEV fleet
│   ├── explainability/         # Gemini LLM & deterministic natural language explainer
│   └── security/               # Fernet AES-128-CBC + HMAC-SHA256 privacy vault
│
├── s24_frontend/               # React 19 / Vite dashboard application
│   ├── package.json            # Node.js dependencies & build scripts
│   ├── vite.config.js          # Vite configuration & dev proxy
│   ├── src/                    # React components, spatial map, charts, sandbox
│   └── public/                 # Static assets & icons
│
├── SynapTwin_Current_PRD.md    # Canonical Product Requirements Document
├── SynapTwin_Current_PRD.pdf   # Formatted PDF specification document
├── render.yaml                 # Render.com Infrastructure-as-Code blueprint
└── .gitignore                  # Git ignore rules
```

## Quick Start (Local Development)

### 1. Backend Server (Flask)
```bash
cd s24_backend
pip install -r requirements.txt
python server.py
# Running on http://127.0.0.1:5000
```

### 2. Frontend Application (Vite Dev Server)
```bash
cd s24_frontend
npm install
npm run dev
# Running on http://localhost:3000 (proxies /api -> http://localhost:5000)
```

## Production Deployment on Render.com

SynapTwin is architected for unified single-service web deployment on Render.com:

- **Build Command:**
  ```bash
  cd s24_frontend && npm install && npm run build && cd ../s24_backend && pip install -r requirements.txt
  ```
- **Start Command:**
  ```bash
  cd s24_backend && gunicorn server:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120
  ```
- **Environment Variables:**
  - `PYTHON_VERSION`: `3.14.3`
  - `GEMINI_API_KEY`: *(Optional)* Google Gemini API key for live AI natural language explainability. If omitted, SynapTwin automatically falls back to its deterministic rule-based explainer.
  - `FERNET_SECRET_KEY`: *(Optional)* Fernet key for encrypting smart meter telemetry. If omitted, a fresh key is generated at startup.
