/**
 * Best-effort HBR session reset before opening an article.
 *
 * Loads `hbr.org/robots.txt` in a hidden iframe, then attempts to overwrite
 * the publisher's tracking cookies + clear localStorage. NOTE: same-origin
 * policy blocks reading/writing cross-origin cookies and storage from a
 * third-party page, so the inner cleanup is best-effort and silently
 * no-ops when the browser refuses access. The iframe load itself is what
 * the integration is really after — keeps the call site simple and gives
 * us a 3s timeout fallback so the click never feels stuck.
 */
export function clearHbrCookies(timeoutMs = 3000): Promise<void> {
    if (typeof document === "undefined") return Promise.resolve();
    return new Promise<void>((resolve) => {
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "display:none;width:0;height:0;position:fixed;";
        iframe.src = "https://hbr.org/robots.txt";

        let settled = false;
        const cleanup = () => {
            if (settled) return;
            settled = true;
            try {
                document.body.removeChild(iframe);
            } catch {
                /* already detached */
            }
            resolve();
        };

        iframe.onload = () => {
            try {
                const cookieNames = [
                    "sailthru_pageviews",
                    "sailthru_visitor",
                    "sailthru_hid",
                    "tpcc_paidsearch",
                    "x-mfe-subscriptions-exp",
                    "ttcsid",
                    "ttcsid_C2DV602QV140ORDILH20",
                ];
                for (const name of cookieNames) {
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;domain=hbr.org;path=/`;
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;domain=.hbr.org;path=/`;
                }
                try {
                    iframe.contentWindow?.localStorage.clear();
                } catch {
                    /* cross-origin SecurityError — expected, no-op */
                }
            } catch {
                /* nothing we can do — fall through */
            }
            cleanup();
        };

        iframe.onerror = cleanup;
        setTimeout(cleanup, timeoutMs);
        document.body.appendChild(iframe);
    });
}
