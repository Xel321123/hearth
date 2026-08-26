import { test } from "node:test";
import assert from "node:assert/strict";
import type { HouseholdSession } from "../types/index.ts";
import { clearSession, getDeviceId, loadSession, saveSession } from "./session.ts";

const session: HouseholdSession = {
  householdId: "11111111-2222-4333-8444-555555555555",
  displayCode: "ABCDEF",
  accessToken: "tok_123",
};

test("session round-trips through storage (in-memory adapter in Node)", () => {
  clearSession();
  assert.equal(loadSession(), null);
  saveSession(session);
  assert.deepEqual(loadSession(), session);
  clearSession();
  assert.equal(loadSession(), null);
});

test("corrupt session JSON is treated as absent", async () => {
  const { storage } = await import("./storage.ts");
  storage.setItem("hearth:session", "{not json");
  assert.equal(loadSession(), null);
});

test("device id is stable and unique", () => {
  const a = getDeviceId();
  const b = getDeviceId();
  assert.equal(a, b);
  assert.ok(a.length > 8);
});
