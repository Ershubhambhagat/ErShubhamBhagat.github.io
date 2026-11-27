/**
 * Browser probe for the Theme Studio layout and component controls.
 *
 * The round-2 audit scored THEME-003/THEME-004 on "layout tokens are not exposed"
 * and "no per-component controls". This probe answers that from the rendered
 * panel: are the controls there, do they write the token, does undo restore it,
 * and is every control labelled.
 */
const PAGE = "http://127.0.0.1:8123/index.html";

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
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
  if (message.method === "Runtime.exceptionThrown") {
    logs.push("EXC: " + message.params.exceptionDetails.text);
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
    throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
  }
  return response.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: PAGE });

for (let i = 0; i < 60; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (await evaluate("Boolean(document.getElementById('theme-studio-trigger'))")) break;
}

// The studio is a dialog opened from the header tool button, so nothing is
// rendered until it is opened.
const opened = await evaluate(`(() => {
  const trigger = document.getElementById("theme-studio-trigger");
  if (!trigger) return "no trigger";
  trigger.click();
  return "clicked";
})()`);

for (let i = 0; i < 40; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (await evaluate("document.querySelectorAll('dialog[open] [data-control]').length > 0")) break;
}

const report = await evaluate(`(() => {
  const out = { failures: [], controls: [], opened: ${JSON.stringify(true)} };
  const fail = (check, detail) => out.failures.push({ check, detail });

  const root = document.querySelector("dialog[open] .theme-studio");
  if (!root) { fail("root", "the Theme dialog is not open or has no .theme-studio panel"); return out; }

  const fields = [...root.querySelectorAll("[data-control]")];
  if (fields.length === 0) { fail("controls", "no [data-control] rendered"); return out; }

  /* ---- every control is labelled and described ------------------------- */
  for (const field of fields) {
    const label = root.querySelector('label[for="' + field.id + '"]');
    const described = field.getAttribute("aria-describedby");
    out.controls.push({
      id: field.getAttribute("data-control"),
      kind: field.tagName.toLowerCase(),
      label: label ? label.textContent.trim() : "",
      described: Boolean(described && document.getElementById(described))
    });
    if (!label) fail("label", field.id + " has no label[for]");
    if (!described) fail("description", field.id + " has no aria-describedby");
  }

  /* ---- layout group exists and writes its tokens ----------------------- */
  const readToken = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const apply = (controlId, value) => {
    const field = root.querySelector('[data-control="' + controlId + '"]');
    if (!field) return false;
    if (field.tagName === "SELECT") {
      if (![...field.options].some((option) => option.value === value)) return false;
      field.value = value;
    } else {
      field.value = value;
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const durationBefore = readToken("--radius-md");
  if (!apply("button-shape", "pill")) fail("layout group", "no button-shape control to drive");
  const durationAfter = readToken("--radius-md");
  if (durationAfter !== "999px") fail("token write", "--radius-md after pill = " + durationAfter);

  const shadowBefore = readToken("--shadow-md");
  if (!apply("card-elevation", "flat")) fail("component group", "no card-elevation control to drive");
  const shadowAfter = readToken("--shadow-md");
  if (shadowAfter !== "none") fail("token write", "--shadow-md after flat = " + shadowAfter);

  const densityBefore = readToken("--spacing-md");
  if (!apply("density", "compact")) fail("layout group", "no density control to drive");
  const densityAfter = readToken("--spacing-md");
  if (densityAfter !== "0.75rem") fail("token write", "--spacing-md after compact = " + densityAfter);

  /* ---- undo restores the previous value -------------------------------- */
  const undo = [...root.querySelectorAll("button")].find((node) => /^undo$/i.test(node.textContent.trim()));
  if (!undo) fail("undo", "no Undo button");
  else {
    undo.click();
    const restored = readToken("--spacing-md");
    if (restored !== densityBefore) fail("undo", "--spacing-md after undo = " + restored + ", expected " + densityBefore);
    const redo = [...root.querySelectorAll("button")].find((node) => /^redo$/i.test(node.textContent.trim()));
    if (redo) {
      redo.click();
      if (readToken("--spacing-md") !== densityAfter) fail("redo", "--spacing-md after redo did not come back");
    } else {
      fail("redo", "no Redo button");
    }
  }

  out.snapshots = { durationBefore, durationAfter, shadowBefore, shadowAfter, densityBefore, densityAfter };

  /* ---- contrast indicator ---------------------------------------------- */
  const contrast = root.querySelectorAll(".theme-studio__contrast *").length;
  if (contrast === 0) fail("contrast", "no contrast indicators rendered");

  /* ---- reset back to the starting draft -------------------------------- */
  const reset = [...root.querySelectorAll("button")].find((node) => /reset/i.test(node.textContent.trim()));
  out.notes = { hasReset: Boolean(reset), controlCount: fields.length };
  return out;
})()`);

console.log(JSON.stringify(report, null, 2));
if (logs.length) console.log("LOGS:\n" + logs.join("\n"));
ws.close();
