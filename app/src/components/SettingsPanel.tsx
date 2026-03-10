import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import type {
  CatalogMeta,
  EmailSettings,
  EmailSettingsSavePayload,
  ReportSettings,
  SerialSettings,
  SerialSettingsSavePayload,
} from "../types";

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function areSerialPayloadsEqual(
  left: SerialSettingsSavePayload,
  right: SerialSettingsSavePayload
): boolean {
  return (
    left.enabled === right.enabled &&
    left.port === right.port &&
    left.baudrate === right.baudrate &&
    left.timeout === right.timeout &&
    left.reconnect_delay === right.reconnect_delay
  );
}

function areEmailPayloadsEqual(
  left: EmailSettingsSavePayload,
  right: EmailSettingsSavePayload
): boolean {
  return (
    left.enabled === right.enabled &&
    left.host === right.host &&
    left.port === right.port &&
    left.username === right.username &&
    (left.password ?? null) === (right.password ?? null) &&
    left.from_email === right.from_email &&
    areStringArraysEqual(left.to_emails, right.to_emails) &&
    left.use_tls === right.use_tls &&
    left.use_ssl === right.use_ssl &&
    left.subject_template === right.subject_template &&
    left.body_template === right.body_template
  );
}

type SettingsPanelProps = {
  catalogMeta: CatalogMeta | null;
  catalogUploading: boolean;
  catalogDeleting: boolean;
  catalogDownloading: boolean;
  serialSettings: SerialSettings | null;
  serialLoading: boolean;
  serialSaving: boolean;
  serialDetecting: boolean;
  reportSettings: ReportSettings | null;
  reportLoading: boolean;
  reportSaving: boolean;
  emailSettings: EmailSettings | null;
  emailLoading: boolean;
  emailSaving: boolean;
  onAutoDetectSerialScanner: (payload: SerialSettingsSavePayload) => Promise<void>;
  onSaveSerialSettings: (payload: SerialSettingsSavePayload) => Promise<void>;
  onSaveReportSettings: (outputDir: string) => Promise<void>;
  onSaveEmailSettings: (payload: EmailSettingsSavePayload) => Promise<void>;
  onUploadCatalog: (file: File) => Promise<void>;
  onDeleteCatalog: () => Promise<void>;
  onDownloadCatalog: () => Promise<void>;
  onClose: () => void;
};

export function SettingsPanel({
  catalogMeta,
  catalogUploading,
  catalogDeleting,
  catalogDownloading,
  serialSettings,
  serialLoading,
  serialSaving,
  serialDetecting,
  reportSettings,
  reportLoading,
  reportSaving,
  emailSettings,
  emailLoading,
  emailSaving,
  onAutoDetectSerialScanner,
  onSaveSerialSettings,
  onSaveReportSettings,
  onSaveEmailSettings,
  onUploadCatalog,
  onDeleteCatalog,
  onDownloadCatalog,
  onClose,
}: SettingsPanelProps) {
  const { t } = useI18n();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [serialForm, setSerialForm] = useState<SerialSettingsSavePayload>({
    enabled: true,
    port: "",
    baudrate: 9600,
    timeout: 0.1,
    reconnect_delay: 2.0,
  });
  const [reportOutputDir, setReportOutputDir] = useState("");
  const [emailForm, setEmailForm] = useState<EmailSettingsSavePayload>({
    enabled: false,
    host: "",
    port: 587,
    username: "",
    password: null,
    from_email: "",
    to_emails: [],
    use_tls: true,
    use_ssl: false,
    subject_template: "Отчет сессии сканирования #{session_id}",
    body_template:
      "Сессия #{session_id}\nНачало: {started_at}\nОкончание: {finished_at}\nВсего сканов: {total_items}\nУникальных: {total_unique}\nФайл отчета: {excel_path}",
  });
  const [toEmailsText, setToEmailsText] = useState("");
  const catalogLoaded = Boolean(catalogMeta?.last_loaded_at);

  useEffect(() => {
    if (!serialSettings) return;
    setSerialForm({
      enabled: serialSettings.enabled,
      port: serialSettings.port,
      baudrate: serialSettings.baudrate,
      timeout: serialSettings.timeout,
      reconnect_delay: serialSettings.reconnect_delay,
    });
  }, [serialSettings]);

  useEffect(() => {
    if (!reportSettings) return;
    setReportOutputDir(reportSettings.output_dir);
  }, [reportSettings]);

  useEffect(() => {
    if (!emailSettings) return;
    setEmailForm({
      enabled: emailSettings.enabled,
      host: emailSettings.host,
      port: emailSettings.port,
      username: emailSettings.username,
      password: null,
      from_email: emailSettings.from_email,
      to_emails: emailSettings.to_emails,
      use_tls: emailSettings.use_tls,
      use_ssl: emailSettings.use_ssl,
      subject_template: emailSettings.subject_template,
      body_template: emailSettings.body_template,
    });
    setToEmailsText((emailSettings.to_emails ?? []).join(", "));
  }, [emailSettings]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      await onUploadCatalog(selectedFile);
      setSelectedFile(null);
      setFileInputKey((prev) => prev + 1);
    } catch {
      return;
    }
  };

  const handleDelete = async () => {
    try {
      await onDeleteCatalog();
      setSelectedFile(null);
      setFileInputKey((prev) => prev + 1);
    } catch {
      return;
    }
  };

  const handleDownload = async () => {
    try {
      await onDownloadCatalog();
    } catch {
      return;
    }
  };

  const buildEmailPayload = (): EmailSettingsSavePayload => {
    const toEmails = toEmailsText
      .split("\n")
      .join(",")
      .split(",")
      .map((value: string) => value.trim())
      .filter(Boolean);

    return {
      ...emailForm,
      to_emails: toEmails,
      password: emailForm.password && emailForm.password.trim() ? emailForm.password : null,
      port: emailForm.port ?? null,
    };
  };

  const buildSerialPayload = (): SerialSettingsSavePayload => ({
    enabled: Boolean(serialForm.enabled),
    port: String(serialForm.port ?? "").trim(),
    baudrate: Number(serialForm.baudrate ?? 0),
    timeout: Number(serialForm.timeout ?? 0),
    reconnect_delay: Number(serialForm.reconnect_delay ?? 0),
  });

  const serialInitialPayload: SerialSettingsSavePayload | null = serialSettings
    ? {
        enabled: serialSettings.enabled,
        port: serialSettings.port,
        baudrate: serialSettings.baudrate,
        timeout: serialSettings.timeout,
        reconnect_delay: serialSettings.reconnect_delay,
      }
    : null;

  const serialDirty = serialInitialPayload
    ? !areSerialPayloadsEqual(buildSerialPayload(), serialInitialPayload)
    : false;

  const emailInitialPayload: EmailSettingsSavePayload | null = emailSettings
    ? {
        enabled: emailSettings.enabled,
        host: emailSettings.host,
        port: emailSettings.port,
        username: emailSettings.username,
        password: null,
        from_email: emailSettings.from_email,
        to_emails: emailSettings.to_emails ?? [],
        use_tls: emailSettings.use_tls,
        use_ssl: emailSettings.use_ssl,
        subject_template: emailSettings.subject_template,
        body_template: emailSettings.body_template,
      }
    : null;

  const emailDirty = emailInitialPayload
    ? !areEmailPayloadsEqual(buildEmailPayload(), emailInitialPayload)
    : false;

  const reportDirty = reportSettings
    ? reportOutputDir.trim() !== reportSettings.output_dir.trim()
    : false;

  const handleSaveSerialSettings = async () => {
    try {
      await onSaveSerialSettings(buildSerialPayload());
    } catch {
      return;
    }
  };

  const handleAutoDetectSerialScanner = async () => {
    try {
      await onAutoDetectSerialScanner(buildSerialPayload());
    } catch {
      return;
    }
  };

  const handleSaveEmailSettings = async () => {
    try {
      await onSaveEmailSettings(buildEmailPayload());
      setEmailForm((prev) => ({ ...prev, password: null }));
    } catch {
      return;
    }
  };

  const handleSaveReportSettings = async () => {
    try {
      await onSaveReportSettings(reportOutputDir);
    } catch {
      return;
    }
  };

  return (
    <div className="settings-panel">
      <div className="panel-header">
        <h3>{t("settings.title")}</h3>
        <button className="ghost small" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      <div className="panel-section">
        <div className="section-title">{t("settings.serial.section")}</div>
        {serialLoading && <div className="hint">{t("settings.serial.loading")}</div>}
        {!serialLoading && (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={serialForm.enabled}
                onChange={(event) =>
                  setSerialForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              <span>{t("settings.serial.enabled")}</span>
            </label>

            {serialForm.enabled && (
              <>
                <label className="field">
                  <span>{t("settings.serial.port")}</span>
                  <input
                    value={serialForm.port}
                    onChange={(event) =>
                      setSerialForm((prev) => ({ ...prev, port: event.target.value }))
                    }
                  />
                </label>

                <div className="settings-grid">
                  <label className="field">
                    <span>{t("settings.serial.baudrate")}</span>
                    <input
                      type="number"
                      value={serialForm.baudrate}
                      onChange={(event) =>
                        setSerialForm((prev) => ({
                          ...prev,
                          baudrate: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t("settings.serial.timeout")}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={serialForm.timeout}
                      onChange={(event) =>
                        setSerialForm((prev) => ({
                          ...prev,
                          timeout: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t("settings.serial.reconnectDelay")}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={serialForm.reconnect_delay}
                      onChange={(event) =>
                        setSerialForm((prev) => ({
                          ...prev,
                          reconnect_delay: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </label>
                </div>
              </>
            )}

            <div className="controls">
              {serialForm.enabled && (
                <button
                  className="ghost"
                  onClick={() => void handleAutoDetectSerialScanner()}
                  disabled={serialLoading || serialSaving || serialDetecting}
                >
                  {serialDetecting ? t("common.search") : t("settings.serial.findScanner")}
                </button>
              )}
              <button
                className={serialDirty ? "primary" : "ghost"}
                onClick={() => void handleSaveSerialSettings()}
                disabled={serialSaving || serialDetecting || !serialDirty}
              >
                {serialSaving ? t("common.saving") : t("settings.serial.save")}
              </button>
            </div>

          </>
        )}
      </div>

      <div className="panel-section">
        <div className="section-title">{t("settings.catalog.section")}</div>
        <div className="meta">
          <div>
            <div className="label">{t("settings.catalog.status")}</div>
            <div className="value">
              {catalogLoaded ? t("settings.catalog.loaded") : t("settings.catalog.notLoaded")}
            </div>
          </div>
          <div>
            <div className="label">{t("settings.catalog.items")}</div>
            <div className="value">{catalogMeta?.count ?? 0}</div>
          </div>
        </div>

        <label className="field">
          <span>{t("settings.catalog.newFile")}</span>
          <input
            key={fileInputKey}
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null);
            }}
          />
        </label>

        <div className="controls">
          <button
            className="ghost"
            onClick={() => void handleDownload()}
            disabled={!catalogLoaded || catalogUploading || catalogDeleting || catalogDownloading}
          >
            {catalogDownloading ? t("settings.catalog.downloading") : t("settings.catalog.download")}
          </button>
          <button
            className="primary"
            onClick={() => void handleUpload()}
            disabled={
              !selectedFile || catalogUploading || catalogDeleting || catalogDownloading
            }
          >
            {catalogUploading ? t("settings.catalog.uploading") : t("settings.catalog.upload")}
          </button>
          <button
            className="ghost danger"
            onClick={() => void handleDelete()}
            disabled={!catalogLoaded || catalogUploading || catalogDeleting || catalogDownloading}
          >
            {catalogDeleting ? t("settings.catalog.deleting") : t("settings.catalog.delete")}
          </button>
        </div>

      </div>

      <div className="panel-section">
        <div className="section-title">{t("settings.email.section")}</div>
        {emailLoading && <div className="hint">{t("settings.email.loading")}</div>}
        {!emailLoading && (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                checked={emailForm.enabled}
                onChange={(event) =>
                  setEmailForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              <span>{t("settings.email.enabled")}</span>
            </label>

            {emailForm.enabled && (
              <>
                <label className="field">
                  <span>{t("settings.email.host")}</span>
                  <input
                    value={emailForm.host}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, host: event.target.value }))
                    }
                  />
                </label>

                <div className="settings-grid">
                  <label className="field">
                    <span>{t("settings.email.port")}</span>
                    <input
                      type="number"
                      value={emailForm.port ?? ""}
                      onChange={(event) =>
                        setEmailForm((prev) => ({
                          ...prev,
                          port: event.target.value ? Number(event.target.value) : null,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t("settings.email.username")}</span>
                    <input
                      value={emailForm.username}
                      onChange={(event) =>
                        setEmailForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <span>
                    {t("settings.email.password")}{" "}
                    {emailSettings?.password_set
                      ? t("settings.email.passwordKeep")
                      : t("settings.email.passwordRequired")}
                  </span>
                  <input
                    type="password"
                    value={emailForm.password ?? ""}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                  />
                </label>

                <label className="field">
                  <span>{t("settings.email.from")}</span>
                  <input
                    value={emailForm.from_email}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, from_email: event.target.value }))
                    }
                  />
                </label>

                <label className="field">
                  <span>{t("settings.email.to")}</span>
                  <textarea
                    className="textarea"
                    value={toEmailsText}
                    onChange={(event) => setToEmailsText(event.target.value)}
                  />
                </label>

                <div className="settings-grid">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={emailForm.use_tls}
                      onChange={(event) =>
                        setEmailForm((prev) => ({ ...prev, use_tls: event.target.checked }))
                      }
                    />
                    <span>TLS</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={emailForm.use_ssl}
                      onChange={(event) =>
                        setEmailForm((prev) => ({ ...prev, use_ssl: event.target.checked }))
                      }
                    />
                    <span>SSL</span>
                  </label>
                </div>

                <label className="field">
                  <span>{t("settings.email.subject")}</span>
                  <input
                    value={emailForm.subject_template}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, subject_template: event.target.value }))
                    }
                  />
                </label>

                <label className="field">
                  <span>{t("settings.email.body")}</span>
                  <textarea
                    className="textarea long"
                    value={emailForm.body_template}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, body_template: event.target.value }))
                    }
                  />
                </label>
              </>
            )}

            <div className="controls">
              <button
                className={emailDirty ? "primary" : "ghost"}
                onClick={() => void handleSaveEmailSettings()}
                disabled={emailSaving || !emailDirty}
              >
                {emailSaving ? t("common.saving") : t("settings.email.save")}
              </button>
            </div>

          </>
        )}
      </div>

      <div className="panel-section">
        <div className="section-title">{t("settings.reports.section")}</div>
        {reportLoading && <div className="hint">{t("settings.reports.loading")}</div>}
        {!reportLoading && (
          <>
            <label className="field">
              <span>{t("settings.reports.outputDir")}</span>
              <input
                value={reportOutputDir}
                onChange={(event) => setReportOutputDir(event.target.value)}
              />
            </label>
            <div className="controls">
              <button
                className={reportDirty ? "primary" : "ghost"}
                onClick={() => void handleSaveReportSettings()}
                disabled={reportSaving || !reportDirty}
              >
                {reportSaving ? t("common.saving") : t("settings.reports.save")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
