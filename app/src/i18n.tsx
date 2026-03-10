import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "ru" | "en";

const STORAGE_KEY = "barcode_reader_ui_language";

const messages: Record<Language, Record<string, string>> = {
  ru: {
    "lang.ru": "RU",
    "lang.en": "EN",

    "common.close": "Закрыть",
    "common.cancel": "Отмена",
    "common.confirm": "Подтвердить",
    "common.refresh": "Обновить",
    "common.loading": "Загрузка...",
    "common.saving": "Сохранение...",
    "common.search": "Поиск...",
    "common.notAvailable": "—",
    "theme.toDark": "Темная тема",
    "theme.toLight": "Светлая тема",

    "connection.disconnected": "Соединение отсутствует",
    "connection.connecting": "Подключение...",
    "connection.connected": "Соединение установлено",
    "connection.error": "Ошибка соединения",

    "app.openSettings": "Настройки",
    "app.openHistory": "История сессий",
    "app.startScan": "Начать сканирование",
    "app.stopScan": "Завершить сканирование",
    "app.catalogMissing": "Каталог не загружен. Загрузите его в настройках.",
    "app.lastExport": "Последний экспорт: {path}",
    "app.lastScannedProduct": "Последний отсканированный товар",
    "app.undoLastScan": "Отменить последний скан",
    "app.undoing": "Отмена...",
    "app.undoLastScanToast": "Последний скан отменен.",
    "app.confirmActionTitle": "Подтвердите действие",
    "app.confirmUndoLastScan": "Подтвердите: отменить последний скан?",
    "app.confirmDecrementItem": "Подтвердите: уменьшить количество товара \"{name}\" на 1?",
    "app.confirmRemoveItem": "Подтвердите: удалить товар \"{name}\" (кол-во: {quantity})?",
    "app.confirmDecrementUnknownItem":
      "Подтвердите: уменьшить количество нераспознанного баркода {barcode} на 1?",
    "app.confirmRemoveUnknownItem":
      "Подтвердите: удалить нераспознанный баркод {barcode}?",
    "app.confirmCloseSession":
      "Подтвердите: закрыть сессию? Все изменения текущей сессии будут отменены и не сохранятся.",
    "app.waitingFirstScan": "Ожидание первого скана...",
    "app.barcode": "Barcode",
    "app.quantity": "Количество",
    "app.totalScans": "Всего сканов",
    "app.totalUnique": "Уникальных",
    "app.totalUnknown": "Нераспознанных",
    "app.sessionProducts": "Товары в сессии",
    "app.unknownBarcodes": "Нераспознанные баркоды",
    "app.positionsCount": "{count} позиций",
    "app.sessionListAfterScans": "Список появится после первых сканов.",
    "app.unknownListAfterScans": "Нераспознанные баркоды появятся после первых сканов.",
    "app.expandItem": "Развернуть товар {name}",
    "app.collapseItem": "Свернуть товар {name}",
    "app.decrement": "-1",
    "app.delete": "Удалить",
    "app.loadingProduct": "Загрузка товара...",
    "app.noProductData": "Нет данных по товару.",
    "app.itemUpdating": "Обновление позиции...",
    "app.closeSession": "Закрыть сессию",
    "app.itemChangedToast": "Позиция изменена: {barcode} (-{quantity})",
    "app.undo": "Отменить",
    "app.barcodeNotFound": "Баркод {barcode} не найден в базе",
    "app.toastScannerFound": "Сканнер найден, порт {port} сохранен.",
    "app.toastSerialSaved": "Serial-настройки сохранены ({port}).",
    "app.toastSmtpSaved": "SMTP-настройки сохранены.",
    "app.toastSmtpSavedDisabled": "SMTP-настройки сохранены, рассылка отключена.",
    "app.toastCatalogDownloaded": "Каталог выгружен.",
    "app.toastReportsSaved": "Папка отчетов сохранена.",

    "settings.title": "Настройки",
    "settings.serial.section": "Сканер (Serial)",
    "settings.serial.loading": "Загрузка serial-настроек...",
    "settings.serial.enabled": "Включить сканер",
    "settings.serial.port": "Serial Port",
    "settings.serial.baudrate": "Baudrate",
    "settings.serial.timeout": "Timeout (sec)",
    "settings.serial.reconnectDelay": "Reconnect delay (sec)",
    "settings.serial.findScanner": "Найти сканнер",
    "settings.serial.save": "Сохранить Serial",

    "settings.catalog.section": "Каталог",
    "settings.catalog.status": "Состояние",
    "settings.catalog.loaded": "Загружен",
    "settings.catalog.notLoaded": "Не загружен",
    "settings.catalog.items": "Позиций",
    "settings.catalog.newFile": "Новый файл каталога (.xlsx)",
    "settings.catalog.upload": "Загрузить каталог",
    "settings.catalog.uploading": "Загрузка...",
    "settings.catalog.download": "Выгрузить каталог",
    "settings.catalog.downloading": "Выгрузка...",
    "settings.catalog.delete": "Удалить каталог",
    "settings.catalog.deleting": "Удаление...",

    "settings.email.section": "Email рассылка отчётов",
    "settings.email.loading": "Загрузка SMTP-настроек...",
    "settings.email.enabled": "Включить отправку отчётов на почту",
    "settings.email.host": "SMTP Host",
    "settings.email.port": "Port",
    "settings.email.username": "Username",
    "settings.email.password": "Password",
    "settings.email.passwordKeep": "(оставьте пустым, чтобы не менять)",
    "settings.email.passwordRequired": "(обязателен при логине)",
    "settings.email.from": "From email",
    "settings.email.to": "To emails (через запятую)",
    "settings.email.subject": "Тема письма",
    "settings.email.body": "Текст письма",
    "settings.email.refresh": "Обновить SMTP",
    "settings.email.test": "Проверить соединение",
    "settings.email.testing": "Проверка...",
    "settings.email.save": "Сохранить SMTP",

    "settings.reports.section": "Отчеты",
    "settings.reports.loading": "Загрузка настроек отчетов...",
    "settings.reports.outputDir": "Папка для сохранения отчетов",
    "settings.reports.save": "Сохранить папку",

    "serial.status.saved": "Serial-настройки сохранены. Статус сканера: {status}.",
    "serial.status.disabled": "Сканер отключен.",
    "serial.status.running": "запущен",
    "serial.status.stopped": "остановлен",
    "serial.status.detected": "Сканнер найден: {port}. Баркод: {barcode}. Настройки обновлены.",

    "email.status.saved": "SMTP-настройки сохранены, соединение проверено.",
    "email.status.disabled": "Рассылка отключена.",
    "email.status.tested": "Проверка SMTP выполнена.",

    "history.title": "История сессий",
    "history.sessions": "Сессии ({count})",
    "history.loading": "Загрузка истории...",
    "history.empty": "Пока нет завершенных сессий.",
    "history.session": "Сессия #{id}",
    "history.sessionLabel": "Сессия",
    "history.scansUnique": "{totalItems} сканов / {totalUnique} уникальных / {totalUnknown} НД",
    "history.selectSession": "Выберите сессию, чтобы увидеть детали.",
    "history.loadingDetails": "Загрузка деталей...",
    "history.startedAt": "Начало",
    "history.finishedAt": "Окончание",
    "history.continue": "Продолжить",
    "history.excel": "Excel",
    "history.openFileLocation": "Открыть расположение файла",
    "history.openFileUnsupported": "Доступно только в desktop-приложении",
    "history.openFileError": "Не удалось открыть расположение файла.",
    "history.positions": "Позиции",
    "history.sessionHasNoItems": "В этой сессии нет товаров.",
    "history.unknown": "Нераспознанные баркоды",
    "history.noUnknown": "В этой сессии нет нераспознанных баркодов.",

    "hero.title": "Сканирование товаров",
    "hero.description":
      "Центральная точка контроля: запускайте сессию и отслеживайте поток сканов в реальном времени.",
    "hero.catalogHint": "Каталог не загружен. Откройте настройки и загрузите Excel.",
    "hero.status": "Статус",
    "hero.statusActive": "Активна",
    "hero.statusInactive": "Не активна",
    "hero.start": "Начало",

    "basket.title": "Текущая корзина",
    "basket.inactiveHint": "Сессия не активна. Запустите сканирование.",
    "basket.empty": "Пока нет сканов.",
    "basket.units": "шт.",

    "feed.lastEvent": "Последнее событие",
    "feed.waiting": "Ожидание событий...",
    "feed.time": "Время",
    "feed.type": "Тип",
    "feed.tape": "Лента событий",
    "feed.empty": "История появится после первых сообщений.",
    "feed.object": "объект",

    "session.emailSent": "Отчет отправлен на email.",
    "session.emailFailed": "Отчет сохранен, но отправка email завершилась ошибкой.",
    "session.emailDisabled": "Рассылка отчетов отключена.",

    "error.session": "Ошибка сессии",
    "error.sessionStart": "Ошибка запуска сессии",
    "error.sessionResume": "Ошибка возобновления сессии",
    "error.sessionStop": "Ошибка остановки сессии",
    "error.sessionCancel": "Ошибка отмены сессии",
    "error.sessionDecrement": "Ошибка уменьшения количества",
    "error.sessionRemove": "Ошибка удаления позиции",
    "error.sessionRestore": "Ошибка восстановления позиции",
    "error.sessionUndo": "Ошибка отмены последнего скана",
    "error.catalogLoad": "Ошибка загрузки каталога",
    "error.catalogUpload": "Ошибка загрузки файла",
    "error.catalogDelete": "Ошибка удаления каталога",
    "error.catalogDownload": "Ошибка выгрузки каталога",
    "error.historyLoad": "Ошибка загрузки истории",
    "error.historyDetails": "Ошибка загрузки деталей сессии",
    "error.productLoad": "Ошибка загрузки товара",
    "error.serialLoad": "Ошибка загрузки serial-настроек",
    "error.serialSave": "Ошибка сохранения serial-настроек",
    "error.serialDetect": "Ошибка автоопределения сканнера",
    "error.emailLoad": "Ошибка загрузки email-настроек",
    "error.emailSave": "Ошибка сохранения email-настроек",
    "error.emailTest": "Ошибка проверки SMTP",
    "error.reportsLoad": "Ошибка загрузки настроек отчетов",
    "error.reportsSave": "Ошибка сохранения папки отчетов",
    "error.reportsPathRequired": "Папка для отчетов обязательна",
  },
  en: {
    "lang.ru": "RU",
    "lang.en": "EN",

    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.refresh": "Refresh",
    "common.loading": "Loading...",
    "common.saving": "Saving...",
    "common.search": "Searching...",
    "common.notAvailable": "—",
    "theme.toDark": "Dark theme",
    "theme.toLight": "Light theme",

    "connection.disconnected": "Disconnected",
    "connection.connecting": "Connecting...",
    "connection.connected": "Connected",
    "connection.error": "Connection error",

    "app.openSettings": "Settings",
    "app.openHistory": "Session history",
    "app.startScan": "Start scanning",
    "app.stopScan": "Finish scanning",
    "app.catalogMissing": "Catalog is not loaded. Upload it in settings.",
    "app.lastExport": "Last export: {path}",
    "app.lastScannedProduct": "Last scanned product",
    "app.undoLastScan": "Undo last scan",
    "app.undoing": "Undoing...",
    "app.undoLastScanToast": "Last scan has been undone.",
    "app.confirmActionTitle": "Confirm action",
    "app.confirmUndoLastScan": "Confirm undo of the last scan?",
    "app.confirmDecrementItem": "Confirm decrement for \"{name}\" by 1?",
    "app.confirmRemoveItem": "Confirm delete for \"{name}\" (qty: {quantity})?",
    "app.confirmDecrementUnknownItem":
      "Confirm decrement for unknown barcode {barcode} by 1?",
    "app.confirmRemoveUnknownItem":
      "Confirm delete for unknown barcode {barcode}?",
    "app.confirmCloseSession":
      "Confirm closing the session? All current session changes will be discarded and not saved.",
    "app.waitingFirstScan": "Waiting for the first scan...",
    "app.barcode": "Barcode",
    "app.quantity": "Quantity",
    "app.totalScans": "Total scans",
    "app.totalUnique": "Unique",
    "app.totalUnknown": "Unknown",
    "app.sessionProducts": "Products in session",
    "app.unknownBarcodes": "Unknown barcodes",
    "app.positionsCount": "{count} items",
    "app.sessionListAfterScans": "List will appear after the first scans.",
    "app.unknownListAfterScans": "Unknown barcodes will appear after scans.",
    "app.expandItem": "Expand product {name}",
    "app.collapseItem": "Collapse product {name}",
    "app.decrement": "-1",
    "app.delete": "Delete",
    "app.loadingProduct": "Loading product...",
    "app.noProductData": "No product data.",
    "app.itemUpdating": "Updating item...",
    "app.closeSession": "Close session",
    "app.itemChangedToast": "Item changed: {barcode} (-{quantity})",
    "app.undo": "Undo",
    "app.barcodeNotFound": "Barcode {barcode} was not found in catalog",
    "app.toastScannerFound": "Scanner found, port {port} saved.",
    "app.toastSerialSaved": "Serial settings saved ({port}).",
    "app.toastSmtpSaved": "SMTP settings saved.",
    "app.toastSmtpSavedDisabled": "SMTP settings saved, mailing disabled.",
    "app.toastCatalogDownloaded": "Catalog downloaded.",
    "app.toastReportsSaved": "Reports folder saved.",

    "settings.title": "Settings",
    "settings.serial.section": "Scanner (Serial)",
    "settings.serial.loading": "Loading serial settings...",
    "settings.serial.enabled": "Enable scanner",
    "settings.serial.port": "Serial Port",
    "settings.serial.baudrate": "Baudrate",
    "settings.serial.timeout": "Timeout (sec)",
    "settings.serial.reconnectDelay": "Reconnect delay (sec)",
    "settings.serial.findScanner": "Find scanner",
    "settings.serial.save": "Save Serial",

    "settings.catalog.section": "Catalog",
    "settings.catalog.status": "Status",
    "settings.catalog.loaded": "Loaded",
    "settings.catalog.notLoaded": "Not loaded",
    "settings.catalog.items": "Items",
    "settings.catalog.newFile": "New catalog file (.xlsx)",
    "settings.catalog.upload": "Upload catalog",
    "settings.catalog.uploading": "Uploading...",
    "settings.catalog.download": "Download catalog",
    "settings.catalog.downloading": "Downloading...",
    "settings.catalog.delete": "Delete catalog",
    "settings.catalog.deleting": "Deleting...",

    "settings.email.section": "Email report delivery",
    "settings.email.loading": "Loading SMTP settings...",
    "settings.email.enabled": "Enable report delivery by email",
    "settings.email.host": "SMTP Host",
    "settings.email.port": "Port",
    "settings.email.username": "Username",
    "settings.email.password": "Password",
    "settings.email.passwordKeep": "(leave blank to keep current)",
    "settings.email.passwordRequired": "(required with auth)",
    "settings.email.from": "From email",
    "settings.email.to": "To emails (comma separated)",
    "settings.email.subject": "Email subject",
    "settings.email.body": "Email body",
    "settings.email.refresh": "Refresh SMTP",
    "settings.email.test": "Test connection",
    "settings.email.testing": "Testing...",
    "settings.email.save": "Save SMTP",

    "settings.reports.section": "Reports",
    "settings.reports.loading": "Loading report settings...",
    "settings.reports.outputDir": "Report output folder",
    "settings.reports.save": "Save folder",

    "serial.status.saved": "Serial settings saved. Scanner status: {status}.",
    "serial.status.disabled": "Scanner disabled.",
    "serial.status.running": "running",
    "serial.status.stopped": "stopped",
    "serial.status.detected": "Scanner found: {port}. Barcode: {barcode}. Settings updated.",

    "email.status.saved": "SMTP settings saved, connection verified.",
    "email.status.disabled": "Mailing is disabled.",
    "email.status.tested": "SMTP check completed.",

    "history.title": "Session history",
    "history.sessions": "Sessions ({count})",
    "history.loading": "Loading history...",
    "history.empty": "No completed sessions yet.",
    "history.session": "Session #{id}",
    "history.sessionLabel": "Session",
    "history.scansUnique": "{totalItems} scans / {totalUnique} unique / {totalUnknown} ND",
    "history.selectSession": "Select a session to view details.",
    "history.loadingDetails": "Loading details...",
    "history.startedAt": "Start",
    "history.finishedAt": "Finish",
    "history.continue": "Continue",
    "history.excel": "Excel",
    "history.openFileLocation": "Open file location",
    "history.openFileUnsupported": "Available only in desktop app",
    "history.openFileError": "Failed to open file location.",
    "history.positions": "Positions",
    "history.sessionHasNoItems": "No items in this session.",
    "history.unknown": "Unknown barcodes",
    "history.noUnknown": "No unknown barcodes in this session.",

    "hero.title": "Product scanning",
    "hero.description":
      "Central control point: start a session and monitor scans in real time.",
    "hero.catalogHint": "Catalog is not loaded. Open settings and upload Excel.",
    "hero.status": "Status",
    "hero.statusActive": "Active",
    "hero.statusInactive": "Inactive",
    "hero.start": "Start",

    "basket.title": "Current basket",
    "basket.inactiveHint": "Session is inactive. Start scanning.",
    "basket.empty": "No scans yet.",
    "basket.units": "pcs",

    "feed.lastEvent": "Last event",
    "feed.waiting": "Waiting for events...",
    "feed.time": "Time",
    "feed.type": "Type",
    "feed.tape": "Event feed",
    "feed.empty": "History will appear after first messages.",
    "feed.object": "object",

    "session.emailSent": "Report sent by email.",
    "session.emailFailed": "Report saved, but email delivery failed.",
    "session.emailDisabled": "Email delivery is disabled.",

    "error.session": "Session error",
    "error.sessionStart": "Failed to start session",
    "error.sessionResume": "Failed to resume session",
    "error.sessionStop": "Failed to stop session",
    "error.sessionCancel": "Failed to cancel session",
    "error.sessionDecrement": "Failed to decrement quantity",
    "error.sessionRemove": "Failed to delete item",
    "error.sessionRestore": "Failed to restore item",
    "error.sessionUndo": "Failed to undo last scan",
    "error.catalogLoad": "Failed to load catalog",
    "error.catalogUpload": "Failed to upload file",
    "error.catalogDelete": "Failed to delete catalog",
    "error.catalogDownload": "Failed to download catalog",
    "error.historyLoad": "Failed to load history",
    "error.historyDetails": "Failed to load session details",
    "error.productLoad": "Failed to load product",
    "error.serialLoad": "Failed to load serial settings",
    "error.serialSave": "Failed to save serial settings",
    "error.serialDetect": "Failed to auto-detect scanner",
    "error.emailLoad": "Failed to load email settings",
    "error.emailSave": "Failed to save email settings",
    "error.emailTest": "Failed to test SMTP",
    "error.reportsLoad": "Failed to load report settings",
    "error.reportsSave": "Failed to save report folder",
    "error.reportsPathRequired": "Report folder is required",
  },
};

type TranslateParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] === undefined ? `{${key}}` : String(params[key])
  );
}

function normalizeLanguage(value: string | null | undefined): Language {
  return value === "en" ? "en" : "ru";
}

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "ru";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeLanguage(saved);
  const browser = window.navigator.language?.toLowerCase() ?? "";
  return browser.startsWith("en") ? "en" : "ru";
}

export function getLocale(language: Language): string {
  return language === "en" ? "en-US" : "ru-RU";
}

export function translate(
  key: string,
  params?: TranslateParams,
  language: Language = getStoredLanguage()
): string {
  const template = messages[language][key] ?? messages.ru[key] ?? key;
  return interpolate(template, params);
}

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: TranslateParams) => string;
  locale: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, params?: TranslateParams) => translate(key, params, language),
    [language]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t, locale: getLocale(language) }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
