const SUBJECT = "Reset your password";
const RESEND_TIMEOUT_MS = 20_000;

export type PasswordResetMailResult = {
    sent: boolean;
    /** Set when `sent` is false — surfaced in forgot-password `debug` (development only). */
    mailError?: string;
};

function resetEmailBodies(resetUrl: string) {
    const text = [
        "We received a request to reset your password.",
        "",
        `Open this link to set a new password (valid for 1 hour):\n${resetUrl}`,
        "",
        "If you didn't ask for this, you can ignore this email.",
    ].join("\n");
    const html = `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you didn’t ask for this, you can ignore this email.</p>`;
    return { text, html };
}

function buildFromHeader(): string {
    const addr = process.env.AUTH_EMAIL_FROM?.trim();
    const name = process.env.AUTH_EMAIL_FROM_NAME?.trim();
    if (addr && name) {
        return `${name} <${addr}>`;
    }
    return addr || "onboarding@resend.dev";
}

async function resendErrorSummary(res: Response, bodyText: string): Promise<string> {
    try {
        const j = JSON.parse(bodyText) as { message?: string; name?: string };
        if (typeof j.message === "string") {
            return j.name ? `${j.name}: ${j.message}` : j.message;
        }
    }
    catch {
        /* plain text body */
    }
    return bodyText.slice(0, 500) || `HTTP ${res.status}`;
}

type TransportResult = { ok: true } | { ok: false; error: string };

async function sendViaResend(opts: {
    to: string;
    text: string;
    html: string;
}): Promise<TransportResult> {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) {
        return { ok: false, error: "RESEND_API_KEY missing" };
    }
    const from = buildFromHeader();
    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from,
                to: [opts.to],
                subject: SUBJECT,
                text: opts.text,
                html: opts.html,
            }),
            signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });
        const raw = await res.text();
        if (!res.ok) {
            const summary = await resendErrorSummary(res, raw);
            return { ok: false, error: `${res.status} ${summary}` };
        }
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
}

async function sendViaSmtp(opts: {
    to: string;
    text: string;
    html: string;
}): Promise<TransportResult> {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    if (!host || !user || !pass) {
        return { ok: false, error: "SMTP_* not fully configured" };
    }
    const portRaw = process.env.SMTP_PORT?.trim();
    const port = portRaw ? Number.parseInt(portRaw, 10) : 587;
    const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase();
    const secure = secureEnv === "1" || secureEnv === "true" || port === 465;
    const from = process.env.AUTH_EMAIL_FROM?.trim() || user;
    try {
        const { default: nodemailer } = await import("nodemailer");
        const transporter = nodemailer.createTransport({
            host,
            port: Number.isFinite(port) ? port : 587,
            secure,
            auth: { user, pass },
        });
        await transporter.sendMail({
            from,
            to: opts.to,
            subject: SUBJECT,
            text: opts.text,
            html: opts.html,
        });
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
}

/** Resend first (if key present), then SMTP. */
export async function sendPasswordResetEmail(opts: {
    to: string;
    resetUrl: string;
}): Promise<PasswordResetMailResult> {
    const { text, html } = resetEmailBodies(opts.resetUrl);
    const payload = { to: opts.to, text, html };
    const resend = await sendViaResend(payload);
    if (resend.ok) {
        return { sent: true };
    }
    const smtp = await sendViaSmtp(payload);
    if (smtp.ok) {
        return { sent: true };
    }
    const mailError = [resend.error, smtp.error].filter(Boolean).join(" | ");
    return { sent: false, mailError };
}
