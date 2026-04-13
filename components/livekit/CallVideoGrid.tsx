"use client";

import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type RefObject,
} from "react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import {
    isTrackReference,
    VideoTrack,
    useParticipants,
    useTracks,
} from "@livekit/components-react";
import { Pin } from "lucide-react";
import { Track } from "livekit-client";
import { useI18n } from "@/components/i18n-provider";
import { avatarColor, getInitials } from "@/lib/meets-avatar";
import {
    type MeetsVideoSubscriptionProfile,
    useMeetsTrackSubscriptionProfile,
} from "@/lib/use-meets-track-subscription-profile";

function displayName(trackRef: TrackReferenceOrPlaceholder): string {
    return trackRef.participant.name || trackRef.participant.identity || "Guest";
}

function CameraOffBadge({
    name,
    size,
}: {
    name: string;
    size: "pip" | "strip" | "stage";
}) {
    const initials = getInitials(name);
    const color = avatarColor(name);
    /** Skip the name line when it collapses to the same single letter as the initials (e.g. name "B" → initials "B"). */
    const showName = name.trim().toUpperCase() !== initials;
    if (size === "pip") {
        return (
            <div className="flex h-full w-full items-center justify-center bg-[#2a2a2a]">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white ${color}`}>
                    {initials}
                </div>
            </div>
        );
    }
    if (size === "strip") {
        return (
            <div className="flex h-full w-full items-center justify-center bg-zinc-900 px-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ${color}`}>
                    {initials}
                </div>
            </div>
        );
    }
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-900">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg ${color}`}>
                {initials}
            </div>
            {showName ? (
                <span className="max-w-[240px] truncate text-sm font-medium text-white/85">
                    {name}
                </span>
            ) : null}
        </div>
    );
}

function isCameraOff(trackRef: TrackReferenceOrPlaceholder): boolean {
    if (trackRef.source !== Track.Source.Camera) {
        return false;
    }
    if (!isTrackReference(trackRef)) {
        return true;
    }
    return trackRef.publication?.isMuted === true;
}

const VideoCell = memo(function VideoCell({
    trackRef,
    fit,
    minHeightClass,
    fillStage,
    subscriptionProfile,
    hideLabel,
    badgeSize = "stage",
}: {
    trackRef: TrackReferenceOrPlaceholder;
    fit: "cover" | "contain";
    minHeightClass?: string;
    fillStage?: boolean;
    subscriptionProfile: MeetsVideoSubscriptionProfile;
    hideLabel?: boolean;
    badgeSize?: "stage" | "strip";
}) {
    useMeetsTrackSubscriptionProfile(trackRef, subscriptionProfile);

    const isScreen = trackRef.source === Track.Source.ScreenShare;
    const cameraOff = isCameraOff(trackRef);
    const frame = fillStage
        ? "relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black"
        : `relative flex items-center justify-center w-full overflow-hidden rounded-lg border border-zinc-200 bg-black ${minHeightClass ?? "min-h-0"}`;
    const name = displayName(trackRef);
    return (
        <div className={frame}>
            {isTrackReference(trackRef) && !cameraOff ? (
                <VideoTrack
                    trackRef={trackRef}
                    manageSubscription={false}
                    className="block min-h-0 min-w-0"
                    style={{
                        width: "100%",
                        height: "100%",
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: fit,
                    }}
                />
            ) : (
                <CameraOffBadge name={name} size={badgeSize} />
            )}
            {!hideLabel && !cameraOff && (
                <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-24px)] truncate rounded-md bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    {name}
                    {isScreen ? " · screen" : ""}
                </div>
            )}
        </div>
    );
});

function trackKey(trackRef: TrackReferenceOrPlaceholder): string {
    return `${trackRef.participant.identity}-${trackRef.source}-${trackRef.publication?.trackSid ?? "p"}`;
}

function fitForTrack(trackRef: TrackReferenceOrPlaceholder): "cover" | "contain" {
    return trackRef.source === Track.Source.ScreenShare ? "contain" : "cover";
}

const PIP_PAD = 8;

/** Góc preview bản thân — luôn hiện khi có track camera local (kể cả một mình trong phòng). */
const LocalSelfPip = memo(function LocalSelfPip({
    trackRef,
    constrainToRef,
}: {
    trackRef: TrackReferenceOrPlaceholder;
    /** Khi share màn hình: kéo thả trong khung video; không truyền thì vị trí cố định như cũ. */
    constrainToRef?: RefObject<HTMLElement | null>;
}) {
    const { t } = useI18n();
    const subscriptionProfile: MeetsVideoSubscriptionProfile = "thumbnail";
    useMeetsTrackSubscriptionProfile(trackRef, subscriptionProfile);
    const fit = fitForTrack(trackRef);

    const pipOuterRef = useRef<HTMLDivElement>(null);
    const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);
    const dragRef = useRef<{ startX: number; startY: number; baseL: number; baseT: number } | null>(
        null,
    );

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (!constrainToRef?.current || e.button !== 0) {
                return;
            }
            const parent = constrainToRef.current;
            const pip = pipOuterRef.current;
            if (!pip) {
                return;
            }
            e.preventDefault();
            const pr = parent.getBoundingClientRect();
            const wr = pip.getBoundingClientRect();
            const baseL = wr.left - pr.left;
            const baseT = wr.top - pr.top;
            setDragPos({ left: baseL, top: baseT });
            dragRef.current = { startX: e.clientX, startY: e.clientY, baseL, baseT };
            pip.setPointerCapture(e.pointerId);
        },
        [constrainToRef],
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            const d = dragRef.current;
            const parent = constrainToRef?.current;
            const pip = pipOuterRef.current;
            if (!d || !parent || !pip) {
                return;
            }
            const pr = parent.getBoundingClientRect();
            const pipW = pip.offsetWidth;
            const pipH = pip.offsetHeight;
            let nl = d.baseL + e.clientX - d.startX;
            let nt = d.baseT + e.clientY - d.startY;
            nl = Math.min(Math.max(PIP_PAD, nl), pr.width - pipW - PIP_PAD);
            nt = Math.min(Math.max(PIP_PAD, nt), pr.height - pipH - PIP_PAD);
            setDragPos({ left: nl, top: nt });
        },
        [constrainToRef],
    );

    const endDrag = useCallback((e: React.PointerEvent) => {
        dragRef.current = null;
        try {
            pipOuterRef.current?.releasePointerCapture(e.pointerId);
        }
        catch {
            /* already released */
        }
    }, []);

    const draggable = Boolean(constrainToRef);
    const positionClass = draggable
        ? dragPos
            ? ""
            : "bottom-4 right-4"
        : "bottom-16 right-4";

    const cameraOff = !isTrackReference(trackRef) || isCameraOff(trackRef);
    const pipName = displayName(trackRef);
    return (
        <div
            ref={pipOuterRef}
            className={`group/pip absolute z-[38] aspect-video min-h-[80px] min-w-[120px] w-[min(24vw,180px)] touch-none ${positionClass} ${draggable ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"}`}
            style={
                dragPos && draggable
                    ? {
                          left: dragPos.left,
                          top: dragPos.top,
                          right: "auto",
                          bottom: "auto",
                      }
                    : undefined
            }
            data-meet-self-pip="true"
            onPointerDown={draggable ? onPointerDown : undefined}
            onPointerMove={draggable ? onPointerMove : undefined}
            onPointerUp={draggable ? endDrag : undefined}
            onPointerCancel={draggable ? endDrag : undefined}
        >
            <div
                className={`relative h-full w-full overflow-hidden rounded-xl border-2 border-white/15 bg-[#2a2a2a] shadow-lg ${draggable ? "" : "pointer-events-auto"}`}
                title={draggable ? t("meetsSelfPipDragHint") : undefined}
            >
                {cameraOff ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3">
                        <div
                            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white ${avatarColor(pipName)}`}
                        >
                            {getInitials(pipName)}
                        </div>
                        <span className="text-[11px]" style={{ color: "#888" }}>
                            You
                        </span>
                    </div>
                ) : (
                    <VideoTrack
                        trackRef={trackRef}
                        manageSubscription={false}
                        className="pointer-events-none h-full w-full object-cover select-none"
                        style={{ objectFit: fit }}
                    />
                )}
            </div>
        </div>
    );
});

const VideoTile = memo(function VideoTile({
    trackRef,
    fit,
    minHeightClass,
    fillStage,
    tileKey,
    pinnedKey,
    onPinToggle,
    compact,
    hideLabel,
}: {
    trackRef: TrackReferenceOrPlaceholder;
    fit: "cover" | "contain";
    minHeightClass?: string;
    fillStage?: boolean;
    tileKey: string;
    pinnedKey: string | null;
    onPinToggle: (key: string) => void;
    compact?: boolean;
    hideLabel?: boolean;
}) {
    const { t } = useI18n();
    const isPinned = pinnedKey === tileKey;
    const subscriptionProfile: MeetsVideoSubscriptionProfile = compact ? "thumbnail" : "main";
    return (
        <div
            className={`group relative min-h-0 ${compact ? "aspect-video w-full shrink-0 overflow-hidden rounded-lg" : "h-full w-full"}`}
        >
            <VideoCell
                trackRef={trackRef}
                fit={fit}
                fillStage={fillStage}
                minHeightClass={minHeightClass}
                subscriptionProfile={subscriptionProfile}
                hideLabel={hideLabel}
                badgeSize={compact ? "strip" : "stage"}
            />
            <div
                className={`pointer-events-none absolute inset-x-0 top-0 flex justify-end p-2 ${compact ? "opacity-100 sm:opacity-0 sm:group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
            >
                <button
                    type="button"
                    className={`pointer-events-auto rounded-lg border border-zinc-300 bg-white/95 p-2 text-zinc-700 shadow-md backdrop-blur-sm transition hover:bg-zinc-50 ${isPinned ? "opacity-100 ring-2 ring-amber-400/90" : ""}`}
                    title={isPinned ? t("meetsUnpinTrack") : t("meetsPinTrack")}
                    aria-label={isPinned ? t("meetsUnpinTrack") : t("meetsPinTrack")}
                    aria-pressed={isPinned}
                    onClick={(e) => {
                        e.stopPropagation();
                        onPinToggle(tileKey);
                    }}
                >
                    <Pin className={`h-4 w-4 ${isPinned ? "fill-amber-300 text-amber-100" : ""}`} strokeWidth={2} />
                </button>
            </div>
        </div>
    );
});

function EmptyStage({
    primaryName,
    isSelf,
    waitingForOthers,
}: {
    primaryName: string;
    isSelf: boolean;
    waitingForOthers: boolean;
}) {
    const initials = getInitials(primaryName);
    const color = avatarColor(primaryName);
    const displayLabel = isSelf ? "You" : primaryName;
    return (
        <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-6 bg-[#1a1a1a]">
            <div className="flex flex-col items-center gap-3">
                <div
                    className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-lg ${color}`}
                >
                    {initials}
                </div>
                <div className="flex flex-col items-center gap-1">
                    <span className="max-w-[260px] truncate text-[15px] font-medium text-white">
                        {displayLabel}
                    </span>
                    <span className="text-[12px] text-zinc-400">Camera is off</span>
                </div>
            </div>
            {waitingForOthers ? (
                <span className="text-[13px] text-zinc-500">Waiting for others to join…</span>
            ) : null}
        </div>
    );
}

const TRACK_SOURCES = [
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
] as const;

/**
 * — Grid when no screen share and nothing pinned.
 * — Meet-style focus: any screen share → main stage + camera strip; optional pin overrides main tile.
 */
export const CallVideoGrid = memo(function CallVideoGrid() {
    const { t } = useI18n();
    const focusStageRef = useRef<HTMLDivElement>(null);
    const [pinnedKey, setPinnedKey] = useState<string | null>(null);
    const participants = useParticipants();
    const hasRemoteParticipant = useMemo(() => participants.some((p) => !p.isLocal), [participants]);

    const tracks = useTracks([...TRACK_SOURCES], { onlySubscribed: false });

    const localParticipant = useMemo(
        () => participants.find((p) => p.isLocal) ?? null,
        [participants],
    );
    const primaryRemote = useMemo(
        () => participants.find((p) => !p.isLocal) ?? null,
        [participants],
    );

    const { cameraTracks, liveScreens, localScreen, remoteScreens, allForPinLookup, localCameraTrack } =
        useMemo(() => {
            const screenTracks = tracks.filter((tr) => tr.source === Track.Source.ScreenShare);
            const cameraTracksFiltered = tracks.filter((tr) => tr.source === Track.Source.Camera);
            const liveScreensFiltered = screenTracks.filter(isTrackReference);
            const localS = liveScreensFiltered.find((r) => r.participant.isLocal) ?? null;
            const remoteS = liveScreensFiltered.filter((r) => !r.participant.isLocal);

            const localCam =
                cameraTracksFiltered.find((tr) => tr.participant.isLocal && tr.source === Track.Source.Camera) ??
                null;

            const camerasForLayout = hasRemoteParticipant
                ? cameraTracksFiltered.filter((tr) => !tr.participant.isLocal)
                : cameraTracksFiltered;

            const all = [...camerasForLayout, ...liveScreensFiltered];
            return {
                cameraTracks: camerasForLayout,
                liveScreens: liveScreensFiltered,
                localScreen: localS,
                remoteScreens: remoteS,
                allForPinLookup: all,
                localCameraTrack: localCam,
            };
        }, [tracks, hasRemoteParticipant]);

    useEffect(() => {
        if (!pinnedKey) {
            return;
        }
        const ok = allForPinLookup.some((tr) => trackKey(tr) === pinnedKey);
        if (!ok) {
            setPinnedKey(null);
        }
    }, [allForPinLookup, pinnedKey]);

    const autoScreenFocus =
        localScreen ?? (remoteScreens.length > 0 ? remoteScreens[0] : null);

    const focusTrack = useMemo(() => {
        if (pinnedKey) {
            const hit = allForPinLookup.find((tr) => trackKey(tr) === pinnedKey);
            if (hit) {
                return hit;
            }
        }
        return autoScreenFocus;
    }, [allForPinLookup, pinnedKey, autoScreenFocus]);

    const hasActiveScreenShare = liveScreens.length > 0;
    const useFocusLayout = hasActiveScreenShare || pinnedKey !== null;

    const onPinToggle = useCallback((key: string) => {
        setPinnedKey((prev) => (prev === key ? null : key));
    }, []);

    const focusKey = focusTrack ? trackKey(focusTrack) : "";

    const stripTracks = useMemo(() => {
        if (!focusTrack) {
            return [];
        }
        const fk = trackKey(focusTrack);
        return allForPinLookup.filter((tr) => trackKey(tr) !== fk);
    }, [allForPinLookup, focusTrack]);

    /**
     * Cameras + remote screens, but drop cameras that are off — those get
     * represented as avatar chips in the header instead of floating tiles on the stage.
     */
    const stageTiles = useMemo(
        () => [
            ...cameraTracks.filter((tr) => !isCameraOff(tr)),
            ...remoteScreens,
        ],
        [cameraTracks, remoteScreens],
    );

    if (useFocusLayout && focusTrack) {
        return (
            <div className="relative flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-[#1a1a1a]">
                {/* Main screen share — fills all available space */}
                <div
                    ref={focusStageRef}
                    className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
                >
                    <VideoTile
                        trackRef={focusTrack}
                        fit={fitForTrack(focusTrack)}
                        fillStage
                        hideLabel
                        tileKey={focusKey}
                        pinnedKey={pinnedKey}
                        onPinToggle={onPinToggle}
                    />
                    {/* Self-view overlay — hidden during screen share or when own camera is off */}
                    {!hasActiveScreenShare && localCameraTrack && !isCameraOff(localCameraTrack) ? (
                        <LocalSelfPip
                            trackRef={localCameraTrack}
                            constrainToRef={focusStageRef}
                        />
                    ) : null}
                </div>
                {/* Right sidebar strip — hidden during screen share so shared content fills width */}
                {!hasActiveScreenShare && stripTracks.length > 0 ? (
                    <div
                        className="flex shrink-0 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2"
                        style={{ width: 168 }}
                        role="region"
                        aria-label={t("meetsFilmstripLabel")}
                    >
                        {stripTracks.map((tr) => {
                            const k = trackKey(tr);
                            return (
                                <div key={k} className="shrink-0" style={{ width: 152, height: 86 }}>
                                    <VideoTile
                                        trackRef={tr}
                                        fit="cover"
                                        compact
                                        tileKey={k}
                                        pinnedKey={pinnedKey}
                                        onPinToggle={onPinToggle}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        );
    }

    const emptyStagePrimary = primaryRemote ?? localParticipant;
    const emptyStageName =
        emptyStagePrimary?.name || emptyStagePrimary?.identity || "You";
    const emptyStageIsSelf = !primaryRemote;
    const waitingForOthers = !hasRemoteParticipant;

    const mainStage =
        stageTiles.length === 0 ? (
            <EmptyStage
                primaryName={emptyStageName}
                isSelf={emptyStageIsSelf}
                waitingForOthers={waitingForOthers}
            />
        ) : stageTiles.length === 1 ? (
            <div className="flex h-full min-h-0 w-full flex-1 items-stretch justify-center px-0 py-0">
                <div className="flex h-full min-h-0 w-full flex-1">
                    <VideoTile
                        trackRef={stageTiles[0]}
                        fit={fitForTrack(stageTiles[0])}
                        fillStage
                        tileKey={trackKey(stageTiles[0])}
                        pinnedKey={pinnedKey}
                        onPinToggle={onPinToggle}
                    />
                </div>
            </div>
        ) : (
            <div className="grid h-full min-h-0 w-full flex-1 grid-cols-1 gap-2 px-2 py-2 sm:grid-cols-2 sm:gap-3 sm:px-3 sm:py-3 md:gap-4">
                {stageTiles.map((trackRef) => {
                    const isScreen = trackRef.source === Track.Source.ScreenShare;
                    const minH = isScreen
                        ? "min-h-[200px] flex-1 sm:min-h-[240px]"
                        : "min-h-[220px] flex-1 sm:min-h-[260px]";
                    const k = trackKey(trackRef);
                    return (
                        <VideoTile
                            key={k}
                            trackRef={trackRef}
                            fit={fitForTrack(trackRef)}
                            minHeightClass={`min-h-0 ${minH}`}
                            tileKey={k}
                            pinnedKey={pinnedKey}
                            onPinToggle={onPinToggle}
                        />
                    );
                })}
            </div>
        );

    return (
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-[#1a1a1a]">
            {mainStage}
            {localCameraTrack ? <LocalSelfPip trackRef={localCameraTrack} /> : null}
        </div>
    );
});
