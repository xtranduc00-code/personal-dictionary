import type { Metadata } from "next";
import { Suspense } from "react";
import { SmartReaderClient } from "@/components/reader/smart-reader-client";

export const metadata: Metadata = {
    title: "Reader · Daily News",
};

export default function SmartReaderPage() {
    return (
        <Suspense fallback={null}>
            <SmartReaderClient />
        </Suspense>
    );
}
