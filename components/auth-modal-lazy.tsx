"use client";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("@/components/auth-modal").then((m) => ({ default: m.AuthModal })), { ssr: false });
export function AuthModalLazy() {
    return <AuthModal />;
}
