import { useEffect, useState } from "react";

import { translate } from "../i18n";
import { fetchJson } from "../utils/http";
import type { EmailSettings, EmailSettingsSavePayload } from "../types";

export function useEmailSettings(apiUrl: string) {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<EmailSettings>(`${apiUrl}/notifications/email/settings`);
      setSettings(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.emailLoad"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const save = async (payload: EmailSettingsSavePayload) => {
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const data = await fetchJson<EmailSettings>(`${apiUrl}/notifications/email/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(data);
      setStatusMessage(
        data.enabled
          ? translate("email.status.saved")
          : translate("email.status.disabled")
      );
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.emailSave"));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const test = async (payload: EmailSettingsSavePayload) => {
    setTesting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const data = await fetchJson<{ ok: boolean; detail: string }>(
        `${apiUrl}/notifications/email/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      setStatusMessage(data.detail || translate("email.status.tested"));
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.emailTest"));
      throw err;
    } finally {
      setTesting(false);
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
    testing,
    error,
    statusMessage,
    refresh,
    save,
    test,
  };
}
