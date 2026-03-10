import { useI18n } from "../i18n";

export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="language-switch" role="group" aria-label="Language switch">
      <button
        type="button"
        className={`language-option ${language === "ru" ? "active" : ""}`}
        onClick={() => setLanguage("ru")}
      >
        {t("lang.ru")}
      </button>
      <button
        type="button"
        className={`language-option ${language === "en" ? "active" : ""}`}
        onClick={() => setLanguage("en")}
      >
        {t("lang.en")}
      </button>
    </div>
  );
}
