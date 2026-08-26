import { useEffect, useRef } from "react";
import { flushQueue } from "../lib/offline";
import { useOnline } from "./useOnline";

/**
 * When the connection comes back: flush the offline mutation queue, then
 * reload the caller's data.
 */
export function useSyncOnReconnect(load: () => Promise<void> | void): void {
  const online = useOnline();
  const wasOffline = useRef(false);
  useEffect(() => {
    if (online && wasOffline.current) {
      wasOffline.current = false;
      void flushQueue().then(() => load());
    } else if (!online) {
      wasOffline.current = true;
    }
  }, [online, load]);
}
