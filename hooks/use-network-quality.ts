import { useConnectionQualityIndicator } from "@livekit/components-react";
import { ConnectionQuality, type Participant } from "livekit-client";

export type NetworkQuality = "good" | "fair" | "poor" | "unknown";

/**
 * Maps LiveKit's per-participant ConnectionQuality enum to our 4-level UI scale.
 * Excellent/Good are folded into "good" (icon hidden). Poor → "fair" (yellow),
 * Lost → "poor" (red + pulse). Unknown stays unknown so the icon hides during
 * the brief window before LiveKit publishes a first quality sample.
 */
export function useNetworkQuality(participant: Participant): NetworkQuality {
    const { quality } = useConnectionQualityIndicator({ participant });
    switch (quality) {
        case ConnectionQuality.Excellent:
        case ConnectionQuality.Good:
            return "good";
        case ConnectionQuality.Poor:
            return "fair";
        case ConnectionQuality.Lost:
            return "poor";
        default:
            return "unknown";
    }
}
