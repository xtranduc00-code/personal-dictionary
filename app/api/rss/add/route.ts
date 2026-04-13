import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addCustomRssSource } from "@/lib/rss-sources";

export const runtime = "nodejs";

const bodySchema = z.object({
    name: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i, "lowercase letters, digits, - or _ only"),
    url: z.string().url().max(2048),
    label: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
    let parsed: z.infer<typeof bodySchema>;
    try {
        const raw: unknown = await req.json();
        const r = bodySchema.safeParse(raw);
        if (!r.success) {
            return NextResponse.json(
                { error: r.error.issues.map((i) => i.message).join("; ") },
                { status: 400 },
            );
        }
        parsed = r.data;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    try {
        const saved = await addCustomRssSource(parsed);
        return NextResponse.json({ source: saved });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not save RSS source.";
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
