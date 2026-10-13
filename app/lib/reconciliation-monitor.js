export function monitorEndpoint(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "hc-ping.com" || url.port ||
      url.username || url.password || url.search || url.hash ||
      !/^\/[a-f0-9-]{36}$/.test(url.pathname)) throw new Error("Invalid reconciliation monitor");
  return url.href;
}

// Monitoring outages must not prevent order processing. Never transmit order
// details, exceptions or credentials; failure reporting uses an empty body.
export async function monitoredReconciliation(task, { url, fetcher = fetch } = {}) {
  let endpoint;
  try { endpoint = monitorEndpoint(url); }
  catch { await task(); throw new Error("Reconciliation monitoring configuration failed"); }
  let deliveryFailed = false;
  const ping = async suffix => {
    if (!endpoint) return;
    try {
      const response = await fetcher(endpoint + suffix, { method: "POST", body: "",
        redirect: "error", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Monitor unavailable");
    } catch { deliveryFailed = true; }
  };
  await ping("/start");
  let result;
  try { result = await task(); }
  catch { await ping("/fail"); throw new Error("Order reconciliation failed"); }
  // The caller's concurrency guard excludes busy runs before entering here.
  // A persisted batch with review items is not a healthy reconciliation result.
  await ping(result?.issues?.length ? "/fail" : "");
  if (deliveryFailed) throw new Error("Reconciliation monitor delivery failed");
  return result;
}
