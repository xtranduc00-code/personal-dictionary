import { chromium } from "playwright";

const url =
  "https://engoo.com/app/daily-news/article/cheaper-fare-or-faster-ride-most-choose-savings/C_f4gC0dEfG6MHe_mspQ1A";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(4000);
const text = await page.evaluate(() => document.body?.innerText || "");
const idx = text.indexOf("Exercise 3");
console.log(text.slice(idx, idx + 2000));
await browser.close();
