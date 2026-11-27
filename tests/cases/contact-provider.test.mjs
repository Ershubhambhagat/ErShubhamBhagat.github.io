import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTACT_MODES,
  buildProviderPayload,
  normalizeProvider,
  resolveContactMode,
  submitToProvider
} from "../../js/core/contact-provider.js";

const provider = {
  name: "Example Forms",
  endpoint: "https://forms.example.com/f/portfolio"
};

const config = {
  enabled: true,
  mode: "external-provider",
  provider
};

const fields = {
  name: " Ada Lovelace ",
  email: "ada@example.com",
  subject: " Hello ",
  message: " A message. "
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

test("an absent configuration keeps the direct-link mode", () => {
  assert.equal(resolveContactMode(null), CONTACT_MODES.DIRECT_LINK);
  assert.equal(resolveContactMode({ enabled: false }), CONTACT_MODES.DISABLED);
  assert.equal(resolveContactMode({ enabled: true }), CONTACT_MODES.DIRECT_LINK);
});

test("provider mode needs a usable HTTPS endpoint", () => {
  assert.equal(resolveContactMode(config), CONTACT_MODES.EXTERNAL_PROVIDER);
  assert.equal(
    resolveContactMode({ ...config, provider: { endpoint: "http://forms.example.com" } }),
    CONTACT_MODES.UNAVAILABLE
  );
  assert.equal(
    resolveContactMode({ ...config, provider: { endpoint: "https://forms.example.com?api_key=x" } }),
    CONTACT_MODES.UNAVAILABLE
  );
  assert.equal(resolveContactMode({ ...config, provider: { endpoint: "/local" } }), CONTACT_MODES.UNAVAILABLE);
  assert.equal(resolveContactMode({ enabled: true, mode: "something-else" }), CONTACT_MODES.UNAVAILABLE);
});

test("normalizeProvider rejects credentials and non-HTTPS endpoints", () => {
  assert.equal(normalizeProvider({ endpoint: "https://user:pass@forms.example.com" }), null);
  assert.equal(normalizeProvider({ endpoint: "https://forms.example.com?token=abc" }), null);
  assert.equal(normalizeProvider({}), null);
  assert.deepEqual(normalizeProvider(provider), {
    name: "Example Forms",
    endpoint: "https://forms.example.com/f/portfolio",
    method: "POST"
  });
});

test("the payload is trimmed and always carries a subject", () => {
  assert.deepEqual(buildProviderPayload(fields), {
    name: "Ada Lovelace",
    email: "ada@example.com",
    subject: "Hello",
    message: "A message."
  });
  assert.equal(buildProviderPayload({ name: "A", email: "a@b.co", message: "m" }).subject, "Portfolio enquiry");
  assert.equal(buildProviderPayload({ message: "x".repeat(6000) }).message.length, 5000);
});

test("a confirmed 200 response is the only success", async () => {
  const calls = [];
  const result = await submitToProvider(config, fields, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ ok: true });
    }
  });

  assert.deepEqual(result, { ok: true, status: 200 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, provider.endpoint);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(JSON.parse(calls[0].init.body).email, "ada@example.com");
});

test("a provider error status is not reported as success", async () => {
  const result = await submitToProvider(config, fields, {
    fetchImpl: async () => jsonResponse({ error: "quota" }, 429)
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "response");
  assert.equal(result.status, 429);
});

test("a 200 body that reports failure is not success either", async () => {
  const result = await submitToProvider(config, fields, {
    fetchImpl: async () => jsonResponse({ ok: false, errors: ["invalid email"] })
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "rejected");
});

test("network failures and timeouts are reported without retrying", async () => {
  let attempts = 0;
  const offline = await submitToProvider(config, fields, {
    fetchImpl: async () => {
      attempts += 1;
      throw new TypeError("Failed to fetch");
    }
  });

  assert.deepEqual(offline, { ok: false, reason: "network" });
  assert.equal(attempts, 1);

  const aborted = await submitToProvider(config, fields, {
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
  });

  assert.deepEqual(aborted, { ok: false, reason: "timeout" });
});

test("an unconfigured provider is refused before any request", async () => {
  let called = false;
  const result = await submitToProvider(
    { enabled: true, mode: "external-provider", provider: { endpoint: "http://insecure.test" } },
    fields,
    {
      fetchImpl: async () => {
        called = true;
        return jsonResponse({ ok: true });
      }
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unconfigured");
  assert.equal(called, false);
});
