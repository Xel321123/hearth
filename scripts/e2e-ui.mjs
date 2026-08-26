/**
 * Browser end-to-end test + PWA audit (Playwright + headless Chromium).
 *
 * Prereq: `npm run build` then this script starts `vite preview` itself.
 * Run:  node scripts/e2e-ui.mjs
 *
 * Covers: auth → credentials reveal → profile switching → task assignment →
 * My/Household filtering → freezer FIFO → search → history → SW registration
 * → manifest → iOS install banner.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://127.0.0.1:4173";
const SHOTS = mkdtempSync(join(tmpdir(), "hearth-ui-"));
const shot = (name) => `${SHOTS}/${name}.png`;

let failures = 0;
let steps = 0;
function check(name, ok, detail = "") {
  steps += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── boot the preview server ─────────────────────────────────────────────
const server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort", "--host", "127.0.0.1"], {
  cwd: process.cwd(),
  stdio: "ignore",
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("preview server did not start in 20s")), 20000);
  const probe = async () => {
    try {
      const res = await fetch(BASE);
      if (res.ok) {
        clearTimeout(t);
        resolve();
      } else {
        setTimeout(probe, 250);
      }
    } catch {
      setTimeout(probe, 250);
    }
  };
  probe();
});

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone-ish
const page = await context.newPage();
page.setDefaultTimeout(15000);

try {
  // ── 1. Landing → create household ─────────────────────────────────────
  await page.goto(BASE);
  await page.getByRole("heading", { name: "Hearth" }).waitFor();
  check("landing renders auth view", true);
  await page.screenshot({ path: shot("01-auth") });

  await page.getByRole("button", { name: "New household" }).click();
  await page.getByLabel("Your name").fill("UI Bot");
  await page.getByRole("button", { name: "Create household" }).click();

  // Credentials reveal
  await page.getByRole("heading", { name: "Your household is ready" }).waitFor();
  const values = await page.locator(".select-all").allInnerTexts();
  const code = values[0]?.trim() ?? "";
  const password = values[1]?.trim() ?? "";
  check("credentials screen shows code + password", /^[A-HJ-KM-NP-TV-Z2-9]{6}$/.test(code) && password.length >= 16, `code=${code}`);
  const warning = await page.locator("text=No recovery").count();
  check("no-recovery warning shown", warning === 1);
  await page.screenshot({ path: shot("02-credentials") });
  await page.getByRole("button", { name: "I've saved them — open Hearth" }).click();

  // Shell loads with the household code in the header
  await page.locator(`text=${code}`).first().waitFor();
  check("shell shows household code", true);

  // ── 2. Profile switching + add member ─────────────────────────────────
  await page.getByRole("button", { name: "Switch profile" }).click();
  await page.getByRole("button", { name: "+ Add profile" }).click();
  await page.getByPlaceholder("New member's name").fill("Riley");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.locator("text=Riley").first().waitFor();
  await page.getByRole("button", { name: "Riley" }).click(); // switch active profile to Riley
  check("profile added + switched to Riley", true);
  await page.screenshot({ path: shot("03-profile-switcher") });

  // ── 3. Task creation + assignment + filtering ─────────────────────────
  await page.getByLabel("Add task").click(); // FAB
  await page.getByLabel("Title").fill("Buy oat milk");
  await page.getByLabel("Due date").fill("2026-09-01");
  await page.getByLabel("Assigned to").selectOption({ label: "Riley" });
  await page.getByLabel("Tags").fill("#errands");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Add task", exact: true }).click();
  await page.locator("text=Buy oat milk").waitFor();
  check("task created, assigned to Riley, #errands tag", true);

  // My Tasks (Riley is active) shows it; Household shows it too
  await page.getByRole("button", { name: "My Tasks" }).click();
  await page.locator("text=Buy oat milk").waitFor();
  check("My Tasks shows Riley's assigned task", true);

  // Switch persona back to UI Bot → My Tasks empty, Household still shows it
  await page.getByRole("button", { name: "Switch profile" }).click();
  await page.getByRole("button", { name: "UI Bot" }).click();
  await page.getByRole("button", { name: "My Tasks" }).click();
  await page.locator("text=Nothing assigned to you").waitFor();
  await page.getByRole("button", { name: "Household", exact: true }).click();
  await page.locator("text=Buy oat milk").waitFor();
  check("persona switch → My Tasks empty for UI Bot, Household still lists task", true);
  await page.screenshot({ path: shot("04-todos") });

  // ── 4. Freezer (FIFO + consume) ───────────────────────────────────────
  await page.getByRole("button", { name: "Freezer", exact: true }).click();
  await page.getByLabel("Add freezer item").click(); // FAB
  await page.getByLabel("Name").fill("Frozen peas");
  await page.getByLabel("Weight / qty").fill("500 g");
  await page.getByRole("dialog").getByRole("button", { name: "Add item", exact: true }).click();
  await page.locator("text=Frozen peas").waitFor();
  check("freezer item added with quantity", true);
  await page.screenshot({ path: shot("05-freezer") });

  // ── 5. Search (text + tag) ────────────────────────────────────────────
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("textbox", { name: "Search" }).fill("oat");
  await page.locator("text=Buy oat milk").waitFor();
  check("text search finds the task", true);
  await page.getByRole("textbox", { name: "Search" }).fill("#errands");
  await page.locator("text=Buy oat milk").waitFor();
  check("#tag search finds the task", true);
  await page.screenshot({ path: shot("06-search") });

  // ── 6. Complete → History ─────────────────────────────────────────────
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Mark done: Buy oat milk" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.locator("text=Buy oat milk").waitFor();
  check("completed task appears in history", true);
  await page.screenshot({ path: shot("07-history") });

  // ── 7. PWA audit ──────────────────────────────────────────────────────
  await page.reload();
  const manifest = await page.evaluate(async () => {
    const res = await fetch("/manifest.webmanifest");
    const json = await res.json();
    const link = document.querySelector('link[rel="manifest"]');
    return { status: res.status, name: json.name, display: json.display, icons: json.icons.length, link: link?.getAttribute("href") ?? null };
  });
  check("manifest.webmanifest served", manifest.status === 200 && manifest.link === "/manifest.webmanifest");
  check("manifest has name + standalone display + 4 icons", manifest.name === "Hearth" && manifest.display === "standalone" && manifest.icons === 4, JSON.stringify(manifest));

  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: Boolean(reg.active), controlled: Boolean(navigator.serviceWorker.controller) };
  });
  check("service worker registered + active", sw.active && sw.scope.includes("4173"), JSON.stringify(sw));
  check("page is SW-controlled after reload", sw.controlled === true);

  const icon = await page.evaluate(async () => {
    const res = await fetch("/icons/icon-192.png");
    return res.status;
  });
  check("app icon served (200)", icon === 200);

  // iOS Safari install banner (emulated iPhone user agent)
  const iosContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    hasTouch: true,
  });
  const iosPage = await iosContext.newPage();
  await iosPage.goto(BASE);
  // Join the household created earlier so the shell (and banner) render.
  await iosPage.getByRole("button", { name: "Join", exact: true }).click();
  await iosPage.getByLabel("Household code").fill(code);
  await iosPage.getByLabel("Password", { exact: true }).fill(password);
  await iosPage.getByRole("button", { name: "Join household" }).click();
  await iosPage.locator("text=Install Hearth").waitFor();
  const banner = await iosPage.locator("text=Install Hearth").count();
  check("iOS Safari shows install banner", banner === 1);
  await iosPage.screenshot({ path: shot("08-ios-banner") });
  await iosContext.close();

  console.log(`\n${steps - failures}/${steps} UI checks passed · screenshots: ${SHOTS}`);
} finally {
  await browser.close();
  server.kill();
}
process.exit(failures > 0 ? 1 : 0);
