const DEFAULT_API_URL = "http://localhost:8059";
const DEFAULT_WS_URL = "ws://localhost:8059/ws";

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildWsUrlFromApi(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}/ws`;
  } catch {
    return DEFAULT_WS_URL;
  }
}

export function useSettings() {
  const query = new URLSearchParams(window.location.search);
  const queryApiUrl = normalizeUrl(query.get("apiUrl"));
  const queryWsUrl = normalizeUrl(query.get("wsUrl"));
  const runtime = window.__APP_RUNTIME_CONFIG__;
  const apiUrl =
    queryApiUrl ?? normalizeUrl(runtime?.apiUrl) ?? DEFAULT_API_URL;
  const wsUrl =
    queryWsUrl ??
    normalizeUrl(runtime?.wsUrl) ??
    (apiUrl ? buildWsUrlFromApi(apiUrl) : DEFAULT_WS_URL);

  return {
    apiUrl,
    wsUrl,
  };
}
