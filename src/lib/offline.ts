/**
 * Minimal offline mutation queue: when the network is down, writes are queued
 * in localStorage and replayed in order on the next connection (see
 * useSyncOnReconnect). Offline READS are served by the service worker's
 * network-first cache (src/sw.ts).
 */
import { ApiError } from "../types/index.ts";
import { FN_BASE, REST_BASE, request } from "./api.ts";
import type { QueryParams, RequestOptions } from "./api.ts";
import { storage } from "./storage.ts";

export interface QueuedRequest {
  id: string;
  base: "fn" | "rest";
  path: string;
  method: NonNullable<RequestOptions["method"]>;
  query: QueryParams | undefined;
  body: unknown;
  token: string;
  onConflict?: string;
}

const QUEUE_KEY = "hearth:outbox";
let counter = 0;

function readQueue(): QueuedRequest[] {
  const raw = storage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedRequest[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]): void {
  storage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueue(item: Omit<QueuedRequest, "id">): void {
  const queue = readQueue();
  queue.push({ ...item, id: `q${Date.now()}-${counter++}` });
  writeQueue(queue);
}

export function pendingCount(): number {
  return readQueue().length;
}

export function clearQueue(): void {
  storage.removeItem(QUEUE_KEY);
}

/**
 * Replay queued mutations in order. Client errors (4xx) are dropped — they
 * will never succeed — everything else is kept for the next attempt.
 * Returns the number of items resolved (flushed or dropped).
 */
export async function flushQueue(): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;
  const remaining: QueuedRequest[] = [];
  let resolved = 0;
  for (const item of queue) {
    const base = item.base === "fn" ? FN_BASE : REST_BASE;
    try {
      await request(base, item.path, {
        method: item.method,
        query: item.query,
        body: item.body,
        token: item.token,
        onConflict: item.onConflict,
      });
      resolved += 1;
    } catch (err) {
      const dropped =
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 0 &&
        err.code !== "NETWORK_ERROR";
      if (dropped) resolved += 1;
      else remaining.push(item);
    }
  }
  writeQueue(remaining);
  return resolved;
}
