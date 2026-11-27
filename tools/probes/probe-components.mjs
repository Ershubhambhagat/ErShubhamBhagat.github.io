/**
 * Re-score probe for the shared component rows in the traceability matrix.
 *
 * Every row BTN/CARD/BADGE/MODAL/FILT/NAVB/TLC/TOAST-00x that the audit marked
 * PARTIAL is exercised here against the real component modules, mounted by
 * tools/component-lab. Each check names the requirement it covers, so the report
 * is the evidence the matrix points at.
 *
 * Two viewports: 1280 for the desktop behaviour, 375 for MODAL-006 and the
 * horizontal-overflow check.
 */
const PAGE = "http://127.0.0.1:8123/tools/component-lab/index.html";

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
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    logs.push("console.error: " + message.params.args.map((a) => a.value ?? "").join(" "));
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
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (await evaluate("document.documentElement.dataset.labReady === 'true'")) break;
}

const desktop = await evaluate(`(async () => {
  const rows = {};
  const record = (id, ok, detail) => { rows[id] = { ok: Boolean(ok), detail: detail ?? "" }; };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const style = (node) => getComputedStyle(node);
  const signature = (node) => {
    const s = style(node);
    return [s.backgroundColor, s.color, s.borderTopColor, s.borderTopWidth, s.textDecorationLine, s.fontWeight, s.boxShadow]
      .join("|");
  };
  const openDialog = () => document.querySelector("dialog[open]");

  /* ---- buttons --------------------------------------------------------- */
  const buttonVariants = document.getElementById("lab-buttons-variants");
  const expectedVariants = ["primary", "secondary", "outline", "ghost", "destructive", "link"];
  const missingVariants = expectedVariants.filter((variant) => !buttonVariants?.querySelector(".btn--" + variant));
  const variantSignatures = new Set([...(buttonVariants?.querySelectorAll(".btn") ?? [])].map(signature));
  record(
    "BTN-001",
    missingVariants.length === 0 && variantSignatures.size >= 5,
    "missing=" + JSON.stringify(missingVariants) + " distinctLooks=" + variantSignatures.size
  );

  const sized = [...(document.getElementById("lab-buttons-sizes")?.querySelectorAll(".btn") ?? [])];
  const sizeSignatures = new Set(
    sized.map((node) => style(node).fontSize + "/" + style(node).paddingTop + "/" + style(node).paddingInlineStart)
  );
  record("BTN-002", sized.length === 3 && sizeSignatures.size === 3, "buttons=" + sized.length + " distinct=" + sizeSignatures.size);

  const busy = document.querySelector("[aria-busy='true']");
  const spinner = busy?.querySelector(".btn__spinner");
  const blocked = [...document.querySelectorAll(".btn[disabled]")].length;
  record("BTN-003", Boolean(busy) && Boolean(spinner) && blocked > 0, "busy=" + Boolean(busy) + " spinner=" + Boolean(spinner) + " disabled=" + blocked);

  /* ---- cards ----------------------------------------------------------- */
  const cardVariants = document.getElementById("lab-cards-variants");
  const expectedCards = ["standard", "elevated", "featured", "compact", "horizontal"];
  const missingCards = expectedCards.filter((variant) => !cardVariants?.querySelector(".card--" + variant));
  record("CARD-002", missingCards.length === 0, "missing=" + JSON.stringify(missingCards));

  const media = document.getElementById("lab-cards-media");
  const image = media?.querySelector("img");
  const fallback = media?.querySelector(".card__media-fallback");
  record(
    "CARD-003",
    Boolean(image) && Boolean(fallback) && Boolean(image.getAttribute("alt")),
    "img=" + Boolean(image) + " alt=" + JSON.stringify(image?.getAttribute("alt") ?? null) + " fallback=" + Boolean(fallback)
  );

  const skeletons = document.getElementById("lab-cards-skeletons");
  const skeletonNodes = [...(skeletons?.querySelectorAll(".card--skeleton") ?? [])];
  const skeletonsQuiet = skeletonNodes.every((node) => node.getAttribute("aria-hidden") === "true" || node.closest("[aria-hidden='true']"));
  record("CARD-005", skeletonNodes.length >= 2 && skeletonsQuiet, "skeletons=" + skeletonNodes.length + " ariaHidden=" + skeletonsQuiet);

  /* ---- badges ---------------------------------------------------------- */
  const badgeVariants = document.getElementById("lab-badges-variants");
  const expectedBadges = ["neutral", "primary", "success", "warning", "danger", "info", "outline"];
  const missingBadges = expectedBadges.filter((variant) => !badgeVariants?.querySelector(".badge--" + variant));
  record("BADGE-001", missingBadges.length === 0, "missing=" + JSON.stringify(missingBadges));

  const badgeSizes = [...(document.getElementById("lab-badges-sizes")?.querySelectorAll(".badge") ?? [])];
  const badgeSizeSignatures = new Set(badgeSizes.map((node) => style(node).fontSize + "/" + style(node).paddingInlineStart));
  record("BADGE-002", badgeSizes.length === 3 && badgeSizeSignatures.size === 3, "badges=" + badgeSizes.length + " distinct=" + badgeSizeSignatures.size);

  const interactiveHost = document.getElementById("lab-badges-interactive");
  const toggle = interactiveHost?.querySelector("[aria-pressed]");
  let pressedWorks = false;
  if (toggle) {
    const before = toggle.getAttribute("aria-pressed");
    toggle.click();
    await wait(60);
    const after = toggle.getAttribute("aria-pressed");
    pressedWorks = before !== after;
  }
  record("BADGE-003", Boolean(toggle) && pressedWorks, "aria-pressed toggles=" + pressedWorks);

  const counts = document.getElementById("lab-badges-counts");
  // The fixture holds three badges on purpose: a real count, an invalid one that
  // must hide its count element, and one whose count is removed afterwards.
  const counted = [...(counts?.querySelectorAll(".badge") ?? [])].find((node) => /^projects/i.test((node.textContent ?? "").trim()));
  const countedValue = counted?.querySelector(".badge__count")?.textContent.trim() ?? "";
  const countHasLabel = Boolean(counted?.querySelector(".badge__count .visually-hidden"));
  const invalidBadge = [...(counts?.querySelectorAll(".badge") ?? [])].find((node) => /^invalid/i.test((node.textContent ?? "").trim()));
  const invalidHidesCount = Boolean(invalidBadge) && invalidBadge.querySelector(".badge__count") === null;
  const removalWorks = typeof window.__LAB__.removeCount === "function" ? window.__LAB__.removeCount() === true : false;
  record(
    "BADGE-004",
    // The count element carries the visually-hidden label plus the number, so the
    // check is "contains the digit", not "equals 3".
    countedValue.includes("3") && invalidHidesCount && removalWorks,
    "count=" + JSON.stringify(countedValue) + " labelled=" + countHasLabel + " invalidHidesCount=" + invalidHidesCount + " removal=" + removalWorks
  );

  /* ---- modals ---------------------------------------------------------- */
  window.__LAB__.openDialog("md");
  await wait(150);
  let dialog = openDialog();
  let escapeCloses = false;
  let backdropCloses = false;
  let scrollLocked = false;

  if (dialog) {
    const rootOverflow = getComputedStyle(document.documentElement).overflow;
    scrollLocked = rootOverflow === "hidden";
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await wait(150);
    escapeCloses = !openDialog();
  }

  if (escapeCloses) {
    window.__LAB__.openDialog("md");
    await wait(150);
    dialog = openDialog();
    if (dialog) {
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await wait(150);
      backdropCloses = !openDialog();
    }
  }

  record("MODAL-002", escapeCloses && backdropCloses, "escape=" + escapeCloses + " backdrop=" + backdropCloses);
  record("MODAL-004", scrollLocked, "documentElement overflow hidden while open=" + scrollLocked);

  // Sizes: a wider token must produce a wider panel.
  const widths = {};
  for (const size of ["sm", "md", "lg"]) {
    window.__LAB__.openDialog(size);
    await wait(140);
    const open = openDialog();
    widths[size] = Math.round(open?.getBoundingClientRect().width ?? 0);
    open?.querySelector(".modal__close, [data-modal-close], button")?.click();
    if (openDialog()) {
      const close = [...(openDialog()?.querySelectorAll("button") ?? [])].find((node) => /close/i.test(node.textContent ?? ""));
      close?.click();
    }
    await wait(140);
  }
  record("MODAL-003", widths.sm > 0 && widths.sm < widths.md && widths.md < widths.lg, JSON.stringify(widths));

  // Confirm helper.
  const confirmButton = [...document.querySelectorAll("#lab-modals-controls button")].find((node) => node.textContent.trim() === "Confirm");
  let confirmOpens = false;
  if (confirmButton) {
    confirmButton.click();
    await wait(200);
    const open = openDialog();
    confirmOpens = Boolean(open) && /delete fixture/i.test(open.textContent ?? "");
    const cancel = [...(open?.querySelectorAll("button") ?? [])].find((node) => /cancel/i.test(node.textContent ?? ""));
    cancel?.click();
    await wait(150);
  }
  record("MODAL-005", confirmOpens, "confirm dialog opened=" + confirmOpens);

  /* ---- filters --------------------------------------------------------- */
  const panel = document.getElementById("lab-filter-panel");
  const controls = [...(panel?.querySelectorAll("select, input") ?? [])];
  const kinds = {
    multiple: controls.filter((node) => node.multiple).length,
    checkbox: controls.filter((node) => node.type === "checkbox").length,
    radio: controls.filter((node) => node.type === "radio").length,
    range: controls.filter((node) => node.type === "range").length,
    select: controls.filter((node) => node.tagName === "SELECT").length
  };
  record(
    "FILT-001",
    kinds.checkbox > 0 && kinds.select > 0 && (kinds.multiple > 0 || kinds.radio > 0),
    JSON.stringify(kinds)
  );

  const filterOutput = document.getElementById("lab-filter-state");
  const beforeText = filterOutput?.textContent ?? "";
  const firstCheckbox = panel?.querySelector("input[type='checkbox']");
  if (firstCheckbox) {
    firstCheckbox.click();
    await wait(150);
  }
  const afterText = filterOutput?.textContent ?? "";
  record("FILT-004", /matching records/.test(afterText) && beforeText !== afterText, "count line changes=" + (beforeText !== afterText) + " text=" + JSON.stringify(afterText.slice(0, 80)));

  const expander = panel?.querySelector("[aria-expanded]");
  let toggles = false;
  if (expander) {
    const before = expander.getAttribute("aria-expanded");
    expander.click();
    await wait(100);
    toggles = before !== expander.getAttribute("aria-expanded");
    expander.click();
  }
  record("FILT-005", Boolean(expander) && toggles, "aria-expanded control=" + Boolean(expander) + " toggles=" + toggles);

  /* ---- timeline -------------------------------------------------------- */
  const timelines = window.__LAB__.timelines ?? {};
  const layouts = ["vertical", "horizontal", "compact"];
  const renderedLayouts = layouts.filter((layout) => (timelines[layout] ? true : false));
  const horizontal = document.getElementById("lab-timeline-horizontal");
  const compact = document.getElementById("lab-timeline-compact");
  const grouped = document.getElementById("lab-timeline-grouped");
  record(
    "TLC-002",
    renderedLayouts.length === 3 && Boolean(horizontal?.children.length) && Boolean(compact?.children.length) && Boolean(grouped?.children.length),
    "controllers=" + JSON.stringify(renderedLayouts) + " horizontal=" + horizontal?.children.length + " compact=" + compact?.children.length + " grouped=" + grouped?.children.length
  );

  const vertical = document.getElementById("lab-timeline-vertical");
  const action = [...(vertical?.querySelectorAll("button") ?? [])].find((node) => /view record/i.test(node.textContent ?? ""));
  const eventImage = vertical?.querySelector("img, .timeline__media, .timeline__thumb");
  record("TLC-005", Boolean(action) && Boolean(eventImage), "action=" + Boolean(action) + " media=" + Boolean(eventImage));

  /* ---- toasts ---------------------------------------------------------- */
  const toast = window.__LAB__.toast;
  let autoDismiss = false;
  let hoverPause = false;
  let capped = false;

  // 1500 ms is the documented minimum duration (MIN_DURATION_MS); a shorter
  // request is clamped up, so the probe must wait past the floor, not past its
  // own requested value.
  toast.info("probe auto", { duration: 1500 });
  const autoNode = [...document.querySelectorAll(".toast")].find((node) => /probe auto/.test(node.textContent ?? ""));
  await wait(2200);
  autoDismiss = !autoNode || !autoNode.isConnected;

  toast.info("probe hover", { duration: 1500 });
  const hoverNode = [...document.querySelectorAll(".toast")].find((node) => /probe hover/.test(node.textContent ?? ""));
  if (hoverNode) {
    // The component pauses on pointerenter (the pointer/focus pair), which is why
    // a synthetic mouseenter would test nothing.
    hoverNode.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
    await wait(2200);
    hoverPause = hoverNode.isConnected;
    hoverNode.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
  }

  toast.dismissAll();
  await wait(80);
  for (let index = 1; index <= 5; index += 1) toast.info("cap " + index, { duration: 8000 });
  await wait(150);
  const visible = document.querySelectorAll(".toast").length;
  capped = visible <= 3;
  toast.dismissAll();

  record("TOAST-002", autoDismiss && hoverPause && capped, "autoDismiss=" + autoDismiss + " hoverPauses=" + hoverPause + " visible=" + visible);

  return rows;
})()`);

// Mobile pass: the modal must fit the viewport and the lab must not scroll sideways.
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
await new Promise((resolve) => setTimeout(resolve, 400));

const mobile = await evaluate(`(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rows = {};

  window.__LAB__.openDialog("lg");
  await wait(250);
  const dialog = document.querySelector("dialog[open]");
  const rect = dialog?.getBoundingClientRect();
  const fits = Boolean(rect) && rect.left >= -1 && rect.right <= 376 && rect.width <= 375;

  const scroller = dialog?.querySelector(".modal__body, .modal__content, [class*='body']");
  const overflowX = document.documentElement.scrollWidth <= window.innerWidth + 1;

  rows["MODAL-006"] = {
    ok: fits && overflowX,
    detail: "rect=" + (rect ? Math.round(rect.left) + ".." + Math.round(rect.right) : "none") + " pageOverflow=" + !overflowX + " scrollableBody=" + Boolean(scroller)
  };

  const close = [...(dialog?.querySelectorAll("button") ?? [])].find((node) => /close/i.test(node.textContent ?? ""));
  close?.click();
  return rows;
})()`);

console.log(JSON.stringify({ desktop, mobile }, null, 2));
if (logs.length) console.log("LOGS:\n" + logs.join("\n"));
ws.close();
