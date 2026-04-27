import { memo } from "react";
import type { NetworkQuality } from "@/hooks/use-network-quality";

interface Props {
    quality: NetworkQuality;
    /** 12px icon in a 20px ring — for the small self-PIP. Defaults to 14px / 24px. */
    small?: boolean;
}

const COLOR: Record<"good" | "fair" | "poor", string> = {
    good: "#10B981",
    fair: "#F59E0B",
    poor: "#EF4444",
};

const LABEL: Record<"good" | "fair" | "poor", string> = {
    good: "Connection: Good",
    fair: "Connection: Fair",
    poor: "Connection: Poor — Reconnecting…",
};

export const NetworkQualityIcon = memo(function NetworkQualityIcon({
    quality,
    small,
}: Props) {
    if (quality === "unknown") {
        return null;
    }
    const color = COLOR[quality];
    const label = LABEL[quality];
    const iconPx = small ? 12 : 14;
    const ringPx = small ? 20 : 24;
    const isPoor = quality === "poor";

    /**
     * Hidden by default; revealed by the tile's hover state. Two group-hover
     * variants are listed so a single component supports both the unnamed
     * `group` on VideoTile and the named `group/pip` on LocalSelfPip.
     */
    return (
        <div
            title={label}
            aria-label={label}
            className={`pointer-events-auto absolute left-2 top-2 z-[40] flex items-center justify-center rounded-full bg-black/55 opacity-0 backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 group-hover/pip:opacity-100 ${isPoor ? "animate-pulse" : ""}`}
            style={{
                width: ringPx,
                height: ringPx,
                color,
            }}
        >
            <svg
                width={iconPx}
                height={iconPx}
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
            >
                {/* Three ascending bars, low → high left-to-right. */}
                <rect x="1" y="9" width="2.5" height="4" rx="0.5" fill="currentColor" />
                <rect x="5.75" y="6" width="2.5" height="7" rx="0.5" fill="currentColor" opacity="0.6" />
                <rect x="10.5" y="2" width="2.5" height="11" rx="0.5" fill="currentColor" opacity="0.3" />
            </svg>
        </div>
    );
});
