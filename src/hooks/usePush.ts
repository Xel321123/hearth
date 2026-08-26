import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { getDeviceId } from "../lib/session";
import { isPushSupported, urlBase64ToUint8Array } from "../lib/push";
import { VAPID_PUBLIC_KEY } from "../lib/config";
import { useHousehold } from "./useHousehold";
import { useToast } from "./useToast";

export type PushState = "unsupported" | "idle" | "denied" | "registered";

export interface UsePush {
  state: PushState;
  busy: boolean;
  enable: () => Promise<void>;
}

/**
 * Web Push client lifecycle:
 *  - prompt for permission, subscribe with the VAPID public key,
 *  - upsert the subscription for (household, ACTIVE profile, this device),
 *  - re-register automatically when the active profile changes so a task
 *    assigned to Profile B only pings Profile B's devices.
 */
export function usePush(): UsePush {
  const { session, activeProfile } = useHousehold();
  const toast = useToast();
  const [state, setState] = useState<PushState>(() => (isPushSupported() && VAPID_PUBLIC_KEY ? "idle" : "unsupported"));
  const [busy, setBusy] = useState(false);

  const token = session?.accessToken ?? null;
  const householdId = session?.householdId ?? null;
  const profileId = activeProfile?.id ?? null;

  // Keep the stored subscription in sync with the active profile.
  useEffect(() => {
    if (state !== "registered" || !token || !householdId || !profileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) {
          if (!cancelled) setState("idle");
          return;
        }
        await api.registerDevice(token, {
          household_id: householdId,
          profile_id: profileId,
          device_id: getDeviceId(),
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.toJSON().keys?.p256dh ?? "",
            auth: sub.toJSON().keys?.auth ?? "",
          },
        });
      } catch {
        // Registration is best-effort; the UI keeps its current state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, token, householdId, profileId]);

  const enable = useCallback(async () => {
    if (!isPushSupported()) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      if (token && householdId && profileId) {
        await api.registerDevice(token, {
          household_id: householdId,
          profile_id: profileId,
          device_id: getDeviceId(),
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.toJSON().keys?.p256dh ?? "",
            auth: sub.toJSON().keys?.auth ?? "",
          },
        });
      }
      setState("registered");
      toast.show("Notifications enabled", "success");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Could not enable notifications", "error");
      setState("denied");
    } finally {
      setBusy(false);
    }
  }, [token, householdId, profileId, toast]);

  return { state, busy, enable };
}
