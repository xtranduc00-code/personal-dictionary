import { chromium } from "playwright";

const url =
  "https://engoo.com/app/daily-news/article/cheaper-fare-or-faster-ride-most-choose-savings/C_f4gC0dEfG6MHe_mspQ1A";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const audios = [...document.querySelectorAll("audio")].map((a) => ({
    src: a.src,
    currentSrc: a.currentSrc,
  }));
  const sources = [...document.querySelectorAll("audio source, source[type*='audio']")].map(
    (s) => s.src || s.getAttribute("src"),
  );
  return { audios, sources };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
