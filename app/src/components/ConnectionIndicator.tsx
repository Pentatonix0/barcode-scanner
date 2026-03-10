import { useI18n } from "../i18n";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type ConnectionIndicatorProps = {
  status: ConnectionStatus;
};

export function ConnectionIndicator({ status }: ConnectionIndicatorProps) {
  const { t } = useI18n();
  const labelByStatus: Record<ConnectionStatus, string> = {
    disconnected: t("connection.disconnected"),
    connecting: t("connection.connecting"),
    connected: t("connection.connected"),
    error: t("connection.error"),
  };

  return (
    <div className="connection-indicator" role="status" aria-live="polite">
      <span className={`dot ${status}`} />
      <span>{labelByStatus[status]}</span>
    </div>
  );
}
