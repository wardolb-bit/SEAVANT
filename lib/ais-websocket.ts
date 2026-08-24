const AIS_WS_HOST_KEY = "seavant-ais-ws-host";
const AIS_WS_PORT = 8081;
const WHEELHOUSE_AIS_WS_HOST = "10.129.4.102";
export const DEFAULT_AIS_WS_URL = `ws://${WHEELHOUSE_AIS_WS_HOST}:${AIS_WS_PORT}`;

function isLocalAisUrl(url: string) {
  return /^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url.trim());
}

export function getAisWebSocketUrl(defaultUrl = DEFAULT_AIS_WS_URL) {
  if (typeof window === "undefined") return defaultUrl;

  const params = new URLSearchParams(window.location.search);
  const queryUrl = params.get("aisWs")?.trim();
  const queryHost = params.get("aisHost")?.trim();

  if (queryUrl) {
    window.localStorage.setItem(AIS_WS_HOST_KEY, queryUrl);
    return queryUrl;
  }

  if (queryHost) {
    const hasPort = /:\d+$/.test(queryHost);
    const url = queryHost.includes("://")
      ? queryHost
      : `ws://${queryHost}${hasPort ? "" : `:${AIS_WS_PORT}`}`;
    window.localStorage.setItem(AIS_WS_HOST_KEY, url);
    return url;
  }

  const storedUrl = window.localStorage.getItem(AIS_WS_HOST_KEY)?.trim();
  if (storedUrl && !isLocalAisUrl(storedUrl)) return storedUrl;

  if (storedUrl && isLocalAisUrl(storedUrl)) {
    window.localStorage.setItem(AIS_WS_HOST_KEY, DEFAULT_AIS_WS_URL);
  }

  return defaultUrl;
}

export function clearAisWebSocketOverride() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AIS_WS_HOST_KEY);
  }
}
