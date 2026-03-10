# Barcode Reader

## Список технологий

- Frontend: React 18 + TypeScript + Vite
- Backend: FastAPI + Pydantic + Uvicorn
- База данных: SQLite + SQLAlchemy (async)
- Работа с Excel: openpyxl
- Работа со сканером: pyserial
- Реалтайм: WebSocket (`/ws`)
- Desktop-обвязка: Electron

## Памятка по запуску

### 1) Запуск backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --host localhost --port 8059
```

### 2) Запуск frontend

```bash
# из корня проекта
npm install
npm run dev
```

Frontend по умолчанию работает с backend `http://localhost:8059` и WebSocket `ws://localhost:8059/ws`.

### 3) Сборка web-версии

```bash
npm run build:web
```

## Скриншот стартовой страницы

> В этом окружении не удалось автоматически снять реальный UI-скриншот (ограничения песочницы), поэтому приложен шаблонный слайд. Перед финальной сдачей замените его на фактический скрин стартовой страницы приложения.

![Стартовая страница приложения](../docs/start-page-placeholder.svg)

