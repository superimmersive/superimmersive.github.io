#!/usr/bin/env node
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "products", "3dgs-demos");
const baseUrl = process.env.CAPTURE_BASE_URL || "http://127.0.0.1:5183";
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ["bonsai", "plush", "train"];

const browser = await chromium.launch({
  headless: true,
  args: ["--ignore-gpu-blocklist", "--enable-webgl", "--enable-accelerated-2d-canvas"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });

for (const scene of scenes) {
  const url = `${baseUrl}/tools/capture-splat-thumb.html?scene=${scene}`;
  console.log("Capturing", scene, "…");
  await page.goto(url, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 180000 });
  await page.waitForTimeout(scene === "train" ? 2000 : 800);
  await page.screenshot({
    path: path.join(outDir, `${scene}.jpg`),
    type: "jpeg",
    quality: 88,
    clip: { x: 0, y: 0, width: 800, height: 800 },
    timeout: 120000,
  });
  console.log("Saved", `${scene}.jpg`);
}

await browser.close();
console.log("Done.");
