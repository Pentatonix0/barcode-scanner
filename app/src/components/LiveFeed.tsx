import { useI18n } from "../i18n";
import type { WsMessage, WsPayload } from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type LiveFeedProps = {
  lastMessage: WsMessage | null;
  history: WsMessage[];
};

export function LiveFeed({ lastMessage, history }: LiveFeedProps) {
  const { t } = useI18n();
  const lastPayload = lastMessage?.payload;
  const lastObject = isObject(lastPayload)
    ? (lastPayload as WsPayload)
    : null;
  const fields =
    lastObject?.fields && isObject(lastObject.fields)
      ? (lastObject.fields as Record<string, unknown>)
      : null;

  return (
    <div className="grid">
      <section className="panel">
        <h2>{t("feed.lastEvent")}</h2>
        {!lastMessage && <div className="empty">{t("feed.waiting")}</div>}
        {lastMessage && (
          <div className="card">
            <div className="meta">
              <div>
                <div className="label">{t("feed.time")}</div>
                <div className="value">{lastMessage.receivedAt}</div>
              </div>
              <div>
                <div className="label">{t("feed.type")}</div>
                <div className="value">{lastObject?.type ?? t("common.notAvailable")}</div>
              </div>
              <div>
                <div className="label">{t("app.barcode")}</div>
                <div className="value">{lastObject?.barcode ?? t("common.notAvailable")}</div>
              </div>
            </div>
            {fields ? (
              <div className="table">
                {Object.entries(fields).map(([key, value]) => (
                  <div key={key} className="row">
                    <div className="key">{key}</div>
                    <div className="val">{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <pre className="raw">
                {JSON.stringify(lastPayload, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t("feed.tape")}</h2>
        {history.length === 0 && (
          <div className="empty">{t("feed.empty")}</div>
        )}
        <div className="list">
          {history.map((item) => {
            const payload = item.payload;
            const payloadObject = isObject(payload)
              ? (payload as WsPayload)
              : null;

            return (
              <div key={item.id} className="list-item">
                <div className="time">{item.receivedAt}</div>
                <div className="barcode">
                  {payloadObject?.barcode ?? payloadObject?.type ?? t("common.notAvailable")}
                </div>
                <div className="summary">
                  {payloadObject?.type ??
                    (typeof payload === "string" ? payload : t("feed.object"))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
