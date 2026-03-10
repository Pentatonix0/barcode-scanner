import { useEffect, useMemo, useState } from "react";
import { translate } from "../i18n";
import { fetchJson } from "../utils/http";
import type {
  SessionItems,
  SessionStatus,
  SessionStopResult,
  WsPayload,
} from "../types";

function extractNameFromFields(fields: unknown): string | null {
  if (!fields || typeof fields !== "object") return null;
  const entries = Object.entries(fields as Record<string, unknown>);
  const keys = new Map(entries.map(([key]) => [key.trim().toLowerCase(), key]));
  for (const candidate of ["name", "наименование", "title", "product_name"]) {
    const originalKey = keys.get(candidate);
    if (!originalKey) continue;
    const value = (fields as Record<string, unknown>)[originalKey];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function extractNameFromPayload(payload: WsPayload): string | null {
  if (typeof payload.name === "string" && payload.name.trim()) {
    return payload.name.trim();
  }
  return extractNameFromFields(payload.fields);
}

export function useSession(apiUrl: string) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [items, setItems] = useState<Record<string, number>>({});
  const [unknownItems, setUnknownItems] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [unknownOrder, setUnknownOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const [pendingByBarcode, setPendingByBarcode] = useState<Record<string, boolean>>(
    {}
  );
  const [undoingLastScan, setUndoingLastScan] = useState(false);

  const syncItemsSnapshot = (snapshot: SessionItems) => {
    const nextItems = (snapshot.items ?? []).reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.barcode] = item.quantity;
        return acc;
      },
      {}
    );
    const nextUnknownItems = (snapshot.unknown_items ?? []).reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.barcode] = item.quantity;
        return acc;
      },
      {}
    );
    setItems(nextItems);
    setUnknownItems(nextUnknownItems);
    setNames((prev) => {
      const next = { ...prev };
      const activeBarcodes = new Set<string>();
      for (const item of snapshot.items ?? []) {
        activeBarcodes.add(item.barcode);
        const normalizedName = String(item.name ?? "").trim();
        next[item.barcode] = normalizedName || next[item.barcode] || item.barcode;
      }
      for (const barcode of Object.keys(next)) {
        if (!activeBarcodes.has(barcode)) {
          delete next[barcode];
        }
      }
      return next;
    });
    setOrder((snapshot.items ?? []).map((item) => item.barcode));
    setUnknownOrder((snapshot.unknown_items ?? []).map((item) => item.barcode));
    setStatus((prev) => {
      const base: SessionStatus =
        prev ?? {
          active: true,
          session_id: null,
          started_at: null,
          catalog_loaded: true,
          total_items: 0,
          total_unique: 0,
          total_unknown: 0,
        };
      return {
        ...base,
        total_items: Number(snapshot.total_items ?? 0),
        total_unique: Number(snapshot.total_unique ?? 0),
        total_unknown: Number(snapshot.total_unknown ?? 0),
      };
    });
  };

  const withBarcodePending = async <T>(
    barcode: string,
    action: () => Promise<T>
  ): Promise<T> => {
    setPendingByBarcode((prev) => ({ ...prev, [barcode]: true }));
    try {
      return await action();
    } finally {
      setPendingByBarcode((prev) => {
        const next = { ...prev };
        delete next[barcode];
        return next;
      });
    }
  };

  const refresh = async () => {
    setError(null);
    try {
      const [statusRes, itemsRes] = await Promise.all([
        fetchJson<SessionStatus>(`${apiUrl}/session/status`),
        fetchJson<SessionItems>(`${apiUrl}/session/items`),
      ]);
      setStatus(statusRes);
      syncItemsSnapshot(itemsRes);
      setPendingByBarcode({});
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.session"));
    }
  };

  const start = async () => {
    setError(null);
    try {
      const data = await fetchJson<SessionStatus>(`${apiUrl}/session/start`, {
        method: "POST",
      });
      setStatus(data);
      setItems({});
      setUnknownItems({});
      setNames({});
      setOrder([]);
      setUnknownOrder([]);
      setPendingByBarcode({});
      setEmailHint(null);
      setLastExportPath(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : translate("error.sessionStart");
      setError(message);
      throw err;
    }
  };

  const stop = async () => {
    setError(null);
    try {
      const result = await fetchJson<SessionStopResult>(`${apiUrl}/session/stop`, {
        method: "POST",
      });
      setLastExportPath(result.excel_path);
      if (result.email_status === "sent") {
        setEmailHint(translate("session.emailSent"));
      } else if (result.email_status === "failed") {
        setEmailHint(translate("session.emailFailed"));
      } else {
        setEmailHint(translate("session.emailDisabled"));
      }
      await refresh();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : translate("error.sessionStop");
      setError(message);
      throw err;
    }
  };

  const resume = async (sessionId: number) => {
    setError(null);
    try {
      const data = await fetchJson<SessionStatus>(`${apiUrl}/sessions/${sessionId}/resume`, {
        method: "POST",
      });
      setStatus(data);
      const itemsRes = await fetchJson<SessionItems>(`${apiUrl}/session/items`);
      syncItemsSnapshot(itemsRes);
      setPendingByBarcode({});
      setEmailHint(null);
      setLastExportPath(null);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : translate("error.sessionResume");
      setError(message);
      throw err;
    }
  };

  const cancel = async () => {
    setError(null);
    try {
      const data = await fetchJson<SessionStatus>(`${apiUrl}/session/cancel`, {
        method: "POST",
      });
      setStatus(data);
      setItems({});
      setUnknownItems({});
      setNames({});
      setOrder([]);
      setUnknownOrder([]);
      setPendingByBarcode({});
      setEmailHint(null);
      setLastExportPath(null);
      return data;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : translate("error.sessionCancel");
      setError(message);
      throw err;
    }
  };

  const applyScan = (payload: WsPayload) => {
    if (
      payload.type === "scan" ||
      payload.type === "unknown_scan" ||
      payload.type === "session_item_updated" ||
      payload.type === "session_item_removed" ||
      payload.type === "session_undo" ||
      payload.type === "session_unknown_undo"
    ) {
      if (!payload.barcode) return;
      const barcode = String(payload.barcode);
      const quantity = Number(payload.quantity ?? 0);
      const isUnknown =
        payload.type === "unknown_scan" ||
        payload.type === "session_unknown_undo" ||
        Boolean(payload.unknown);

      if (isUnknown) {
        setUnknownItems((prev) => {
          if (quantity <= 0) {
            const next = { ...prev };
            delete next[barcode];
            return next;
          }
          return {
            ...prev,
            [barcode]: quantity,
          };
        });
        setUnknownOrder((prev) => {
          if (quantity <= 0) {
            return prev.filter((value) => value !== barcode);
          }
          if (payload.type === "unknown_scan") {
            return [barcode, ...prev.filter((value) => value !== barcode)];
          }
          if (prev.includes(barcode)) {
            return prev;
          }
          return [barcode, ...prev];
        });
      } else {
        const resolvedName = extractNameFromPayload(payload);
        setItems((prev) => {
          if (quantity <= 0) {
            const next = { ...prev };
            delete next[barcode];
            return next;
          }
          return {
            ...prev,
            [barcode]: quantity,
          };
        });
        if (quantity > 0 && resolvedName) {
          setNames((prev) => ({ ...prev, [barcode]: resolvedName }));
        }
        setOrder((prev) => {
          if (quantity <= 0) {
            return prev.filter((value) => value !== barcode);
          }

          if (payload.type === "scan") {
            return [barcode, ...prev.filter((value) => value !== barcode)];
          }

          if (prev.includes(barcode)) {
            return prev;
          }
          return [barcode, ...prev];
        });
      }
    } else {
      return;
    }

    setStatus((prev) => {
      const base: SessionStatus =
        prev ?? {
          active: true,
          session_id: null,
          started_at: null,
          catalog_loaded: true,
          total_items: 0,
          total_unique: 0,
          total_unknown: 0,
        };
      return {
        ...base,
        total_items: Number(payload.total_items ?? base.total_items),
        total_unique: Number(payload.total_unique ?? base.total_unique),
        total_unknown: Number(payload.total_unknown ?? base.total_unknown),
      };
    });
  };

  const decrementItem = async (barcode: string) =>
    withBarcodePending(barcode, async () => {
      setError(null);
      try {
        const snapshot = await fetchJson<SessionItems>(
          `${apiUrl}/session/items/${encodeURIComponent(barcode)}/decrement`,
          { method: "POST" }
        );
        syncItemsSnapshot(snapshot);
        return snapshot;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : translate("error.sessionDecrement");
        setError(message);
        throw err;
      }
    });

  const decrementUnknownItem = async (barcode: string) =>
    withBarcodePending(`unknown:${barcode}`, async () => {
      setError(null);
      try {
        const snapshot = await fetchJson<SessionItems>(
          `${apiUrl}/session/unknown-items/${encodeURIComponent(barcode)}/decrement`,
          { method: "POST" }
        );
        syncItemsSnapshot(snapshot);
        return snapshot;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : translate("error.sessionDecrement");
        setError(message);
        throw err;
      }
    });

  const removeItem = async (barcode: string) =>
    withBarcodePending(barcode, async () => {
      setError(null);
      try {
        const snapshot = await fetchJson<SessionItems>(
          `${apiUrl}/session/items/${encodeURIComponent(barcode)}`,
          { method: "DELETE" }
        );
        syncItemsSnapshot(snapshot);
        return snapshot;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : translate("error.sessionRemove");
        setError(message);
        throw err;
      }
    });

  const removeUnknownItem = async (barcode: string) =>
    withBarcodePending(`unknown:${barcode}`, async () => {
      setError(null);
      try {
        const snapshot = await fetchJson<SessionItems>(
          `${apiUrl}/session/unknown-items/${encodeURIComponent(barcode)}`,
          { method: "DELETE" }
        );
        syncItemsSnapshot(snapshot);
        return snapshot;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : translate("error.sessionRemove");
        setError(message);
        throw err;
      }
    });

  const incrementItem = async (barcode: string, amount = 1) =>
    withBarcodePending(barcode, async () => {
      setError(null);
      try {
        const snapshot = await fetchJson<SessionItems>(
          `${apiUrl}/session/items/${encodeURIComponent(barcode)}/increment?amount=${amount}`,
          { method: "POST" }
        );
        syncItemsSnapshot(snapshot);
        return snapshot;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : translate("error.sessionRestore");
        setError(message);
        throw err;
      }
    });

  const undoLastScan = async () => {
    setUndoingLastScan(true);
    setError(null);
    try {
      const snapshot = await fetchJson<SessionItems>(`${apiUrl}/session/undo-last-scan`, {
        method: "POST",
      });
      syncItemsSnapshot(snapshot);
      return snapshot;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : translate("error.sessionUndo");
      setError(message);
      throw err;
    } finally {
      setUndoingLastScan(false);
    }
  };

  const list = useMemo(
    () => {
      const ordered = order
        .map((barcode) => {
          const quantity = items[barcode];
          if (quantity === undefined) return null;
          return { barcode, name: names[barcode] || barcode, quantity };
        })
        .filter(
          (item): item is { barcode: string; name: string; quantity: number } =>
            item !== null
        );

      if (ordered.length === Object.keys(items).length) {
        return ordered;
      }

      const seen = new Set(ordered.map((item) => item.barcode));
      const leftovers = Object.entries(items)
        .filter(([barcode]) => !seen.has(barcode))
        .map(([barcode, quantity]) => ({
          barcode,
          name: names[barcode] || barcode,
          quantity,
        }));

      return [...ordered, ...leftovers];
    },
    [items, names, order]
  );

  const unknownList = useMemo(
    () => {
      const ordered = unknownOrder
        .map((barcode) => {
          const quantity = unknownItems[barcode];
          if (quantity === undefined) return null;
          return { barcode, quantity };
        })
        .filter((item): item is { barcode: string; quantity: number } => item !== null);

      if (ordered.length === Object.keys(unknownItems).length) {
        return ordered;
      }

      const seen = new Set(ordered.map((item) => item.barcode));
      const leftovers = Object.entries(unknownItems)
        .filter(([barcode]) => !seen.has(barcode))
        .map(([barcode, quantity]) => ({ barcode, quantity }));

      return [...ordered, ...leftovers];
    },
    [unknownItems, unknownOrder]
  );

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  return {
    status,
    items,
    unknownItems,
    list,
    unknownList,
    error,
    emailHint,
    lastExportPath,
    refresh,
    start,
    stop,
    resume,
    cancel,
    decrementItem,
    decrementUnknownItem,
    removeItem,
    removeUnknownItem,
    incrementItem,
    undoLastScan,
    pendingByBarcode,
    undoingLastScan,
    applyScan,
    setStatus,
  };
}
