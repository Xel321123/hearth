import { test } from "node:test";
import assert from "node:assert/strict";

// Env must be set before the api module loads (it reads config at import).
process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "anon-test-key";

const { api } = await import("./api.ts");
const { ApiError } = await import("../types/index.ts");

interface RecordedCall {
  url: string;
  init: RequestInit;
}

const calls: RecordedCall[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** headers are passed as plain objects by our client; cast for readability. */
function hdrs(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

function installFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>): void {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call: RecordedCall = { url, init: init ?? {} };
    calls.push(call);
    return handler(url, init ?? {}, calls.length);
  }) as typeof fetch;
}

test("createHousehold: POST with body and anon auth headers", async () => {
  installFetch(() => jsonResponse({ household_id: "hh" }, 201));
  await api.createHousehold("Alex");
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.ok(url.startsWith("https://example.supabase.co/functions/v1/household-create"));
  assert.equal(init.method, "POST");
  assert.equal(hdrs(init)["apikey"], "anon-test-key");
  assert.equal(hdrs(init)["Authorization"], "Bearer anon-test-key");
  assert.deepEqual(JSON.parse(init.body as string), { profile_name: "Alex" });
});

test("scoped calls carry x-household-token; REST calls pin the hearth schema", async () => {
  installFetch(() => jsonResponse({ todos: [] }));
  await api.listTodos("tok1", { filter: "mine", activeProfileId: "p1", completed: false });
  const fnCall = calls[0];
  assert.equal(hdrs(fnCall.init)["x-household-token"], "tok1");
  assert.ok(fnCall.url.includes("filter=mine"));
  assert.ok(fnCall.url.includes("active_profile_id=p1"));
  assert.ok(fnCall.url.includes("completed=false"));

  installFetch(() => jsonResponse([]));
  await api.listProfiles("tok2");
  const restCall = calls[0];
  assert.ok(restCall.url.startsWith("https://example.supabase.co/rest/v1/profiles"));
  assert.equal(hdrs(restCall.init)["x-household-token"], "tok2");
  assert.equal(hdrs(restCall.init)["Accept-Profile"], "hearth");
});

test("registerDevice: deletes old rows, then upserts with on_conflict", async () => {
  let n = 0;
  installFetch(() => {
    n += 1;
    if (n === 1) return jsonResponse(null, 204); // DELETE
    return jsonResponse({ id: "sub" }, 201); // upsert POST
  });
  await api.registerDevice("tok", {
    household_id: "hh",
    profile_id: "p1",
    device_id: "dev1",
    endpoint: "https://push.example/x",
    keys: { p256dh: "k1", auth: "k2" },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, "DELETE");
  assert.ok(calls[0].url.includes("household_id=eq.hh"));
  assert.ok(calls[0].url.includes("device_id=eq.dev1"));
  assert.equal(calls[1].init.method, "POST");
  // URLSearchParams percent-encodes commas — decode before asserting.
  assert.ok(decodeURIComponent(calls[1].url).includes("on_conflict=household_id,profile_id,device_id"));
  assert.equal(hdrs(calls[1].init)["Prefer"], "resolution=merge-duplicates,return=representation");
});

test("error mapping: {error:{code,message}} → ApiError", async () => {
  installFetch(() => jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "invalid household code or password" } }, 401));
  await assert.rejects(
    () => api.joinHousehold("ABCDEF", "wrong-password"),
    (err: unknown) => err instanceof ApiError && err.code === "INVALID_CREDENTIALS" && err.status === 401 && err.message.includes("invalid household"),
  );
});

test("network failure → ApiError NETWORK_ERROR with status 0", async () => {
  globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
  await assert.rejects(
    () => api.search("tok", "milk"),
    (err: unknown) => err instanceof ApiError && err.code === "NETWORK_ERROR" && err.status === 0,
  );
});

test("notifyTaskAssigned payload shape", async () => {
  installFetch(() => jsonResponse({ recipients: 1, sent: 1, failed: 0, profile_id: "p2" }));
  const res = await api.notifyTaskAssigned("tok", { household_id: "hh", profile_id: "p2", todo_id: "t1", title: "Buy milk" });
  assert.equal(res.recipients, 1);
  const body = JSON.parse(calls[0].init.body as string);
  assert.deepEqual(body.todo, { id: "t1", title: "Buy milk" });
  assert.equal(body.profile_id, "p2");
});
