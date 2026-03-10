import { useEffect, useState } from "react";

import { translate } from "../i18n";
import { fetchJson } from "../utils/http";
import type { ReportSettings } from "../types";

const REPORTS_OUTPUT_DIR_SETTING = "reports.output_dir";

type SystemSettingEntry = {
  name: string;
  value: unknown;
  updated_at: string | null;
};

export function useReportSettings(apiUrl: string) {
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<SystemSettingEntry>(
        `${apiUrl}/system-settings/${REPORTS_OUTPUT_DIR_SETTING}`
      );
      const next: ReportSettings = {
        output_dir: String(data.value ?? ""),
        updated_at: data.updated_at ?? null,
      };
      setSettings(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.reportsLoad"));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const save = async (outputDir: string) => {
    setSaving(true);
    setError(null);
    try {
      const normalized = outputDir.trim();
      if (!normalized) {
        throw new Error(translate("error.reportsPathRequired"));
      }

      const data = await fetchJson<{ items: SystemSettingEntry[] }>(
        `${apiUrl}/system-settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ name: REPORTS_OUTPUT_DIR_SETTING, value: normalized }],
          }),
        }
      );

      const entry = data.items?.[0];
      const next: ReportSettings = {
        output_dir: String(entry?.value ?? normalized),
        updated_at: entry?.updated_at ?? null,
      };
      setSettings(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : translate("error.reportsSave"));
      throw err;
    } finally {
      setSaving(false);
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
    error,
    refresh,
    save,
  };
}

