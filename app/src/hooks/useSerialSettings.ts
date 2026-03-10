import { useEffect, useState } from "react";

import { translate } from "../i18n";
import { fetchJson } from "../utils/http";
import type {
  SerialAutoDetectResult,
  SerialSettings,
  SerialSettingsSavePayload,
} from "../types";

export function useSerialSettings(apiUrl: string) {
  const [settings, setSettings] = useState<SerialSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<SerialSettings>(`${apiUrl}/serial/settings`);
      setSettings(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.serialLoad"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const save = async (payload: SerialSettingsSavePayload) => {
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const data = await fetchJson<SerialSettings>(`${apiUrl}/serial/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(data);
      setStatusMessage(
        data.enabled
          ? translate("serial.status.saved", {
              status: data.running
                ? translate("serial.status.running")
                : translate("serial.status.stopped"),
            })
          : translate("serial.status.disabled")
      );
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.serialSave"));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const autoDetectAndSave = async (payload: SerialSettingsSavePayload) => {
    setDetecting(true);
    setError(null);
    setStatusMessage(translate("common.search"));
    try {
      const result = await fetchJson<SerialAutoDetectResult>(
        `${apiUrl}/serial/auto-detect`,
        { method: "POST" }
      );
      const saved = await save({ ...payload, port: result.port });
      setStatusMessage(
        translate("serial.status.detected", {
          port: result.port,
          barcode: result.barcode,
        })
      );
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.serialDetect"));
      throw err;
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  return {
    settings,
    loading,
    saving,
    detecting,
    error,
    statusMessage,
    refresh,
    save,
    autoDetectAndSave,
  };
}
