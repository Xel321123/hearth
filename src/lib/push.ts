/**
 * Web Push (VAPID). Browser PushSubscriptions are mapped to
 * (household_id, active_profile_id, device_id) so notifications for a task
 * assigned to Profile B reach ONLY Profile B's registered devices.
 * See PROJECT_PLAN.md §8.
 */

export async function registerPushSubscription(): Promise<void> {
  throw new Error("Not implemented — see TASKS.md Phase 4");
}

export async function unregisterPushSubscription(): Promise<void> {
  throw new Error("Not implemented — see TASKS.md Phase 4");
}

/** Client-side trigger: task assigned to a profile → notify that profile's devices. */
export async function notifyAssignedProfile(): Promise<void> {
  throw new Error("Not implemented — see TASKS.md Phase 4");
}
