/**
 * Live end-to-end test of the CLIENT code against the deployed backend.
 * Runs the exact modules the UI uses (src/lib/api.ts, session, sort, tags)
 * against the live shared Supabase instance.
 *
 *   source .env first:  set -a; . ./.env; set +a
 *   node --experimental-strip-types scripts/e2e-client.ts
 */
import { api } from "../src/lib/api.ts";
import { getDeviceId } from "../src/lib/session.ts";
import { sortFreezerFifo, sortTodosByDeadline } from "../src/lib/sort.ts";
import { parseTags } from "../src/lib/tags.ts";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../src/lib/config.ts";

let failures = 0;
let steps = 0;
function check(name: string, ok: boolean, detail = ""): void {
  steps += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing env — run with: set -a; . ./.env; set +a; node --experimental-strip-types scripts/e2e-client.ts");
  process.exit(2);
}
console.log(`Hearth client e2e against ${SUPABASE_URL}`);
console.log(`device_id (client-generated): ${getDeviceId()}`);

// ── 1. Create household (anonymous auth) ────────────────────────────────
const created = await api.createHousehold("E2E Bot");
check("createHousehold returns session material", Boolean(created.household_id && created.access_token && created.password), created.display_code);
check("display_code is 6 chars from the household alphabet", /^[A-HJ-KM-NP-TV-Z2-9]{6}$/.test(created.display_code));
const token = created.access_token;
const householdId = created.household_id;

// ── 2. Profiles ─────────────────────────────────────────────────────────
const profiles0 = await api.listProfiles(token);
check("listProfiles → 1 default profile", profiles0.length === 1 && profiles0[0].name === "E2E Bot", profiles0.map((p) => p.name).join(","));

const riley = await api.createProfile(token, householdId, "Riley");
check("createProfile adds Riley", riley.name === "Riley");
const bot = profiles0[0];

// ── 3. Todos: create + deadline sorting + My/Household filtering ────────
const todoA = await api.createTodo(token, { household_id: householdId, profile_id: bot.id, title: "Buy oat milk", due_date: isoDaysFromNow(2), tags: parseTags("#errands #test") });
const todoB = await api.createTodo(token, { household_id: householdId, profile_id: riley.id, title: "Take out trash", due_date: isoDaysFromNow(-1), tags: parseTags("#chores") });
check("createTodo x2", Boolean(todoA.id && todoB.id));

const allOpen = (await api.listTodos(token, { filter: "household", completed: false })).todos;
const sorted = sortTodosByDeadline(allOpen);
check("household list sorted by deadline asc (B yesterday before A in 2d)", sorted[0].id === todoB.id && sorted[1].id === todoA.id, sorted.map((t) => `${t.title}:${t.due_date}`).join(" → "));

const mine = (await api.listTodos(token, { filter: "mine", activeProfileId: bot.id, completed: false })).todos;
check("My Tasks (bot) shows only bot's task", mine.length === 1 && mine[0].id === todoA.id, mine.map((t) => t.title).join(","));

// ── 4. Search: #tag + text ──────────────────────────────────────────────
const tagSearch = await api.search(token, "#test");
check("search #test finds todo A", tagSearch.todos.some((t) => t.id === todoA.id), tagSearch.todos.map((t) => t.title).join(","));
const textSearch = await api.search(token, "trash");
check("search 'trash' finds todo B", textSearch.todos.some((t) => t.id === todoB.id));

// ── 5. Completion → archive (history) ───────────────────────────────────
const completedB = await api.updateTodo(token, todoB.id, { completed: true });
check("complete B archives it", completedB.completed === true && completedB.completed_at !== null);
const history = (await api.listTodos(token, { completed: true })).todos;
check("history shows completed B only", history.length === 1 && history[0].id === todoB.id);

// ── 6. Freezer: FIFO + consume ──────────────────────────────────────────
const peas = await api.createFreezerItem(token, { household_id: householdId, name: "Frozen peas", added_date: isoDaysFromNow(-3), quantity: "500 g", tags: parseTags("#veg") });
const soup = await api.createFreezerItem(token, { household_id: householdId, name: "Soup", added_date: isoDaysFromNow(0), quantity: null, tags: [] });
const items = sortFreezerFifo((await api.listFreezer(token, { consumed: false })).items);
check("freezer FIFO (peas -3d before soup today)", items[0].id === peas.id && items[1].id === soup.id, items.map((i) => `${i.name}:${i.added_date}`).join(" → "));

await api.updateFreezerItem(token, soup.id, { consumed: true });
const consumed = (await api.listFreezer(token, { consumed: true })).items;
check("consumed archive holds soup", consumed.length === 1 && consumed[0].id === soup.id);

// ── 7. Push targeting (device subscription + notify) ────────────────────
const fakeEndpoint = `https://push.example.invalid/e2e-${created.display_code.toLowerCase()}`;
await api.registerDevice(token, {
  household_id: householdId,
  profile_id: riley.id, // this device pretends to be Riley
  device_id: getDeviceId(),
  endpoint: fakeEndpoint,
  keys: { p256dh: "b64p256dh", auth: "b64auth" },
});
check("registerDevice upsert OK (RLS allows anon INSERT with token)", true);

const toRiley = await api.notifyTaskAssigned(token, { household_id: householdId, profile_id: riley.id, todo_id: todoB.id, title: todoB.title });
check("push targets Riley's devices (recipients=1)", toRiley.recipients === 1, JSON.stringify(toRiley));
const toBot = await api.notifyTaskAssigned(token, { household_id: householdId, profile_id: bot.id, todo_id: todoA.id, title: todoA.title });
check("push does NOT target other profiles (recipients=0)", toBot.recipients === 0, JSON.stringify(toBot));

// ── 8. Isolation: a fresh household sees nothing of this one ────────────
const other = await api.createHousehold("Other");
const otherTodos = (await api.listTodos(other.access_token, { filter: "household", completed: false })).todos;
check("cross-household isolation (new household sees 0 tasks)", otherTodos.length === 0);
const otherSearch = await api.search(other.access_token, "#test");
check("cross-household search isolation", otherSearch.todos.length === 0 && otherSearch.freezer.length === 0);

console.log(`\n${steps - failures}/${steps} checks passed`);
console.log(`Households created (demo data): ${created.display_code} (bot+riley, 2 todos, 2 freezer) · ${other.display_code} (empty)`);
if (failures > 0) process.exit(1);
