# ⚡ Watt Do We Have Here

A home energy monitoring application for tracking and analysing power consumption via a **Shelly 1PM Mini Gen3** smart switch.

**Stack:** React (Vite) · Python FastAPI · SQLite

---

## Features

| Section | What it does |
|---|---|
| **Control Panel** | Large ON/OFF toggle, ECO / FULL mode selector, uptime display |
| **Live Metrics** | Power gauge (0 – 2 000 W), voltage, current, today's kWh — refreshes every 5 s |
| **Energy Chart** | Recharts time-series; 1 h / 24 h / 7 d / 30 d / custom range; ECO vs FULL overlay |
| **Insights** | Avg consumption by mode, monthly cost estimator, CO₂ equivalent, peak-hours heatmap |

---

## Project Structure

```
watt-do-we-have-here/
├── backend/
│   ├── main.py          ← FastAPI app
│   ├── collector.py     ← background Shelly poller (every 30 s)
│   ├── database.py      ← SQLite helpers
│   ├── models.py        ← Pydantic models
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ControlPanel.jsx
│   │   │   ├── PowerGauge.jsx
│   │   │   ├── EnergyChart.jsx
│   │   │   └── MetricsPanel.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Shelly 1PM Mini Gen3 reachable on your local network

---

### 1. Backend

```bash
cd backend

# Copy and edit the environment file
cp .env.example .env
# Edit .env and set SHELLY_IP to your device's IP address

# Create a virtual environment and install dependencies
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (proxies /api → localhost:8000)
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | Live Shelly status (power, voltage, current, kWh, switch state) |
| POST | `/api/switch` | Toggle switch `{"state": true}` |
| GET | `/api/readings` | Historical readings with `?from=&to=&mode=&limit=` filters |
| GET | `/api/insights` | Aggregated metrics with `?price_per_kwh=0.22` |
| POST | `/api/mode` | Set operating mode `{"mode": "ECO"}` |
| GET | `/api/mode` | Get current mode |

---

## Environment Variables

Create `backend/.env` (see `.env.example`):

```env
SHELLY_IP=192.168.1.100   # IP of your Shelly device
POLL_INTERVAL=30           # Polling interval in seconds
```

---

## Database

SQLite file: `backend/energy.db` (auto-created on first run).

```sql
CREATE TABLE readings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp    DATETIME NOT NULL,
  power_watts  REAL NOT NULL,
  voltage      REAL NOT NULL,
  current_amps REAL NOT NULL,
  total_kwh    REAL NOT NULL,
  switch_state BOOLEAN NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'FULL'
);
```

---

## CO₂ Calculation

Based on the Portuguese electricity grid carbon intensity of **0.25 kg CO₂/kWh**.

---

## License

MIT
