import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchPush, filterByProfile, type PushSender } from "../functions/_shared/push.ts";

function sub(profileId: string, i: number) {
  return {
    profile_id: profileId,
    endpoint: `https://push.example/${profileId}/${i}`,
    keys: { p256dh: `p256-${i}`, auth: `auth-${i}` },
  };
}

test("filterByProfile keeps only the target profile's devices", () => {
  const subs = [sub("p1", 1), sub("p2", 2), sub("p2", 3), sub("p1", 4)];
  const filtered = filterByProfile(subs, "p2");
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every((s) => s.endpoint.includes("p2")));
});

test("dispatchPush sends the JSON payload to every recipient with options", async () => {
  const calls: Array<{ endpoint: string; payload: string; opts: Record<string, unknown> }> = [];
  const sender: PushSender = {
    async sendNotification(subscription, payload, options) {
      calls.push({
        endpoint: (subscription as { endpoint: string }).endpoint,
        payload: payload as string,
        opts: options as Record<string, unknown>,
      });
    },
  };

  const result = await dispatchPush(
    [sub("p2", 2), sub("p2", 3)],
    {
      title: "Hearth — new task",
      body: "Fix the light",
      data: { type: "todo_assigned", todo_id: "x" },
    },
    sender,
    { ttl: 60, urgency: "high" },
  );

  assert.deepEqual(result, { recipients: 2, sent: 2, failed: 0 });
  assert.equal(calls.length, 2);
  const parsed = JSON.parse(calls[0].payload) as { title: string; body: string; data: { type: string } };
  assert.equal(parsed.title, "Hearth — new task");
  assert.equal(parsed.body, "Fix the light");
  assert.equal(parsed.data.type, "todo_assigned");
  assert.equal(calls[0].opts.TTL, 60);
  assert.equal(calls[0].opts.urgency, "high");
});

test("dispatchPush counts failures without throwing (410 Gone etc.)", async () => {
  const sender: PushSender = {
    async sendNotification() {
      throw new Error("410 Gone");
    },
  };
  const result = await dispatchPush([sub("p2", 2)], { title: "t", body: "b" }, sender);
  assert.deepEqual(result, { recipients: 1, sent: 0, failed: 1 });
});

test("delegation targeting: a task assigned to Profile B notifies ONLY B's devices", async () => {
  const sent: string[] = [];
  const sender: PushSender = {
    async sendNotification(subscription) {
      sent.push((subscription as { endpoint: string }).endpoint);
    },
  };
  // household devices: two registered under A, one under B
  const all = [sub("pA", 1), sub("pA", 2), sub("pB", 3)];
  const targeted = filterByProfile(all, "pB");
  await dispatchPush(targeted, { title: "t", body: "b" }, sender);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].includes("pB"));
});
