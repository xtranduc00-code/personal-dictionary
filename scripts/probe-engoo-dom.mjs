import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://engoo.com/app/daily-news", {
  waitUntil: "networkidle",
  timeout: 90000,
});
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href*="/daily-news/article/"]')];
  return {
    linkCount: links.length,
    sample: links.slice(0, 3).map((a) => ({
      href: a.getAttribute("href"),
      text: (a.innerText || "").slice(0, 80),
      tag: a.tagName,
      parentClass: a.parentElement?.className?.slice?.(0, 80),
    })),
    imgs: [...document.querySelectorAll("img[src]")]
      .slice(0, 5)
      .map((i) => i.src.slice(0, 120)),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
