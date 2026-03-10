Warehouse Scanner Backend

Run
1) python -m venv .venv
2) source .venv/bin/activate
3) pip install -r requirements.txt
4) python -m uvicorn main:app --reload

Environment (.env)
- SERVER_HOST
- SERVER_PORT (default: 8059)
- SERVER_DEBUG
- CATALOG_PATH (default: data/catalog.xlsx)
- BARCODE_COLUMN (default: barcode)
- SERIAL_PORT (default: /dev/tty.usbserial-10)
- SERIAL_BAUDRATE (default: 9600)
- SERIAL_TIMEOUT (default: 0.1)
- SERIAL_RECONNECT_DELAY (default: 2.0)
- SQLITE_DB_PATH (default: data/scanner.sqlite)
- SESSIONS_EXPORT_DIR (default: data/sessions)
- WS_PATH (default: /ws)
- CORS_ALLOW_ORIGINS (default: *)

Endpoints
- GET /health
- POST /catalog/upload
- GET /catalog/meta
- POST /session/start
- POST /session/stop
- GET /session/status
- GET /session/items
- WS /ws (default on 8059)
