import { chromium } from "playwright";

const url =
  "https://engoo.com/app/daily-news/article/cheaper-fare-or-faster-ride-most-choose-savings/C_f4gC0dEfG6MHe_mspQ1A";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const audio = document.querySelector("audio[src], audio source[src]");
  const audioSrc =
    audio?.getAttribute("src") ||
    document.querySelector("audio source")?.getAttribute("src") ||
    null;
  const h2s = [...document.querySelectorAll("h1,h2,h3")].map((h) =>
    (h.textContent || "").trim().slice(0, 60),
  );
  const bodySnippet = (document.body?.innerText || "").slice(0, 2500);
  return { audioSrc, h2s, bodySnippet };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
