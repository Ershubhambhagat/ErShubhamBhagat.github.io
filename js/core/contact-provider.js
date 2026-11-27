/**
 * js/core/contact-provider.js - decides how the contact form may be delivered.
 *
 * Why this is its own module: the contact section renders the form, but the
 * question "is this form allowed to send anything, and through what" is a policy
 * decision that must be testable without a DOM. It is also the one place that
 * knows the difference between the three modes in
 * Prompt/sections/15_CONTACT_AND_SOCIAL.md §10:
 *
 *   direct-link        compose a mailto: and let the visitor's mail client send it
 *   external-provider  POST to an owner-configured form service, success only on
 *                      a response the provider actually confirms
 *   unavailable        no real delivery path exists: say so, keep direct email
 *
 * Rules encoded here (and nowhere else):
 * - No endpoint is ever invented. A provider mode without a usable HTTPS
 *   endpoint resolves to "unavailable" instead of a hopeful POST.
 * - No secret is ever shipped: an endpoint carrying a credential-looking query
 *   parameter is rejected, because the check runs in public JavaScript.
 * - A single attempt per submit. Providers rate-limit; retry loops do not belong
 *   in a portfolio page.
 * - "Sent" is only reported when the provider answered with a success status and
 *   did not return a machine-readable failure body.
 *
 * Consumers: js/sections/contact.js.
 */

/** Contact form modes, as named in the specification. */
export const CONTACT_MODES = Object.freeze({
  DISABLED: "disabled",
  DIRECT_LINK: "direct-link",
  EXTERNAL_PROVIDER: "external-provider",
  UNAVAILABLE: "unavailable"
});

/** Query parameters that would mean a credential is embedded in the URL. */
const SECRET_PARAMS = Object.freeze([
  "key",
  "api_key",
  "apikey",
  "access_token",
  "accesstoken",
  "token",
  "secret",
  "password"
]);

/** Timeout for one provider attempt. Long enough for a slow mobile network. */
const DEFAULT_TIMEOUT_MS = 15000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Validates a provider configuration without trusting it.
 *
 * @param {unknown} provider
 * @returns {{name: string, endpoint: string, method: "POST"}|null} Null when the
 *   configuration must not be used.
 */
export function normalizeProvider(provider) {
  if (!isRecord(provider)) {
    return null;
  }

  const endpoint = asText(provider.endpoint).trim();

  if (!endpoint) {
    return null;
  }

  let url;

  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }

  // HTTPS only: a form carrying a visitor's message must not travel in clear
  // text, and mixed content would be blocked by the browser anyway.
  if (url.protocol !== "https:") {
    return null;
  }

  for (const parameter of url.searchParams.keys()) {
    if (SECRET_PARAMS.includes(parameter.toLowerCase())) {
      // A key in the URL is public the moment the page is; refuse rather than
      // ship it.
      return null;
    }
  }

  if (url.username || url.password) {
    return null;
  }

  const name = asText(provider.name).trim();

  return {
    name: name || url.hostname,
    endpoint: url.toString(),
    // Form providers accept POST; a GET would put the message in a URL and in
    // server logs, which is exactly what a contact form must avoid. A
    // configuration that asks for anything else is still sent as POST rather
    // than inventing a provider API.
    method: "POST"
  };
}

/**
 * Resolves which delivery path the form may use.
 *
 * @param {unknown} config - profile.contactForm from data/profile.json.
 * @returns {"disabled"|"direct-link"|"external-provider"|"unavailable"}
 */
export function resolveContactMode(config) {
  if (!isRecord(config)) {
    // No configuration at all is the site's long-standing behaviour: compose a
    // mailto draft. Only an explicit "enabled: false" removes the form.
    return CONTACT_MODES.DIRECT_LINK;
  }

  if (config.enabled === false) {
    return CONTACT_MODES.DISABLED;
  }

  const mode = asText(config.mode).trim();

  if (mode === "" || mode === CONTACT_MODES.DIRECT_LINK) {
    return CONTACT_MODES.DIRECT_LINK;
  }

  if (mode === CONTACT_MODES.EXTERNAL_PROVIDER) {
    return normalizeProvider(config.provider)
      ? CONTACT_MODES.EXTERNAL_PROVIDER
      : CONTACT_MODES.UNAVAILABLE;
  }

  return CONTACT_MODES.UNAVAILABLE;
}

/**
 * Builds the JSON body a provider receives.
 *
 * Field names follow the submitted form, because providers map incoming keys to
 * their own template. Values are trimmed and length-limited so a pasted
 * document cannot exceed a provider's request limit.
 *
 * @param {{name?: string, email?: string, subject?: string, message?: string}} fields
 * @returns {{name: string, email: string, subject: string, message: string}}
 */
export function buildProviderPayload(fields) {
  const source = isRecord(fields) ? fields : {};
  const trim = (value, limit) => asText(value).trim().slice(0, limit);

  const subject = trim(source.subject, 200);

  return {
    name: trim(source.name, 120),
    email: trim(source.email, 200),
    // A blank subject still needs a value: a provider template that requires one
    // would otherwise reject a message the visitor did consider complete.
    subject: subject || "Portfolio enquiry",
    message: trim(source.message, 5000)
  };
}

/**
 * Reads a provider response body without assuming it is JSON.
 *
 * @param {Response} response
 * @returns {Promise<unknown>} Parsed body, plain text, or null.
 */
async function readBody(response) {
  const type = response.headers?.get?.("content-type") ?? "";

  try {
    if (type.includes("application/json")) {
      return await response.json();
    }

    const text = await response.text();
    return text ? text.slice(0, 500) : null;
  } catch {
    // A body that cannot be read cannot confirm success either; the status code
    // still decides.
    return null;
  }
}

/**
 * A provider that accepted the request but reported a problem in its body.
 *
 * Some services answer 200 with `{ok:false}` or `{errors:[...]}`. Treating that
 * as success would show the visitor a message that was never delivered.
 *
 * @param {unknown} body
 * @returns {boolean}
 */
function reportsFailure(body) {
  if (isRecord(body)) {
    if (body.ok === false || body.success === false) {
      return true;
    }

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Sends one submission to the configured provider.
 *
 * @param {unknown} config - profile.contactForm.
 * @param {Object} fields - { name, email, subject, message }.
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetchImpl] - Injected in tests.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ok: boolean, reason?: string, status?: number}>}
 *   `ok: true` only when the provider confirmed acceptance.
 */
export async function submitToProvider(config, fields, options = {}) {
  const settings = isRecord(options) ? options : {};
  const mode = resolveContactMode(config);

  if (mode !== CONTACT_MODES.EXTERNAL_PROVIDER) {
    return { ok: false, reason: "unconfigured" };
  }

  const provider = normalizeProvider(config.provider);
  const fetchImpl = typeof settings.fetchImpl === "function" ? settings.fetchImpl : globalThis.fetch;

  if (!provider || typeof fetchImpl !== "function") {
    return { ok: false, reason: "unconfigured" };
  }

  const timeoutMs =
    Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0
      ? settings.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const payload = buildProviderPayload(fields);

  try {
    const response = await fetchImpl(provider.endpoint, {
      method: provider.method,
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response || typeof response.status !== "number") {
      return { ok: false, reason: "response" };
    }

    const body = await readBody(response);

    if (!response.ok) {
      return { ok: false, reason: "response", status: response.status };
    }

    if (reportsFailure(body)) {
      return { ok: false, reason: "rejected", status: response.status };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    // One attempt only: a provider that is down or rate-limiting will not be
    // helped by a retry storm from the visitor's browser.
    const aborted = error && error.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
