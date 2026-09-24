import { useEffect, useState } from "preact/hooks";

/* eslint-disable react/prop-types */
export function ArtworkDownload({
  apiUrl,
  recordId,
  kind,
  label,
  getSessionToken,
}) {
  const [state, setState] = useState({ busy: false, url: "", error: "" });
  useEffect(() => {
    if (!state.url) return;
    const timer = setTimeout(
      () => setState({ busy: false, url: "", error: "" }),
      50000,
    );
    return () => clearTimeout(timer);
  }, [state.url]);
  async function prepare() {
    setState({ busy: true, url: "", error: "" });
    try {
      const token = await getSessionToken();
      const endpoint = new URL(apiUrl);
      endpoint.pathname = endpoint.pathname.replace(/\/portal\/?$/, "/artwork");
      endpoint.search = "";
      endpoint.hash = "";
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recordId, kind }),
      });
      const result = await response.json();
      if (!response.ok || !result.url)
        throw new Error(result.error || "Unable to prepare download.");
      const download = new URL(result.url);
      if (
        download.protocol !== "https:" ||
        !download.hostname.endsWith(".r2.cloudflarestorage.com")
      )
        throw new Error("Invalid download response.");
      setState({ busy: false, url: download.toString(), error: "" });
    } catch (error) {
      setState({
        busy: false,
        url: "",
        error:
          error instanceof Error
            ? error.message
            : "Unable to prepare download.",
      });
    }
  }
  return (
    <s-stack direction="block" gap="small-200">
      {state.url ? (
        <s-link href={state.url} target="_blank">
          {label}
        </s-link>
      ) : (
        <s-button disabled={state.busy} onClick={prepare}>
          {state.busy ? "Preparing download…" : "Prepare secure download"}
        </s-button>
      )}
      {state.url && (
        <s-text color="subdued">
          This download link expires shortly. Prepare a new link if needed.
        </s-text>
      )}
      {state.error && <s-text>{state.error}</s-text>}
    </s-stack>
  );
}
