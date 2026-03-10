export type CatalogMeta = {
  count: number;
  columns: string[];
  last_loaded_at: string | null;
  file: string;
  barcode_column?: string;
};

export type CatalogItem = {
  barcode: string;
  fields: Record<string, unknown>;
};

export type SessionStatus = {
  active: boolean;
  session_id?: number | null;
  started_at: string | null;
  catalog_loaded: boolean;
  total_items: number;
  total_unique: number;
  total_unknown: number;
};

export type SessionItems = {
  items: { barcode: string; name: string; quantity: number }[];
  unknown_items: { barcode: string; quantity: number }[];
  total_items: number;
  total_unique: number;
  total_unknown: number;
};

export type SessionStopResult = {
  session_id: number;
  excel_path: string;
  total_items: number;
  total_unique: number;
  email_status: "disabled" | "sent" | "failed";
  email_detail: string | null;
};

export type EmailSettings = {
  enabled: boolean;
  host: string;
  port: number | null;
  username: string;
  password_set: boolean;
  from_email: string;
  to_emails: string[];
  use_tls: boolean;
  use_ssl: boolean;
  subject_template: string;
  body_template: string;
  updated_at: string | null;
};

export type EmailSettingsSavePayload = {
  enabled: boolean;
  host: string;
  port: number | null;
  username: string;
  password: string | null;
  from_email: string;
  to_emails: string[];
  use_tls: boolean;
  use_ssl: boolean;
  subject_template: string;
  body_template: string;
};

export type SerialSettings = {
  enabled: boolean;
  port: string;
  baudrate: number;
  timeout: number;
  reconnect_delay: number;
  running: boolean;
  updated_at: string | null;
};

export type SerialSettingsSavePayload = {
  enabled: boolean;
  port: string;
  baudrate: number;
  timeout: number;
  reconnect_delay: number;
};

export type SerialAutoDetectResult = {
  port: string;
  barcode: string;
  checked_ports: number;
};

export type ReportSettings = {
  output_dir: string;
  updated_at: string | null;
};

export type SessionHistoryEntry = {
  id: number;
  started_at: string;
  finished_at: string | null;
  total_items: number;
  total_unique: number;
  total_unknown: number;
  excel_path: string;
};

export type SessionHistoryList = {
  sessions: SessionHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
};

export type SessionHistoryDetails = SessionHistoryEntry & {
  items: { barcode: string; name: string; quantity: number }[];
  unknown_items: { barcode: string; quantity: number }[];
};

export type WsPayload = {
  type?: string;
  barcode?: string;
  name?: string;
  fields?: Record<string, unknown>;
  quantity?: number;
  unknown?: boolean;
  total_items?: number;
  total_unique?: number;
  total_unknown?: number;
  detail?: string;
  meta?: CatalogMeta;
  [key: string]: unknown;
};

export type WsMessage = {
  id: string;
  receivedAt: string;
  payload: WsPayload | string;
};
