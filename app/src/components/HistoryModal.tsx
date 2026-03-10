import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import type { CatalogItem, SessionHistoryDetails, SessionHistoryEntry } from "../types";
import { buildProductFieldRows } from "../utils/productFieldRows";

type HistoryModalProps = {
  sessions: SessionHistoryEntry[];
  total: number;
  selectedSessionId: number | null;
  selectedDetails: SessionHistoryDetails | null;
  loading: boolean;
  loadingDetails: boolean;
  error: string | null;
  detailError: string | null;
  productDetails: Record<string, CatalogItem>;
  productErrors: Record<string, string>;
  loadingProductBarcode: string | null;
  resumingSessionId: number | null;
  sessionActive: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: number) => void;
  onExpandItem: (barcode: string) => void;
  onResumeSession: (sessionId: number) => void;
};

export function HistoryModal({
  sessions,
  total,
  selectedSessionId,
  selectedDetails,
  loading,
  loadingDetails,
  error,
  detailError,
  productDetails,
  productErrors,
  loadingProductBarcode,
  resumingSessionId,
  sessionActive,
  onClose,
  onRefresh,
  onSelectSession,
  onExpandItem,
  onResumeSession,
}: HistoryModalProps) {
  const { t, locale } = useI18n();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [openFileError, setOpenFileError] = useState<string | null>(null);
  const desktopApi = typeof window !== "undefined" ? window.__DESKTOP_API__ : undefined;
  const hasDesktopApi = typeof desktopApi?.showItemInFolder === "function";

  useEffect(() => {
    setExpandedItems({});
    setOpenFileError(null);
  }, [selectedSessionId]);

  const toggleItem = (barcode: string) => {
    const nextValue = !expandedItems[barcode];
    setExpandedItems((prev) => ({ ...prev, [barcode]: nextValue }));
    if (nextValue) {
      onExpandItem(barcode);
    }
  };

  const handleOpenFileLocation = async (filePath: string) => {
    if (!desktopApi || typeof desktopApi.showItemInFolder !== "function") {
      setOpenFileError(t("history.openFileUnsupported"));
      return;
    }

    setOpenFileError(null);
    try {
      await desktopApi.showItemInFolder(filePath);
    } catch (error) {
      setOpenFileError(error instanceof Error ? error.message : t("history.openFileError"));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-window history-window"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <h3>{t("history.title")}</h3>
          <button className="ghost small" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <div className="history-layout">
          <section className="history-list">
            <div className="panel-header">
              <div className="label">{t("history.sessions", { count: total })}</div>
              <button className="ghost small" onClick={onRefresh}>
                {t("common.refresh")}
              </button>
            </div>
            {loading && <div className="hint">{t("history.loading")}</div>}
            {error && <div className="hint error">{error}</div>}
            {!loading && !error && sessions.length === 0 && (
              <div className="empty">{t("history.empty")}</div>
            )}
            <div className="list">
              {sessions.map((entry) => (
                <button
                  key={entry.id}
                  className={`history-entry ${
                    selectedSessionId === entry.id ? "active" : ""
                  }`}
                  onClick={() => onSelectSession(entry.id)}
                >
                  <div className="value">{t("history.session", { id: entry.id })}</div>
                  <div className="summary">
                    {new Date(entry.finished_at ?? entry.started_at).toLocaleString(locale)}
                  </div>
                  <div className="summary">
                    {t("history.scansUnique", {
                      totalItems: entry.total_items,
                      totalUnique: entry.total_unique,
                      totalUnknown: entry.total_unknown,
                    })}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="history-details">
            {!selectedSessionId && (
              <div className="empty">{t("history.selectSession")}</div>
            )}
            {selectedSessionId && loadingDetails && (
              <div className="hint">{t("history.loadingDetails")}</div>
            )}
            {selectedSessionId && detailError && (
              <div className="hint error">{detailError}</div>
            )}
            {selectedDetails && (
              <div className="stack">
                <div className="history-meta-row">
                  <div className="meta">
                    <div>
                      <div className="label">{t("history.sessionLabel")}</div>
                      <div className="value">#{selectedDetails.id}</div>
                    </div>
                    <div>
                      <div className="label">{t("history.startedAt")}</div>
                      <div className="value">
                        {new Date(selectedDetails.started_at).toLocaleString(locale)}
                      </div>
                    </div>
                    <div>
                      <div className="label">{t("history.finishedAt")}</div>
                      <div className="value">
                        {selectedDetails.finished_at
                          ? new Date(selectedDetails.finished_at).toLocaleString(locale)
                          : t("common.notAvailable")}
                      </div>
                    </div>
                  </div>
                  <button
                    className="ghost small"
                    onClick={() => onResumeSession(selectedDetails.id)}
                    disabled={sessionActive || resumingSessionId === selectedDetails.id}
                  >
                    {resumingSessionId === selectedDetails.id
                      ? t("common.loading")
                      : t("history.continue")}
                  </button>
                </div>
                <div className="history-excel-block">
                  <div className="label">{t("history.excel")}</div>
                  <div className="history-excel-row">
                    <div className="value history-excel-path">{selectedDetails.excel_path}</div>
                    <button
                      type="button"
                      className="ghost history-file-button"
                      onClick={() => void handleOpenFileLocation(selectedDetails.excel_path)}
                      disabled={!selectedDetails.excel_path || !hasDesktopApi}
                      aria-label={t("history.openFileLocation")}
                      title={
                        hasDesktopApi
                          ? t("history.openFileLocation")
                          : t("history.openFileUnsupported")
                      }
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z" />
                        <path d="M3 10h18l-1.2 8.2a2 2 0 0 1-2 1.8H6.2a2 2 0 0 1-2-1.8z" />
                      </svg>
                    </button>
                  </div>
                  {openFileError && <div className="hint error">{openFileError}</div>}
                </div>
                <div className="panel-section">
                  <div className="section-title">{t("history.positions")}</div>
                  {selectedDetails.items.length === 0 && (
                    <div className="empty">{t("history.sessionHasNoItems")}</div>
                  )}
                  <div className="history-items-scroll">
                    <div className="list">
                      {selectedDetails.items.map((item) => (
                        <div key={item.barcode} className="history-item">
                          <div className="history-item-row">
                            <div className="history-item-left">
                              <button
                                type="button"
                                className="history-toggle"
                                onClick={() => toggleItem(item.barcode)}
                                aria-label={
                                  expandedItems[item.barcode]
                                    ? t("app.collapseItem", { name: item.name })
                                    : t("app.expandItem", { name: item.name })
                                }
                                aria-expanded={Boolean(expandedItems[item.barcode])}
                              >
                                {expandedItems[item.barcode] ? "▾" : "▸"}
                              </button>
                              <span className="barcode">{item.name}</span>
                            </div>
                            <div className="history-qty">{item.quantity}</div>
                          </div>
                          {expandedItems[item.barcode] && (
                            <div className="history-item-details">
                              {loadingProductBarcode === item.barcode && (
                                <div className="hint">{t("app.loadingProduct")}</div>
                              )}
                              {productErrors[item.barcode] && (
                                <div className="hint error">
                                  {productErrors[item.barcode]}
                                </div>
                              )}
                              {productDetails[item.barcode] && (
                                <div className="kv-table-wrap">
                                  <table className="kv-table">
                                    <tbody>
                                      {buildProductFieldRows(
                                        productDetails[item.barcode].fields,
                                        item.barcode
                                      ).map((row) => (
                                        <tr key={row.key}>
                                          <th>{row.key}</th>
                                          <td>{row.value}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="panel-section">
                  <div className="section-title">{t("history.unknown")}</div>
                  {(selectedDetails.unknown_items ?? []).length === 0 && (
                    <div className="empty">{t("history.noUnknown")}</div>
                  )}
                  {(selectedDetails.unknown_items ?? []).length > 0 && (
                    <div className="history-unknown-list">
                      {(selectedDetails.unknown_items ?? []).map((item) => (
                        <div key={`unknown-${item.barcode}`} className="history-unknown-item">
                          <div className="history-unknown-row">
                            <div className="history-unknown-left">
                              <span className="barcode">{item.barcode}</span>
                            </div>
                            <div className="history-qty">{item.quantity}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
