/**
 * Web Push dispatch (RFC 8291 / VAPID).
 * The handler injects the real sender (npm:web-push); tests inject a fake,
 * so this module stays pure and dependency-free.
 */
import type { DispatchResult, PushPayload, PushRecipient } from "./types.ts";

export interface PushSender {
  sendNotification(
    subscription: PushRecipient,
    payload: string,
    options: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface PushOptions {
  ttl?: number;
  urgency?: "low" | "normal" | "high";
  topic?: string;
}

export const DEFAULT_PUSH_OPTIONS: Required<Pick<PushOptions, "ttl" | "urgency">> = {
  ttl: 86400,
  urgency: "high",
};

/** Keep only subscriptions belonging to the target profile. */
export function filterByProfile(
  subscriptions: Array<PushRecipient & { profile_id?: string }>,
  profileId: string,
): PushRecipient[] {
  return subscriptions.filter((s) => s.profile_id === profileId);
}

/** Dispatch one payload to all recipients; failures are counted, not thrown. */
export async function dispatchPush(
  recipients: PushRecipient[],
  payload: PushPayload,
  sender: PushSender,
  options: PushOptions = {},
): Promise<DispatchResult> {
  const body = JSON.stringify(payload);
  const opts: Record<string, unknown> = {
    TTL: options.ttl ?? DEFAULT_PUSH_OPTIONS.ttl,
    urgency: options.urgency ?? DEFAULT_PUSH_OPTIONS.urgency,
  };
  if (options.topic) opts.topic = options.topic;

  let sent = 0;
  let failed = 0;
  await Promise.all(
    recipients.map(async (r) => {
      try {
        await sender.sendNotification(r, body, opts);
        sent += 1;
      } catch {
        failed += 1;
      }
    }),
  );
  return { recipients: recipients.length, sent, failed };
}
