import { chromium } from "playwright";

// Live audit of the deployed GitHub Pages site.
const URL = "https://xel321123.github.io/hearth/";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

let failures = 0;
let steps = 0;
const check = (name, ok, detail = "") => {
  steps += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const res = await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
check("live site loads (200)", res?.status() === 200);
await page.getByRole("heading", { name: "Hearth" }).waitFor({ timeout: 20000 });
check("auth view renders on live site", true);
await page.screenshot({ path: "/tmp/hearth-live-auth.png" });

// First load registers the SW; it only CONTROLS the page after a reload.
await page.reload({ waitUntil: "networkidle" });
const pwa = await page.evaluate(async () => {
  const manifestRes = await fetch("manifest.webmanifest");
  const manifest = await manifestRes.json();
  const reg = await navigator.serviceWorker.ready;
  return {
    manifestStatus: manifestRes.status,
    name: manifest.name,
    display: manifest.display,
    icons: manifest.icons.length,
    scope: reg.scope,
    active: Boolean(reg.active),
    controlled: Boolean(navigator.serviceWorker.controller),
    link: document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null,
  };
});
check("manifest served from live site", pwa.manifestStatus === 200 && pwa.name === "Hearth" && pwa.display === "standalone" && pwa.icons === 4, JSON.stringify(pwa));
check("SW registered at /hearth/ scope", pwa.active && pwa.scope === "https://xel321123.github.io/hearth/", JSON.stringify(pwa));
check("page SW-controlled", pwa.controlled === true);
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

// The app talks to the live backend: create a throwaway household through the UI.
await page.getByRole("button", { name: "New household" }).click();
await page.getByLabel("Your name").fill("Pages Bot");
await page.getByRole("button", { name: "Create household" }).click();
await page.getByRole("heading", { name: "Your household is ready" }).waitFor({ timeout: 20000 });
const values = await page.locator(".select-all").allInnerTexts();
check("household creation works on live site (backend reachable)", /^[A-HJ-KM-NP-TV-Z2-9]{6}$/.test((values[0] ?? "").trim()), `code=${values[0]?.trim()}`);
await page.screenshot({ path: "/tmp/hearth-live-credentials.png" });

console.log(`\n${steps - failures}/${steps} live-site checks passed`);
await browser.close();
process.exit(failures > 0 ? 1 : 0);
