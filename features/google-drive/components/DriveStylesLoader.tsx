"use client";
import { useEffect } from "react";
export function DriveStylesLoader() {
    useEffect(() => {
        const href = "/gdrive/drive.css";
        if (document.querySelector(`link[href="${href}"]`))
            return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
        return () => {
            link.remove();
        };
    }, []);
    return null;
}
