import { useI18n } from "../i18n";

export function RefreshPageButton() {
  const { t } = useI18n();
  const label = t("common.refresh");

  return (
    <button
      type="button"
      className="refresh-page-button"
      onClick={() => window.location.reload()}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M21 3v6h-6" />
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      </svg>
    </button>
  );
}
