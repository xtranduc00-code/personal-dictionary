"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { authFetch, getAuthToken } from "@/lib/auth-context";
import { MEETS_ROOM_NAME_RE, rememberMeetRoom } from "@/lib/meets-recent-rooms";
import { getOrCreateGuestIdentity } from "@/lib/guest-identity";

export type MeetSession = {
    token: string;
    serverUrl: string;
    displayName: string;
};

type MeetCallContextValue = {
    session: MeetSession | null;
    micPrecheckDone: boolean;
    setMicPrecheckDone: (v: boolean) => void;
    connecting: boolean;
    error: string | null;
    requestJoin: (roomNameEncoded: string, guestDisplayName?: string) => void;
    clearSession: () => void;
};

const MeetCallContext = createContext<MeetCallContextValue | null>(null);

function decodeRoomSegment(roomNameEncoded: string): string {
    try {
        return decodeURIComponent(roomNameEncoded);
    }
    catch {
        return roomNameEncoded;
    }
}

export function MeetCallProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<MeetSession | null>(null);
    const [micPrecheckDone, setMicPrecheckDone] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchGen = useRef(0);
    const sessionRef = useRef(session);
    sessionRef.current = session;

    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";

    const clearSession = useCallback(() => {
        fetchGen.current += 1;
        setSession(null);
        setMicPrecheckDone(false);
        setConnecting(false);
        setError(null);
    }, []);

    const requestJoin = useCallback(
        (roomNameEncoded: string, guestDisplayName?: string) => {
            const decoded = decodeRoomSegment(roomNameEncoded);

            if (!MEETS_ROOM_NAME_RE.test(decoded)) {
                setError("invalid_room");
                setSession(null);
                setConnecting(false);
                setMicPrecheckDone(false);
                return;
            }

            if (!serverUrl) {
                setError("no_url");
                setSession(null);
                setConnecting(false);
                return;
            }

            const cur = sessionRef.current;
            if (cur?.displayName === decoded && cur.token) {
                return;
            }

            if (cur && cur.displayName !== decoded) {
                setSession(null);
            }

            setError(null);
            setMicPrecheckDone(false);
            setConnecting(true);

            const gen = ++fetchGen.current;
            void (async () => {
                try {
                    const roomParam = encodeURIComponent(decoded);
                    let res: Response;

                    if (getAuthToken()) {
                        // Logged-in user: use authFetch (identity from session)
                        res = await authFetch(`/api/livekit-token?room=${roomParam}`);
                    } else {
                        // Guest: pass identity via query params
                        const guestId = getOrCreateGuestIdentity();
                        const guestName = guestDisplayName?.trim() || `Guest · ${guestId.slice(-6)}`;
                        res = await fetch(
                            `/api/livekit-token?room=${roomParam}&identity=${encodeURIComponent(guestId)}&displayName=${encodeURIComponent(guestName)}`,
                        );
                    }

                    const data = (await res.json()) as { token?: string; error?: string };
                    if (gen !== fetchGen.current) {
                        return;
                    }
                    if (!res.ok) {
                        setError(data.error ?? `http_${res.status}`);
                        setConnecting(false);
                        setSession(null);
                        return;
                    }
                    if (!data.token) {
                        setError("no_token");
                        setConnecting(false);
                        setSession(null);
                        return;
                    }
                    setSession({
                        token: data.token,
                        serverUrl,
                        displayName: decoded,
                    });
                    setConnecting(false);
                }
                catch {
                    if (gen !== fetchGen.current) {
                        return;
                    }
                    setError("fetch_failed");
                    setConnecting(false);
                    setSession(null);
                }
            })();
        },
        [serverUrl],
    );

    useEffect(() => {
        if (session?.token && MEETS_ROOM_NAME_RE.test(session.displayName)) {
            rememberMeetRoom(session.displayName);
        }
    }, [session]);

    useEffect(() => {
        setMicPrecheckDone(false);
    }, [session?.displayName]);

    const value = useMemo<MeetCallContextValue>(
        () => ({
            session,
            micPrecheckDone,
            setMicPrecheckDone,
            connecting,
            error,
            requestJoin,
            clearSession,
        }),
        [session, micPrecheckDone, connecting, error, requestJoin, clearSession],
    );

    return <MeetCallContext.Provider value={value}>{children}</MeetCallContext.Provider>;
}

export function useMeetCall(): MeetCallContextValue {
    const ctx = useContext(MeetCallContext);
    if (!ctx) {
        throw new Error("useMeetCall must be used within MeetCallProvider");
    }
    return ctx;
}

/** Dùng ở nav khi cần tránh throw nếu provider chưa bọc (an toàn tương lai). */
export function useMeetCallOptional(): MeetCallContextValue | null {
    return useContext(MeetCallContext);
}
