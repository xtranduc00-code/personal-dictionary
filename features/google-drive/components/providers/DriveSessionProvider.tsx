"use client";
import { SessionProvider } from "next-auth/react";
export function DriveSessionProvider({ children, }: {
    children: React.ReactNode;
}) {
    return (<SessionProvider basePath="/api/drive-auth">{children}</SessionProvider>);
}
