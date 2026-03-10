import { useI18n } from "../i18n";
import type { SessionStatus } from "../types";

type BasketItem = {
  barcode: string;
  quantity: number;
};

type CurrentBasketProps = {
  items: BasketItem[];
  status: SessionStatus | null;
};

export function CurrentBasket({ items, status }: CurrentBasketProps) {
  const { t } = useI18n();

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("basket.title")}</h2>
        <div className="badge">{t("app.positionsCount", { count: items.length })}</div>
      </div>
      {!status?.active && (
        <div className="hint">{t("basket.inactiveHint")}</div>
      )}
      {items.length === 0 && status?.active && (
        <div className="empty">{t("basket.empty")}</div>
      )}
      <div className="list">
        {items.map((item) => (
          <div key={item.barcode} className="list-item">
            <div className="time">{t("basket.units")}</div>
            <div className="barcode">{item.barcode}</div>
            <div className="summary">{item.quantity}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
