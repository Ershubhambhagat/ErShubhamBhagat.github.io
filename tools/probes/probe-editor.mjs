/**
 * Accessibility probe for tools/json-editor.
 *
 * Why a browser and not source reading: accessible names, the roving tabindex
 * and the computed contrast depend on what the DOM ends up as after app.js has
 * rendered the table and the form. Source inspection cannot see that.
 *
 * Run with the local server on :8123 and Chrome on :9222.
 */
const PORT = "9222";
const PAGE = "http://127.0.0.1:8123/tools/json-editor/index.html";

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const logs = [];
let id = 0;

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    logs.push("console.error: " + message.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (message.method === "Runtime.exceptionThrown") {
    logs.push("EXC: " + message.params.exceptionDetails.text + " " + (message.params.exceptionDetails.exception?.description ?? ""));
  }
});

await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });

const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text + " " + JSON.stringify(response.result.exceptionDetails.exception?.description ?? ""));
  }
  return response.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

const loaded = await send("Page.navigate", { url: PAGE });
if (loaded.error) throw new Error("navigate failed: " + loaded.error.message);

// app.js loads eleven JSON files before it renders anything.
for (let i = 0; i < 60; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const ready = await evaluate("Boolean(document.getElementById('record-table')?.querySelector('tbody tr'))");
  if (ready) break;
}

const report = await evaluate(`(() => {
  const out = { failures: [], notes: [] };
  const fail = (what, detail) => out.failures.push({ check: what, detail });

  /* ---- tabs pattern ---------------------------------------------------- */
  const tablist = document.querySelector('[role="tablist"]');
  const tabs = [...document.querySelectorAll('[role="tab"]')];

  if (!tablist) fail("tablist", "no [role=tablist]");
  if (tabs.length !== 2) fail("tabs", "expected 2 tabs, found " + tabs.length);

  for (const tab of tabs) {
    const controls = tab.getAttribute("aria-controls");
    const panel = controls && document.getElementById(controls);
    if (!controls) fail("aria-controls", tab.id + " has none");
    else if (!panel) fail("aria-controls", tab.id + " points at missing id " + controls);
    else {
      if (panel.getAttribute("role") !== "tabpanel") fail("tabpanel role", controls + " is not role=tabpanel");
      if (panel.getAttribute("aria-labelledby") !== tab.id) fail("aria-labelledby", controls + " does not point back at " + tab.id);
    }
    if (!tab.hasAttribute("aria-selected")) fail("aria-selected", tab.id + " missing");
  }

  const inTabOrder = tabs.filter((tab) => tab.tabIndex === 0);
  if (inTabOrder.length !== 1) fail("roving tabindex", inTabOrder.length + " tabs are reachable in the tab order, expected 1");
  if (inTabOrder.length === 1 && inTabOrder[0].getAttribute("aria-selected") !== "true") {
    fail("roving tabindex", "the reachable tab is not the selected one");
  }

  /* ---- switch to the JSON tab and back --------------------------------- */
  const formTab = tabs.find((tab) => tab.dataset.tab === "form");
  const jsonTab = tabs.find((tab) => tab.dataset.tab === "json");
  jsonTab.click();
  const jsonPanel = document.getElementById("preview-wrap");
  const formPanel = document.getElementById("panel-form");
  if (jsonPanel.hidden) fail("panel toggle", "JSON panel still hidden after selecting its tab");
  if (!formPanel.hidden) fail("panel toggle", "form panel still visible after selecting the JSON tab");
  if (jsonTab.getAttribute("aria-selected") !== "true") fail("panel toggle", "JSON tab not marked selected");
  if (jsonTab.tabIndex !== 0 || formTab.tabIndex !== -1) fail("roving tabindex", "tabindex did not follow the selection");

  formTab.click();
  if (formPanel.hidden) fail("panel toggle", "form panel stayed hidden after selecting its tab");
  if (!jsonPanel.hidden) fail("panel toggle", "JSON panel stayed visible");

  /* ---- arrow keys move focus and follow --------------------------------- */
  const key = (target, name) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

  formTab.focus();
  key(formTab, "ArrowRight");
  if (document.activeElement !== jsonTab) fail("arrow key", "ArrowRight did not focus the JSON tab");
  if (jsonTab.getAttribute("aria-selected") !== "true") fail("arrow key", "ArrowRight did not activate the JSON tab");

  key(jsonTab, "ArrowLeft");
  if (document.activeElement !== formTab) fail("arrow key", "ArrowLeft did not focus the Form tab");
  if (formTab.getAttribute("aria-selected") !== "true") fail("arrow key", "ArrowLeft did not activate the Form tab");

  key(formTab, "End");
  if (document.activeElement !== jsonTab) fail("arrow key", "End did not jump to the last tab");
  key(jsonTab, "Home");
  if (document.activeElement !== formTab) fail("arrow key", "Home did not jump to the first tab");

  /* ---- accessible names on every interactive control ------------------- */
  const named = (node) => {
    if (node.getAttribute("aria-label")) return node.getAttribute("aria-label").trim();
    const labelledby = node.getAttribute("aria-labelledby");
    if (labelledby) return labelledby.split(/\\s+/).map((ref) => document.getElementById(ref)?.textContent ?? "").join(" ").trim();
    if (node.id) {
      const label = document.querySelector('label[for="' + node.id + '"]');
      if (label) return label.textContent.trim();
    }
    const wrapping = node.closest("label");
    if (wrapping) return wrapping.textContent.trim();
    return (node.textContent ?? "").trim();
  };

  const controls = [...document.querySelectorAll("button, input, select, textarea, a[href]")];
  const unnamed = controls.filter((node) => !named(node)).map((node) => node.tagName + (node.id ? "#" + node.id : "." + node.className));
  if (unnamed.length > 0) fail("accessible name", "controls without a name: " + unnamed.join(", "));

  /* ---- decorative glyph buttons must announce a verb ------------------- */
  const glyphOnly = [...document.querySelectorAll("button")].filter((node) => {
    const text = (node.textContent ?? "").trim();
    return text.length <= 2 && /[^\\w\\s]/.test(text);
  });
  const glyphUnnamed = glyphOnly.filter((node) => !node.getAttribute("aria-label"));
  if (glyphUnnamed.length > 0) fail("glyph button", glyphUnnamed.length + " symbol-only buttons have no aria-label");

  /* ---- live regions ---------------------------------------------------- */
  for (const id of ["connection-status", "draft-status"]) {
    const node = document.getElementById(id);
    if (!node) fail("live region", id + " missing");
    else if (node.getAttribute("aria-live") !== "polite") fail("live region", id + " is not aria-live=polite");
  }

  /* ---- table semantics ------------------------------------------------- */
  const table = document.getElementById("record-table");
  if (table) {
    if (!table.querySelector("caption")) fail("table", "no caption");
    const headers = [...table.querySelectorAll("th")];
    if (headers.length === 0) fail("table", "no th cells");
    if (headers.some((th) => th.getAttribute("scope") !== "col")) fail("table", "a th is missing scope=col");
    if (!table.querySelector("tbody tr")) fail("table", "no data rows rendered");
  } else {
    fail("table", "#record-table missing");
  }

  /* ---- contrast of the muted text on its own background ---------------- */
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (value) => (value.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
  const solidBackground = (node) => {
    let current = node;
    while (current) {
      const colour = getComputedStyle(current).backgroundColor;
      const parts = colour.match(/[\\d.]+/g) ?? [];
      if (parts.length < 3) current = current.parentElement;
      else if (parts.length === 3 || Number(parts[3]) > 0.9) return parse(colour);
      else current = current.parentElement;
    }
    return [255, 255, 255];
  };
  const ratio = (a, b) => {
    const [light, dark] = luminance(a) > luminance(b) ? [a, b] : [b, a];
    return (luminance(light) + 0.05) / (luminance(dark) + 0.05);
  };

  const samples = [
    ["body text", document.querySelector(".sidebar__title")],
    ["muted text", document.querySelector(".muted")],
    ["dataset button", document.querySelector("[data-dataset-key], .dataset-button")],
    ["table cell", document.querySelector("#record-table tbody td")],
    ["tab", document.querySelector('[role="tab"]')]
  ];

  out.contrast = [];
  for (const [label, node] of samples) {
    if (!node) continue;
    const style = getComputedStyle(node);
    const value = ratio(parse(style.color), solidBackground(node));
    out.contrast.push({ label, ratio: Number(value.toFixed(2)), size: style.fontSize });
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    if (value < (large ? 3 : 4.5)) fail("contrast", label + " is " + value.toFixed(2) + ":1");
  }

  /* ---- the selected row must be more than a colour change -------------- */
  const selected = document.querySelector("#record-table tbody tr.is-selected");
  out.notes.push(selected ? "selected row present" : "no row selected at load");

  return out;
})()`);

console.log(JSON.stringify(report, null, 2));
if (logs.length) console.log("LOGS:\n" + logs.join("\n"));
ws.close();
