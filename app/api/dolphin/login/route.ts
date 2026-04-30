import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { chromium } from "playwright-core";
import {
  TOTP,
  NobleCryptoPlugin,
  ScureBase32Plugin,
} from "otplib";
import { DOLPHIN_API_TOKEN_ENV } from "@/lib/dolphin/constants";

export const maxDuration = 120;
export const runtime = "nodejs";

const DOLPHIN_LOCAL_API_BASE = "http://localhost:3001/v1.0";

async function authenticateLocalApi(): Promise<void> {
  const token = process.env[DOLPHIN_API_TOKEN_ENV]?.trim();
  if (!token) {
    throw new Error(
      `${DOLPHIN_API_TOKEN_ENV} env var is not set. Add it to .env.local and restart the dev server.`,
    );
  }
  const url = `${DOLPHIN_LOCAL_API_BASE}/auth/login-with-token`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(
      `Cannot reach Dolphin Local API at localhost:3001. Is the Dolphin Anty desktop app running? (${
        err instanceof Error ? err.message : "fetch failed"
      })`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error(
        `Dolphin Local API rejected your token (401). Make sure Dolphin Anty desktop is logged into the SAME account/team as the token, then regenerate the API token (Dolphin panel → API), update ${DOLPHIN_API_TOKEN_ENV}, and restart BOTH Dolphin Anty + your Next dev server.${
          body ? ` Response: ${body.slice(0, 300)}` : ""
        }`,
      );
    }
    throw new Error(
      `Dolphin Local API auth failed (HTTP ${res.status}). The token may be invalid or your Dolphin plan may not include Cloud sync.${
        body ? ` — ${body.slice(0, 300)}` : ""
      }`,
    );
  }
}

const bodySchema = z.object({
  profileId: z.string().trim().min(1).max(64),
  email: z.string().trim().min(1),
  password: z.string().min(1),
  totp: z.string().trim().min(1),
});

type LoginResponse =
  | { ok: true; profileId: string; email: string }
  | { ok: false; profileId: string; reason: string };

const START_RETRY_ATTEMPTS = 5;
const START_RETRY_DELAY_MS = 2_000;
const START_PROFILE_NOT_FOUND_DELAY_MS = 4_000;

async function materializeProfile(profileId: string): Promise<void> {
  const url = `${DOLPHIN_LOCAL_API_BASE}/browser_profiles/${profileId}`;
  try {
    await fetch(url, { cache: "no-store" });
  } catch {
    // best-effort — start will fail with clearer error if not reachable
  }
}

async function startProfileOnce(profileId: string): Promise<
  | { ok: true; wsEndpoint: string; port?: number }
  | { ok: false; status: number; body: string }
> {
  const url = `${DOLPHIN_LOCAL_API_BASE}/browser_profiles/${profileId}/start?automation=1`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    throw new Error(
      `Cannot reach Dolphin Local API at localhost:3001. Is the Dolphin Anty desktop app running? (${
        err instanceof Error ? err.message : "fetch failed"
      })`,
    );
  }
  if (!res.ok) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 500);
    } catch {}
    return { ok: false, status: res.status, body };
  }
  const data = (await res.json()) as {
    success?: boolean;
    automation?: { port?: number; wsEndpoint?: string };
  };
  if (!data.success) {
    return {
      ok: false,
      status: 200,
      body: JSON.stringify(data).slice(0, 500),
    };
  }
  const port = data.automation?.port;
  const wsEndpoint = data.automation?.wsEndpoint;
  if (!wsEndpoint) {
    return {
      ok: false,
      status: 200,
      body: "Dolphin did not return automation.wsEndpoint",
    };
  }
  return { ok: true, wsEndpoint, port };
}

async function startProfile(
  profileId: string,
): Promise<{ wsEndpoint: string }> {
  let lastError: { status: number; body: string } | null = null;
  for (let attempt = 1; attempt <= START_RETRY_ATTEMPTS; attempt++) {
    const result = await startProfileOnce(profileId);
    if (result.ok) {
      const { wsEndpoint, port } = result;
      if (wsEndpoint.startsWith("ws://") || wsEndpoint.startsWith("wss://")) {
        return { wsEndpoint };
      }
      if (!port) {
        throw new Error("Automation port missing from Dolphin response.");
      }
      return {
        wsEndpoint: `ws://127.0.0.1:${port}/${wsEndpoint.replace(/^\/+/, "")}`,
      };
    }
    lastError = { status: result.status, body: result.body };
    if (
      (result.status === 404 || result.status === 500) &&
      /basic browser profile not found/i.test(result.body) &&
      attempt < START_RETRY_ATTEMPTS
    ) {
      await new Promise((r) =>
        setTimeout(r, START_PROFILE_NOT_FOUND_DELAY_MS),
      );
      continue;
    }
    if (result.status >= 500 && attempt < START_RETRY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, START_RETRY_DELAY_MS));
      continue;
    }
    break;
  }
  const detail = lastError?.body ? ` — ${lastError.body}` : "";
  throw new Error(
    `Dolphin Local API returned HTTP ${lastError?.status ?? "?"} after ${START_RETRY_ATTEMPTS} attempts.${detail} If the error mentions 'basic browser profile not found', wait for Cloud sync in Dolphin Anty, refresh profiles, then try again.`,
  );
}

async function loginGmail(
  wsEndpoint: string,
  creds: { email: string; password: string; totp: string },
): Promise<void> {
  const log = (...args: unknown[]) => console.log("[login]", ...args);

  const browser = await chromium.connectOverCDP(wsEndpoint);
  try {
    const context =
      browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    log("Starting Gmail login", { wsEndpoint });

    await page.goto("https://accounts.google.com/signin", {
      waitUntil: "domcontentloaded",
    });

    log("At URL", page.url());
    await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
    await page.fill('input[type="email"]', creds.email);
    await page.click("#identifierNext");

    // Google renders hidden password inputs (e.g. name="hiddenPassword").
    // Use the canonical visible password field (name="Passwd") first, then fall back.
    const passwordSelectorCandidates = [
      'input[name="Passwd"]',
      'input[type="password"]:not([aria-hidden="true"]):not([tabindex="-1"])',
    ];
    let passwordLocator = page.locator(passwordSelectorCandidates[0]);
    try {
      await passwordLocator.waitFor({ state: "visible", timeout: 30_000 });
    } catch {
      // Might be on an account challenge / recaptcha page.
      const url = page.url();
      log("Password input not visible; URL", url);
      if (/challenge\/recaptcha|challenge\/.+recaptcha/i.test(url)) {
        throw new Error(
          "Google blocked automation with reCAPTCHA (Verify it's you). Open the profile and complete the login manually once, then rerun without auto-login.",
        );
      }
      const verifyHeading = page.locator('text=/Verify it\\s*\\x27?s you/i');
      if ((await verifyHeading.count().catch(() => 0)) > 0) {
        throw new Error(
          "Google requires 'Verify it’s you'. Automation cannot proceed; complete the verification manually inside the Dolphin profile.",
        );
      }
      // Fallback selector for variants
      passwordLocator = page.locator(passwordSelectorCandidates[1]);
      await passwordLocator.waitFor({ state: "visible", timeout: 15_000 });
    }

    await page.waitForTimeout(400);
    await passwordLocator.fill(creds.password);
    await page.click("#passwordNext");

    // Some accounts land on a 2-Step method selection screen first.
    // We want the "Google Authenticator app" (TOTP) path.
    const selectionUrlRegex = /challenge\/selection/i;
    if (selectionUrlRegex.test(page.url())) {
      log("2FA: on selection screen; choosing Google Authenticator option", page.url());
      const authenticatorOption = page
        .getByRole("button", {
          name: /google authenticator|verification code from the google authenticator/i,
        })
        .first();
      const securityCodeOption = page
        .getByRole("button", {
          name: /use your phone.*security code|get a security code/i,
        })
        .first();
      const fallbackByText = page
        .locator(
          'text=/Get a verification code from the Google Authenticator app/i',
        )
        .first();

      await Promise.race([
        authenticatorOption.click({ timeout: 8_000 }),
        fallbackByText.click({ timeout: 8_000 }),
        // Some UIs don't label the authenticator option well; pick "security code" then "authenticator" on next page.
        securityCodeOption.click({ timeout: 8_000 }),
      ]).catch((err) => {
        log("2FA: could not click selection option", err);
      });

      // Wait briefly for navigation into the TOTP challenge.
      await page
        .waitForURL(/challenge\/(totp|otp)/i, {
          timeout: 12_000,
          waitUntil: "domcontentloaded",
        })
        .catch(() => {
          log("2FA: selection did not navigate to /challenge/totp (continuing)", page.url());
        });
    }

    const cleanSecret = creds.totp.replace(/\s+/g, "").toUpperCase();
    const totpSelectors = [
      // Common Google TOTP field
      'input[name="totpPin"]',
      // Some variants use Passcode / code
      'input[name="code"]',
      // Numeric / OTP inputs
      'input[autocomplete="one-time-code"]',
      'input[type="tel"]',
      'input[inputmode="numeric"]',
      // "Enter code" prompt variants
      'input[aria-label*="enter code" i]',
      'input[aria-label*="code" i]',
      'input[aria-label*="verification" i]',
    ].join(", ");

    // ---- 2FA (TOTP) handler: fully logged, no infinite waits ----
    const totpStartUrl = page.url();
    log("Post-password URL", totpStartUrl);
    log("2FA: waiting for TOTP challenge (URL or input)...");
    const totpUrlRegex = /challenge\/totp/i;
    const enterCodeLabel = page.getByLabel(/enter code/i);
    const totpFallbackLocator = page.locator(totpSelectors);

    const totpDetected = await Promise.race([
      page
        .waitForURL(totpUrlRegex, { timeout: 15_000, waitUntil: "domcontentloaded" })
        .then(() => true)
        .catch(() => false),
      enterCodeLabel
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false),
      totpFallbackLocator
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false),
    ]);

    log("2FA detected?", totpDetected, "URL:", page.url());

    if (totpDetected) {
      try {
        log("2FA: generating TOTP", { secretLength: cleanSecret.length });
        const totp = new TOTP({
          crypto: new NobleCryptoPlugin(),
          base32: new ScureBase32Plugin(),
        });
        const code = await totp.generate({ secret: cleanSecret });
        log("2FA: generated code", code);

        // Best-effort: tick "Don't ask again on this device" to reduce future prompts.
        // (This is a page element, unlike the browser's "Save password" bubble.)
        try {
          const dontAskAgain = page.getByLabel(/don'?t ask again/i);
          if (await dontAskAgain.isVisible().catch(() => false)) {
            log('2FA: checking "Don\'t ask again on this device"');
            await dontAskAgain.check({ timeout: 3_000 }).catch(() => {});
          }
        } catch (err) {
          log("2FA: could not toggle don't-ask-again checkbox", err);
        }

        // Prefer the explicit "Enter code" label when available (most reliable).
        log('2FA: looking for input primary: getByLabel(/enter code/i)');
        let codeField = enterCodeLabel;
        const primaryVisible = await codeField
          .isVisible()
          .catch(() => false);
        log("2FA: primary visible?", primaryVisible);

        if (!primaryVisible) {
          log("2FA: trying fallback totpSelectors", totpSelectors);
          codeField = page
            .locator(totpSelectors)
            .filter({
              hasNot: page.locator('[aria-hidden="true"], [tabindex="-1"]'),
            })
            .first();
          await codeField.waitFor({ state: "visible", timeout: 10_000 });
          log("2FA: fallback input visible");
        } else {
          await codeField.waitFor({ state: "visible", timeout: 10_000 });
        }

        log("2FA: clicking input");
        await codeField.click({ timeout: 5_000 });
        log("2FA: clearing input");
        await codeField.fill("", { timeout: 5_000 });
        log("2FA: typing code");
        await codeField.type(code, { delay: 40, timeout: 10_000 });

        const typed = await codeField.inputValue({ timeout: 5_000 }).catch(() => "");
        log("2FA: inputValue after type", typed);
        if (!typed || typed.replace(/\s+/g, "") !== code) {
          throw new Error(
            `2FA: code not present in visible input after type (typed="${typed}", expected="${code}")`,
          );
        }

        log("2FA: submitting via Enter");
        await codeField.press("Enter", { timeout: 3_000 }).catch(() => {});
        await page.waitForTimeout(800);

        if (totpUrlRegex.test(page.url())) {
          log("2FA: still on /challenge/totp, trying button click submit");
          const nextButton = page
            .getByRole("button", { name: /next|verify/i })
            .first();
          const totpNext = page.locator("#totpNext");

          const btn = (await totpNext.isVisible().catch(() => false))
            ? totpNext
            : nextButton;

          log("2FA: waiting button enabled");
          await page
            .waitForFunction(
              (el) =>
                !!el &&
                !(el instanceof HTMLButtonElement && el.disabled),
              await btn.elementHandle(),
              { timeout: 8_000 },
            )
            .catch(() => {});

          log("2FA: clicking submit button");
          await btn.click({ timeout: 10_000 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        log("2FA handler error:", msg);
        if (stack) log(stack);
        throw err instanceof Error ? err : new Error(msg);
      }
    } else {
      log("2FA: not detected within 15s; continuing");
    }

    // Some accounts land on recovery options after successful 2FA.
    // We don't want to block on these pages — go straight to Gmail.
    const postAuthUrl = page.url();
    if (/gds\.google\.com\/web\/recoveryoptions/i.test(postAuthUrl)) {
      log("Detected recovery options page; attempting to skip");
      await Promise.race([
        page.getByRole("button", { name: /skip|not now|cancel/i }).first().click({ timeout: 3_000 }),
        page.getByRole("link", { name: /skip|not now|cancel/i }).first().click({ timeout: 3_000 }),
      ]).catch(() => {});
    }

    // Navigate to Gmail to confirm session is actually persisted in the profile.
    // (This avoids falsely treating "recovery options" or other post-auth pages as success.)
    log("Navigating to Gmail inbox");
    await page.goto("https://mail.google.com/", { waitUntil: "domcontentloaded" });

    // After password / 2FA, Google may:
    // - navigate to Gmail/Account (success)
    // - stay on the same page showing "Wrong code"
    // - present another challenge
    const successUrl = (url: URL) =>
      url.host.endsWith("google.com") &&
      (url.host.startsWith("myaccount") ||
        url.host.startsWith("mail") ||
        url.pathname.startsWith("/u/") ||
        /workspace|drive|calendar/.test(url.host));

    const wrongCode = page.locator(
      'text=/Wrong code|Try again|Invalid code|Couldn\\x27?t sign you in/i',
    );

    try {
      log("Waiting for success URL or wrong-code message...", page.url());
      await Promise.race([
        page.waitForURL((u) => successUrl(u), {
          timeout: 60_000,
          waitUntil: "domcontentloaded",
        }),
        wrongCode.waitFor({ state: "visible", timeout: 20_000 }).then(() => {
          throw new Error("Google rejected the 2-Step Verification code.");
        }),
      ]);
    } catch (err) {
      const url = page.url();
      log("Post-login wait failed; URL", url);
      if (/challenge\/recaptcha|challenge\/.+recaptcha/i.test(url)) {
        throw new Error(
          "Google blocked automation with reCAPTCHA (Verify it's you). Complete the challenge manually once inside the Dolphin profile, then rerun.",
        );
      }
      if (/challenge\/totp/i.test(url)) {
        throw new Error(
          "Still on Google 2-Step Verification page after submitting the code. This usually means the code input/submit didn't register (UI variant). Try again, or complete this step manually once inside the profile (check 'Don't ask again on this device').",
        );
      }
      const verifyHeading = page.locator('text=/Verify it\\s*\\x27?s you/i');
      if ((await verifyHeading.count().catch(() => 0)) > 0) {
        throw new Error(
          "Google requires 'Verify it’s you'. Complete the verification manually inside the Dolphin profile, then rerun.",
        );
      }
      if (err instanceof Error) {
        throw new Error(`${err.message} Current URL: ${url}`);
      }
      throw new Error(`Login did not complete. Current URL: ${url}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { profileId, email, password, totp } = parsed.data;

  try {
    await authenticateLocalApi();
    await materializeProfile(profileId);
    const { wsEndpoint } = await startProfile(profileId);
    await loginGmail(wsEndpoint, { email, password, totp });
    return NextResponse.json({
      ok: true,
      profileId,
      email,
    } satisfies LoginResponse);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({
      ok: false,
      profileId,
      reason,
    } satisfies LoginResponse);
  }
}
