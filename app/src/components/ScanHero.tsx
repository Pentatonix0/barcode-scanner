import { useI18n } from "../i18n";
import type { SessionStatus } from "../types";

type ScanHeroProps = {
  status: SessionStatus | null;
  catalogLoaded: boolean;
  onStart: () => void;
  onStop: () => void;
  error: string | null;
};

export function ScanHero({
  status,
  catalogLoaded,
  onStart,
  onStop,
  error,
}: ScanHeroProps) {
  const { t, locale } = useI18n();
  const active = status?.active ?? false;
  const startedAt = status?.started_at
    ? new Date(status.started_at).toLocaleString(locale)
    : t("common.notAvailable");

  const buttonLabel = active ? t("app.stopScan") : t("app.startScan");
  const disabled = active ? false : !catalogLoaded;

  return (
    <section className="panel hero-panel">
      <div className="hero-left">
        <div className="eyebrow">Warehouse</div>
        <h1>{t("hero.title")}</h1>
        <p>
          {t("hero.description")}
        </p>
      </div>
      <div className="hero-right">
        <button
          className="primary large"
          onClick={active ? onStop : onStart}
          disabled={disabled}
        >
          {buttonLabel}
        </button>
        {!catalogLoaded && (
          <div className="hint">
            {t("hero.catalogHint")}
          </div>
        )}
        {error && <div className="hint error">{error}</div>}
        <div className="kpis">
          <div>
            <div className="label">{t("hero.status")}</div>
            <div className="value">{active ? t("hero.statusActive") : t("hero.statusInactive")}</div>
          </div>
          <div>
            <div className="label">{t("hero.start")}</div>
            <div className="value">{startedAt}</div>
          </div>
          <div>
            <div className="label">{t("app.totalScans")}</div>
            <div className="value">{status?.total_items ?? 0}</div>
          </div>
          <div>
            <div className="label">{t("app.totalUnique")}</div>
            <div className="value">{status?.total_unique ?? 0}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
