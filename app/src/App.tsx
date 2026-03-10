import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConnectionIndicator } from "./components/ConnectionIndicator";
import { HistoryModal } from "./components/HistoryModal";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { RefreshPageButton } from "./components/RefreshPageButton";
import { SettingsPanel } from "./components/SettingsPanel";
import { ThemeToggleButton } from "./components/ThemeToggleButton";
import { useCatalog } from "./hooks/useCatalog";
import { useEmailSettings } from "./hooks/useEmailSettings";
import { useReportSettings } from "./hooks/useReportSettings";
import { useSerialSettings } from "./hooks/useSerialSettings";
import { useSessionHistory } from "./hooks/useSessionHistory";
import { useSession } from "./hooks/useSession";
import { useSettings } from "./hooks/useSettings";
import { useWsStream } from "./hooks/useWsStream";
import { useI18n } from "./i18n";
import type { CatalogMeta, WsPayload } from "./types";
import { buildProductFieldRows } from "./utils/productFieldRows";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ConfirmDialogState = {
  message: string;
  onConfirm: () => Promise<void> | void;
} | null;

export default function App() {
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("barcode_reader_ui_theme");
    const theme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [lastScan, setLastScan] = useState<WsPayload | null>(null);
  const [lastScanError, setLastScanError] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{
    barcode: string;
    quantity: number;
  } | null>(null);
  const [expandedSessionItems, setExpandedSessionItems] = useState<
    Record<string, boolean>
  >({});
  const [undoToastLoading, setUndoToastLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [resumingSessionId, setResumingSessionId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const undoToastTimerRef = useRef<number | null>(null);
  const successToastTimerRef = useRef<number | null>(null);
  const errorToastTimerRef = useRef<number | null>(null);
  const seenErrorsRef = useRef<Record<string, string | null>>({});
  const settingsOverlayPressRef = useRef(false);

  const { t } = useI18n();
  const { apiUrl, wsUrl } = useSettings();
  const catalog = useCatalog(apiUrl);
  const serialSettings = useSerialSettings(apiUrl);
  const emailSettings = useEmailSettings(apiUrl);
  const reportSettings = useReportSettings(apiUrl);
  const session = useSession(apiUrl);
  const history = useSessionHistory(apiUrl);

  const syncCatalogLoaded = useCallback((loaded: boolean) => {
    session.setStatus((prev) =>
      prev
        ? { ...prev, catalog_loaded: loaded }
        : {
            active: false,
            started_at: null,
            catalog_loaded: loaded,
            total_items: 0,
            total_unique: 0,
            total_unknown: 0,
          }
    );
  }, [session]);

  const handleWsPayload = useCallback((payload: WsPayload) => {
    if (payload.meta && isObject(payload.meta)) {
      catalog.setMeta(payload.meta as CatalogMeta);
    }

    if (payload.type === "catalog_loaded") {
      syncCatalogLoaded(true);
    }

    if (payload.type === "catalog_cleared") {
      syncCatalogLoaded(false);
    }

    if (payload.type === "scan" && payload.barcode) {
      setLastScan(payload);
      setLastScanError(null);
    }

    if ((payload.type === "unknown_scan" || payload.type === "not_found") && payload.barcode) {
      setLastScan(payload);
      setLastScanError(t("app.barcodeNotFound", { barcode: String(payload.barcode) }));
    }

    if (
      (payload.type === "session_item_updated" ||
        payload.type === "session_item_removed" ||
        payload.type === "session_undo" ||
        payload.type === "session_unknown_undo") &&
      payload.barcode
    ) {
      setLastScan((prev) => {
        if (!prev || prev.barcode !== payload.barcode) {
          return prev;
        }
        return {
          ...prev,
          quantity: Number(payload.quantity ?? prev.quantity ?? 0),
          total_items: Number(payload.total_items ?? prev.total_items ?? 0),
          total_unique: Number(payload.total_unique ?? prev.total_unique ?? 0),
        };
      });

      if (
        (payload.type === "session_undo" || payload.type === "session_unknown_undo") &&
        Number(payload.total_items ?? 0) + Number(payload.total_unknown ?? 0) <= 0
      ) {
        setLastScan(null);
      }
    }

    session.applyScan(payload);
  }, [catalog, session, syncCatalogLoaded, t]);

  const ws = useWsStream(wsUrl, {
    autoConnect: true,
    onPayload: handleWsPayload,
  });

  const catalogLoaded = session.status?.catalog_loaded ?? false;
  const active = session.status?.active ?? false;
  const hasAnyScans =
    (session.status?.total_items ?? 0) + (session.status?.total_unknown ?? 0) > 0;
  const buttonLabel = active ? t("app.stopScan") : t("app.startScan");
  const buttonDisabled = active ? false : !catalogLoaded;

  const selectedSessionDetails = useMemo(() => {
    if (!selectedSessionId) return null;
    return history.details[selectedSessionId] ?? null;
  }, [history.details, selectedSessionId]);

  const lastScanRows = useMemo(() => {
    if (!lastScan) {
      return [];
    }
    const fields = isObject(lastScan.fields)
      ? (lastScan.fields as Record<string, unknown>)
      : null;
    return buildProductFieldRows(
      fields,
      lastScan.barcode ? String(lastScan.barcode) : null
    );
  }, [lastScan]);

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    try {
      await history.refresh();
      if (selectedSessionId) {
        await history.loadDetails(selectedSessionId);
      }
    } catch {
      return;
    }
  }, [history, selectedSessionId]);

  const handleMainAction = useCallback(async () => {
    if (!active) {
      try {
        await session.start();
        setLastScan(null);
        setLastScanError(null);
        setUndoToast(null);
      } catch {
        return;
      }
      return;
    }

    try {
      if (!hasAnyScans) {
        await session.cancel();
        setLastScan(null);
        setLastScanError(null);
        setUndoToast(null);
        return;
      }

      const result = await session.stop();
      if (!result) return;

      setLastScan(null);
      setLastScanError(null);
      setUndoToast(null);
      await history.refresh();
      setSelectedSessionId(result.session_id);
      setHistoryOpen(true);
      await history.loadDetails(result.session_id, true);
    } catch {
      return;
    }
  }, [active, hasAnyScans, history, session]);

  const clearUndoToastTimer = useCallback(() => {
    if (undoToastTimerRef.current !== null) {
      window.clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }
  }, []);

  const clearSuccessToastTimer = useCallback(() => {
    if (successToastTimerRef.current !== null) {
      window.clearTimeout(successToastTimerRef.current);
      successToastTimerRef.current = null;
    }
  }, []);

  const clearErrorToastTimer = useCallback(() => {
    if (errorToastTimerRef.current !== null) {
      window.clearTimeout(errorToastTimerRef.current);
      errorToastTimerRef.current = null;
    }
  }, []);

  const showSuccessToast = useCallback(
    (message: string) => {
      clearSuccessToastTimer();
      setSuccessToast(message);
      successToastTimerRef.current = window.setTimeout(() => {
        setSuccessToast(null);
        successToastTimerRef.current = null;
      }, 3000);
    },
    [clearSuccessToastTimer]
  );

  const showErrorToast = useCallback(
    (message: string) => {
      clearErrorToastTimer();
      setErrorToast(message);
      errorToastTimerRef.current = window.setTimeout(() => {
        setErrorToast(null);
        errorToastTimerRef.current = null;
      }, 4500);
    },
    [clearErrorToastTimer]
  );

  const showUndoToast = useCallback(
    (barcode: string, quantity: number) => {
      clearUndoToastTimer();
      setUndoToast({ barcode, quantity });
      undoToastTimerRef.current = window.setTimeout(() => {
        setUndoToast(null);
        undoToastTimerRef.current = null;
      }, 5000);
    },
    [clearUndoToastTimer]
  );

  const requestConfirmation = useCallback(
    (message: string, onConfirm: () => Promise<void> | void) => {
      setConfirmDialog({ message, onConfirm });
    },
    []
  );

  const handleCancelSession = useCallback(async () => {
    requestConfirmation(t("app.confirmCloseSession"), async () => {
      try {
        await session.cancel();
        setLastScan(null);
        setLastScanError(null);
        setUndoToast(null);
      } catch {
        return;
      }
    });
  }, [requestConfirmation, session, t]);

  const handleConfirmCancel = useCallback(() => {
    if (confirmLoading) return;
    setConfirmDialog(null);
  }, [confirmLoading]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmDialog) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } finally {
      setConfirmLoading(false);
    }
  }, [confirmDialog]);

  useEffect(() => {
    return () => {
      clearUndoToastTimer();
      clearSuccessToastTimer();
      clearErrorToastTimer();
    };
  }, [clearErrorToastTimer, clearSuccessToastTimer, clearUndoToastTimer]);

  useEffect(() => {
    const current: Record<string, string | null> = {
      session: session.error,
      catalog: catalog.error,
      serial: serialSettings.error,
      email: emailSettings.error,
      reports: reportSettings.error,
      history: history.error,
      historyDetail: history.detailError,
    };

    for (const [barcode, message] of Object.entries(history.productErrors)) {
      current[`historyProduct:${barcode}`] = message;
    }

    for (const [key, message] of Object.entries(current)) {
      if (!message) continue;
      if (seenErrorsRef.current[key] === message) continue;
      showErrorToast(message);
    }

    seenErrorsRef.current = current;
  }, [
    session.error,
    catalog.error,
    serialSettings.error,
    emailSettings.error,
    reportSettings.error,
    history.error,
    history.detailError,
    history.productErrors,
    showErrorToast,
  ]);

  useEffect(() => {
    const currentBarcodes = new Set(session.list.map((item) => item.barcode));
    setExpandedSessionItems((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;

      for (const [barcode, expanded] of Object.entries(prev)) {
        if (!expanded) continue;
        if (!currentBarcodes.has(barcode)) {
          changed = true;
          continue;
        }
        next[barcode] = true;
      }

      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });
  }, [session.list]);

  const handleDecrementItem = useCallback(
    (barcode: string, name: string) => {
      requestConfirmation(
        t("app.confirmDecrementItem", { name }),
        async () => {
          try {
            await session.decrementItem(barcode);
            showUndoToast(barcode, 1);
          } catch {
            return;
          }
        }
      );
    },
    [requestConfirmation, session, showUndoToast, t]
  );

  const handleRemoveItem = useCallback(
    (barcode: string, name: string, quantity: number) => {
      requestConfirmation(
        t("app.confirmRemoveItem", { name, quantity }),
        async () => {
          try {
            await session.removeItem(barcode);
            showUndoToast(barcode, quantity);
          } catch {
            return;
          }
        }
      );
    },
    [requestConfirmation, session, showUndoToast, t]
  );

  const handleDecrementUnknownItem = useCallback(
    (barcode: string) => {
      requestConfirmation(
        t("app.confirmDecrementUnknownItem", { barcode }),
        async () => {
          try {
            await session.decrementUnknownItem(barcode);
          } catch {
            return;
          }
        }
      );
    },
    [requestConfirmation, session, t]
  );

  const handleRemoveUnknownItem = useCallback(
    (barcode: string) => {
      requestConfirmation(
        t("app.confirmRemoveUnknownItem", { barcode }),
        async () => {
          try {
            await session.removeUnknownItem(barcode);
          } catch {
            return;
          }
        }
      );
    },
    [requestConfirmation, session, t]
  );

  const handleUndoLastScan = useCallback(() => {
    requestConfirmation(t("app.confirmUndoLastScan"), async () => {
      try {
        const snapshot = await session.undoLastScan();
        showSuccessToast(t("app.undoLastScanToast"));
        if (
          Number(snapshot.total_items ?? 0) + Number(snapshot.total_unknown ?? 0) <= 0
        ) {
          setLastScan(null);
        }
      } catch {
        return;
      }
    });
  }, [requestConfirmation, session, showSuccessToast, t]);

  const handleUndoToast = useCallback(async () => {
    if (!undoToast) return;
    setUndoToastLoading(true);
    try {
      await session.incrementItem(undoToast.barcode, undoToast.quantity);
      clearUndoToastTimer();
      setUndoToast(null);
    } catch {
      return;
    } finally {
      setUndoToastLoading(false);
    }
  }, [clearUndoToastTimer, session, undoToast]);

  const handleSelectSession = useCallback(
    async (sessionId: number) => {
      setSelectedSessionId(sessionId);
      try {
        await history.loadDetails(sessionId);
      } catch {
        return;
      }
    },
    [history]
  );

  const handleResumeSession = useCallback(
    async (sessionId: number) => {
      setResumingSessionId(sessionId);
      try {
        await session.resume(sessionId);
        setLastScan(null);
        setLastScanError(null);
        setUndoToast(null);
        setHistoryOpen(false);
      } catch {
        return;
      } finally {
        setResumingSessionId(null);
      }
    },
    [session]
  );

  const handleExpandHistoryItem = useCallback(
    async (barcode: string) => {
      try {
        await history.loadProductByBarcode(barcode);
      } catch {
        return;
      }
    },
    [history]
  );

  const handleToggleSessionItem = useCallback(
    async (barcode: string) => {
      const isExpanded = Boolean(expandedSessionItems[barcode]);
      if (isExpanded) {
        setExpandedSessionItems((prev) => ({ ...prev, [barcode]: false }));
        return;
      }

      setExpandedSessionItems((prev) => ({ ...prev, [barcode]: true }));
      try {
        await history.loadProductByBarcode(barcode);
      } catch {
        return;
      }
    },
    [expandedSessionItems, history]
  );

  const controlPanel = (
    <section className="panel center-stage">
      <ConnectionIndicator status={ws.status} />
      <button
        className="primary giant"
        onClick={() => void handleMainAction()}
        disabled={buttonDisabled}
      >
        {buttonLabel}
      </button>
      {!catalogLoaded && (
        <div className="hint">
          {t("app.catalogMissing")}
        </div>
      )}
      {session.error && <div className="hint error">{session.error}</div>}
      {session.emailHint && <div className="hint">{session.emailHint}</div>}
      {session.lastExportPath && (
        <div className="hint">{t("app.lastExport", { path: session.lastExportPath })}</div>
      )}
    </section>
  );

  return (
    <div className={`single-screen ${active ? "active-mode" : ""}`}>
      {!active && (
        <div className="locale-controls">
          <LanguageSwitch />
          <ThemeToggleButton />
          <RefreshPageButton />
        </div>
      )}
      {!active && (
        <div className="top-controls">
          <button className="ghost" onClick={() => setSettingsOpen(true)}>
            {t("app.openSettings")}
          </button>
          <button className="ghost" onClick={() => void openHistory()}>
            {t("app.openHistory")}
          </button>
        </div>
      )}

      {!active && controlPanel}

      {active && (
        <div className="active-session-shell">
          <div className="active-session-layout">
            <div className="active-left-column">
              {controlPanel}
              <section className="panel live-scan-panel">
                <div className="panel-header">
                  <h3>{t("app.lastScannedProduct")}</h3>
                  <button
                    className="ghost small"
                    onClick={() => void handleUndoLastScan()}
                    disabled={!hasAnyScans || session.undoingLastScan}
                  >
                    {session.undoingLastScan ? t("app.undoing") : t("app.undoLastScan")}
                  </button>
                </div>
                {!lastScan && <div className="empty">{t("app.waitingFirstScan")}</div>}
                {lastScan && (
                  <div className="stack">
                    <div className="meta">
                      <div>
                        <div className="label">{t("app.barcode")}</div>
                        <div className="value">{lastScan.barcode ?? t("common.notAvailable")}</div>
                      </div>
                      <div>
                        <div className="label">{t("app.quantity")}</div>
                        <div className="value">{Number(lastScan.quantity ?? 1)}</div>
                      </div>
                      <div>
                        <div className="label">{t("app.totalScans")}</div>
                        <div className="value">{Number(session.status?.total_items ?? 0)}</div>
                      </div>
                      <div>
                        <div className="label">{t("app.totalUnique")}</div>
                        <div className="value">{Number(session.status?.total_unique ?? 0)}</div>
                      </div>
                      <div>
                        <div className="label">{t("app.totalUnknown")}</div>
                        <div className="value">{Number(session.status?.total_unknown ?? 0)}</div>
                      </div>
                    </div>
                    {lastScanRows.length > 0 && (
                      <div className="kv-table-wrap">
                        <table className="kv-table">
                          <tbody>
                            {lastScanRows.map((row) => (
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
                {lastScanError && (
                  <div className="hint error last-scan-error">{lastScanError}</div>
                )}
              </section>
            </div>

            <section className="panel session-items-panel">
              <div className="panel-header">
                <h3>{t("app.sessionProducts")}</h3>
                <div className="badge">{t("app.positionsCount", { count: session.list.length })}</div>
              </div>
              <div className="session-items-scroll">
                {session.list.length === 0 && (
                  <div className="empty">{t("app.sessionListAfterScans")}</div>
                )}
                <div className="session-items-list">
                  {session.list.map((item) => (
                    <div key={item.barcode} className="session-item-card">
                      <div className="session-item-row">
                        <div className="session-item-main">
                          <div className="session-item-left">
                            <button
                              type="button"
                              className="history-toggle"
                              onClick={() => void handleToggleSessionItem(item.barcode)}
                              aria-label={
                                expandedSessionItems[item.barcode]
                                  ? t("app.collapseItem", { name: item.name })
                                  : t("app.expandItem", { name: item.name })
                              }
                              aria-expanded={Boolean(expandedSessionItems[item.barcode])}
                            >
                              {expandedSessionItems[item.barcode] ? "▾" : "▸"}
                            </button>
                            <span className="barcode">{item.name}</span>
                          </div>
                          <div className="summary">{item.quantity}</div>
                        </div>
                        <div className="session-item-actions">
                          <button
                            className="ghost tiny"
                          onClick={() => void handleDecrementItem(item.barcode, item.name)}
                          disabled={Boolean(session.pendingByBarcode[item.barcode])}
                        >
                          {t("app.decrement")}
                        </button>
                        <button
                          className="ghost tiny danger"
                          onClick={() => void handleRemoveItem(item.barcode, item.name, item.quantity)}
                          disabled={Boolean(session.pendingByBarcode[item.barcode])}
                        >
                          {t("app.delete")}
                        </button>
                        </div>
                      </div>
                      {expandedSessionItems[item.barcode] && (
                        <div className="history-item-details session-item-details">
                          {history.loadingProductBarcode === item.barcode && (
                            <div className="hint">{t("app.loadingProduct")}</div>
                          )}
                          {history.productErrors[item.barcode] && (
                            <div className="hint error">{history.productErrors[item.barcode]}</div>
                          )}
                          {history.productDetails[item.barcode] && (
                            <div className="kv-table-wrap">
                              <table className="kv-table">
                                <tbody>
                                  {buildProductFieldRows(
                                    history.productDetails[item.barcode].fields,
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
                      {expandedSessionItems[item.barcode] &&
                        !history.loadingProductBarcode &&
                        !history.productErrors[item.barcode] &&
                        !history.productDetails[item.barcode] && (
                          <div className="history-item-details session-item-details">
                            <div className="empty">{t("app.noProductData")}</div>
                          </div>
                        )}
                      {session.pendingByBarcode[item.barcode] && (
                        <div className="session-item-pending hint">{t("app.itemUpdating")}</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="session-unknown-section">
                  <div className="panel-header">
                    <h4>{t("app.unknownBarcodes")}</h4>
                    <div className="badge">
                      {t("app.positionsCount", { count: session.unknownList.length })}
                    </div>
                  </div>
                  {session.unknownList.length === 0 && (
                    <div className="empty">{t("app.unknownListAfterScans")}</div>
                  )}
                  {session.unknownList.length > 0 && (
                    <div className="session-unknown-list">
                      {session.unknownList.map((item) => (
                        <div key={`unknown-${item.barcode}`} className="session-unknown-row">
                          <div className="session-item-main">
                            <div className="session-item-left">
                              <span className="barcode">{item.barcode}</span>
                            </div>
                            <div className="summary">{item.quantity}</div>
                          </div>
                          <div className="session-item-actions">
                            <button
                              className="ghost tiny"
                              onClick={() => void handleDecrementUnknownItem(item.barcode)}
                              disabled={Boolean(session.pendingByBarcode[`unknown:${item.barcode}`])}
                            >
                              {t("app.decrement")}
                            </button>
                            <button
                              className="ghost tiny danger"
                              onClick={() => void handleRemoveUnknownItem(item.barcode)}
                              disabled={Boolean(session.pendingByBarcode[`unknown:${item.barcode}`])}
                            >
                              {t("app.delete")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <button
            className="ghost close-session-button"
            onClick={() => void handleCancelSession()}
          >
            {t("app.closeSession")}
          </button>
        </div>
      )}

      {undoToast && (
        <div className="undo-toast">
          <div className="undo-toast-text">
            {t("app.itemChangedToast", {
              barcode: undoToast.barcode,
              quantity: undoToast.quantity,
            })}
          </div>
          <button
            className="ghost small"
            onClick={() => void handleUndoToast()}
            disabled={undoToastLoading}
          >
            {undoToastLoading ? t("app.undoing") : t("app.undo")}
          </button>
        </div>
      )}

      {successToast && (
        <div className="success-toast" role="status" aria-live="polite">
          {successToast}
        </div>
      )}

      {errorToast && (
        <div className="error-toast" role="alert" aria-live="assertive">
          {errorToast}
        </div>
      )}

      {confirmDialog && (
        <div className="modal-overlay confirm-overlay" onClick={handleConfirmCancel}>
          <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-title">{t("app.confirmActionTitle")}</div>
            <div className="confirm-message">{confirmDialog.message}</div>
            <div className="confirm-actions">
              <button
                className="primary"
                onClick={handleConfirmCancel}
                disabled={confirmLoading}
              >
                {t("common.cancel")}
              </button>
              <button
                className="ghost"
                onClick={() => void handleConfirmAction()}
                disabled={confirmLoading}
              >
                {confirmLoading ? t("common.loading") : t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            settingsOverlayPressRef.current = event.target === event.currentTarget;
          }}
          onMouseUp={(event) => {
            const shouldClose =
              settingsOverlayPressRef.current && event.target === event.currentTarget;
            settingsOverlayPressRef.current = false;
            if (shouldClose) {
              setSettingsOpen(false);
            }
          }}
          onTouchStart={(event) => {
            settingsOverlayPressRef.current = event.target === event.currentTarget;
          }}
          onTouchEnd={(event) => {
            const shouldClose =
              settingsOverlayPressRef.current && event.target === event.currentTarget;
            settingsOverlayPressRef.current = false;
            if (shouldClose) {
              setSettingsOpen(false);
            }
          }}
        >
          <div
            className="modal-window"
            onClick={(event) => event.stopPropagation()}
          >
            <SettingsPanel
              catalogMeta={catalog.meta}
              catalogUploading={catalog.uploading}
              catalogDeleting={catalog.deleting}
              catalogDownloading={catalog.downloading}
              onUploadCatalog={async (file) => {
                await catalog.upload(file);
                await session.refresh();
              }}
              onDeleteCatalog={async () => {
                await catalog.remove();
                await session.refresh();
              }}
              onDownloadCatalog={async () => {
                await catalog.download();
                showSuccessToast(t("app.toastCatalogDownloaded"));
              }}
              emailSettings={emailSettings.settings}
              reportSettings={reportSettings.settings}
              serialSettings={serialSettings.settings}
              serialLoading={serialSettings.loading}
              serialSaving={serialSettings.saving}
              serialDetecting={serialSettings.detecting}
              reportLoading={reportSettings.loading}
              reportSaving={reportSettings.saving}
              onAutoDetectSerialScanner={async (payload) => {
                const data = await serialSettings.autoDetectAndSave(payload);
                showSuccessToast(t("app.toastScannerFound", { port: data.port }));
              }}
              onSaveSerialSettings={async (payload) => {
                const data = await serialSettings.save(payload);
                showSuccessToast(t("app.toastSerialSaved", { port: data.port }));
              }}
              onSaveReportSettings={async (outputDir) => {
                await reportSettings.save(outputDir);
                showSuccessToast(t("app.toastReportsSaved"));
              }}
              emailLoading={emailSettings.loading}
              emailSaving={emailSettings.saving}
              onSaveEmailSettings={async (payload) => {
                const data = await emailSettings.save(payload);
                showSuccessToast(
                  data.enabled
                    ? t("app.toastSmtpSaved")
                    : t("app.toastSmtpSavedDisabled")
                );
              }}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}

      {historyOpen && (
        <HistoryModal
          sessions={history.sessions}
          total={history.total}
          selectedSessionId={selectedSessionId}
          selectedDetails={selectedSessionDetails}
          loading={history.loading}
          loadingDetails={history.loadingSessionId === selectedSessionId}
          error={history.error}
          detailError={history.detailError}
          productDetails={history.productDetails}
          productErrors={history.productErrors}
          loadingProductBarcode={history.loadingProductBarcode}
          resumingSessionId={resumingSessionId}
          sessionActive={active}
          onClose={() => setHistoryOpen(false)}
          onRefresh={() => void history.refresh()}
          onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
          onExpandItem={(barcode) => void handleExpandHistoryItem(barcode)}
          onResumeSession={(sessionId) => void handleResumeSession(sessionId)}
        />
      )}
    </div>
  );
}
