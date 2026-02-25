"use client";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Input } from "@gd/components/ui/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getDriveFiles } from "@gd/lib/actions/drive.actions";
import Thumbnail from "@gd/components/Thumbnail";
import FormattedDateTime from "@gd/components/FormattedDateTime";
import { useDebounce } from "use-debounce";
import type { DriveFileDisplay } from "@gd/lib/google-drive";
import { getDriveThumbnailUrl, isPreviewableInApp } from "@gd/lib/utils";

const getPortalDropdownStyles = (isDark: boolean) => ({
    borderRadius: "14px",
    overflow: "hidden" as const,
    backgroundColor: isDark ? "rgb(32 33 36)" : "#fff",
    color: isDark ? "rgba(255,255,255,0.85)" : "rgb(24 24 27)",
    border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgb(229 231 235)",
    boxShadow: isDark
        ? "0 8px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)"
        : "0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)",
    ...(isDark && {
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
    }),
});

const Search = () => {
    const [query, setQuery] = useState("");
    const searchParams = useSearchParams();
    const searchQuery = searchParams.get("query") || "";
    const [results, setResults] = useState<DriveFileDisplay[]>([]);
    const [open, setOpen] = useState(false);
    const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const [isDark, setIsDark] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const path = usePathname();
    const [debouncedQuery] = useDebounce(query, 300);

    useEffect(() => {
        const root = document.documentElement;
        const setDark = () => setIsDark(root.classList.contains("dark"));
        setDark();
        const obs = new MutationObserver(setDark);
        obs.observe(root, { attributes: true, attributeFilter: ["class"] });
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (!open || !wrapperRef.current) {
            setDropdownRect(null);
            return;
        }
        const updateRect = () => {
            if (wrapperRef.current) {
                const r = wrapperRef.current.getBoundingClientRect();
                setDropdownRect({
                    top: r.bottom + 6,
                    left: r.left,
                    width: Math.max(r.width, 280),
                });
            }
        };
        updateRect();
        window.addEventListener("scroll", updateRect, true);
        window.addEventListener("resize", updateRect);
        return () => {
            window.removeEventListener("scroll", updateRect, true);
            window.removeEventListener("resize", updateRect);
        };
    }, [open, results.length]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        const onClick = (e: MouseEvent) => {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(e.target as Node) &&
                !(e.target as Element).closest?.(".search-result-portal")
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("mousedown", onClick);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("mousedown", onClick);
        };
    }, [open]);
    useEffect(() => {
        const fetchFiles = async () => {
            if (debouncedQuery.trim().length === 0) {
                setResults([]);
                setOpen(false);
                router.push(path ?? "/drive");
                return;
            }
            const res = await getDriveFiles({ types: [], searchText: debouncedQuery.trim() });
            setResults(res?.documents ?? []);
            setOpen(true);
        };
        fetchFiles();
    }, [debouncedQuery, path, router]);
    useEffect(() => {
        if (!searchQuery && query !== "") setQuery("");
    }, [searchQuery]);
    const handleOpenFile = (e: React.MouseEvent, file: DriveFileDisplay) => {
        e.stopPropagation();
        setOpen(false);
        setResults([]);
        if (isPreviewableInApp(file.mimeType)) {
            router.push(`/drive/file/${file.$id}?mime=${encodeURIComponent(file.mimeType || "")}&name=${encodeURIComponent(file.name)}&from=${encodeURIComponent(path || "/drive")}`);
        }
        else {
            window.open(file.url, "_blank");
        }
    };
    const handleGoToFolder = (e: React.MouseEvent, file: DriveFileDisplay) => {
        e.stopPropagation();
        setOpen(false);
        setResults([]);
        const parentId = file.parents?.[0] ?? "root";
        if (parentId === "root")
            router.push("/drive/folders");
        else
            router.push(`/drive/folder/${parentId}`);
    };
    const showDropdown = open && dropdownRect && typeof document !== "undefined";
    const dropdownContent = showDropdown && (
      <ul
        className={`search-result search-result-portal ${isDark ? "search-result-portal--dark" : ""}`}
        role="listbox"
        style={{
          position: "fixed",
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: dropdownRect.width,
          zIndex: 99999,
          ...getPortalDropdownStyles(isDark),
        }}
      >
        {results.length > 0
          ? results.map((file) => {
              const thumbnailUrl =
                file.thumbnailLink ||
                (file.type === "document" || file.type === "video"
                  ? getDriveThumbnailUrl(file.$id)
                  : undefined) ||
                file.url;
              return (
                <li
                  className="search-result-item flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-light-400/60"
                  key={file.$id}
                  onClick={(e) => handleOpenFile(e, file)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <Thumbnail
                      type={file.type}
                      extension={file.extension}
                      url={thumbnailUrl}
                      className="size-9 min-w-9 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="search-result-item-title subtitle-2 line-clamp-1">{file.name}</p>
                      <FormattedDateTime
                        date={file.$createdAt}
                        className="search-result-item-meta caption"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleGoToFolder(e, file)}
                    className="search-result-item-action shrink-0 rounded p-1.5 text-light-200 transition-colors hover:bg-brand/10 hover:text-brand"
                    title="Go to folder"
                  >
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </button>
                </li>
              );
            })
          : debouncedQuery.trim() && <p className="empty-result">No files found</p>}
      </ul>
    );

    return (
      <div className="search" ref={wrapperRef}>
        <div className="search-input-wrapper">
          <Image
            src="/gdrive/assets/icons/search.svg"
            alt="Search"
            width={24}
            height={24}
          />
          <Input
            value={query}
            placeholder="Search..."
            className="search-input"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setOpen(true)}
          />
        </div>
        {typeof document !== "undefined" &&
          createPortal(showDropdown ? dropdownContent : null, document.body)}
      </div>
    );
};
export default Search;
