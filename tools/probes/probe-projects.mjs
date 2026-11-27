/**
 * PROJ-006 probe: a featured project must render as a featured card with a
 * "Featured" badge, and its status must be visible rather than only in a dialog.
 */
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
ws.addEventListener("message", (event) => {
  const m = JSON.parse(event.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:8123/index.html" });
await new Promise((r) => setTimeout(r, 3500));

const result = await send("Runtime.evaluate", {
  expression: `(() => {
    const featured = [...document.querySelectorAll(".card--featured")];
    const standard = [...document.querySelectorAll(".card--standard")];
    const featuredBadge = featured.some((card) => [...card.querySelectorAll(".badge")].some((badge) => /featured/i.test(badge.textContent ?? "")));
    const statusMeta = [...document.querySelectorAll(".card__meta-row")]
      .filter((row) => /status/i.test(row.querySelector(".card__meta-label")?.textContent ?? ""))
      .map((row) => (row.querySelector(".card__meta-value")?.textContent ?? "").trim());
    return JSON.stringify({
      featuredCards: featured.length,
      standardCards: standard.length,
      featuredBadge,
      statusRows: statusMeta.length,
      statusValues: [...new Set(statusMeta)].slice(0, 5)
    });
  })()`,
  returnByValue: true
});

console.log(result.result?.result?.value ?? JSON.stringify(result));
ws.close();
