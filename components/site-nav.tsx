"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "react-toastify";
import { DriveIntegrationNavBlock } from "@/components/drive-integration-nav";
import { NavAccountFooter } from "@/components/nav-account-footer";
import { ProfileModal } from "@/components/profile-modal";
import { SecurityModal } from "@/components/security-modal";
import { BookOpen, BookMarked, BookText, Bot, CalendarClock, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Cloud, FileText, FolderOpen, GraduationCap, Headphones, Image as LucideImage, History, Home, Languages, LayoutDashboard, Layers, LayoutGrid, LibraryBig, LogIn, LogOut, Mail, Menu, Mic, Moon, NotebookText, PenLine, PhoneCall, Search, Sparkles, Star, Sun, UserCircle, Video, X, type LucideIcon, } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useMeetCallOptional } from "@/lib/meet-call-context";
import { CLEAR_NAV_QUICK_SEARCH_EVENT } from "@/lib/nav-quick-search-events";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
const ieltsSkillLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: typeof Headphones;
}[] = [
    { href: "/listening", labelKey: "listen", icon: Headphones },
    { href: "/ielts-reading", labelKey: "read", icon: BookText },
    { href: "/ielts-writing", labelKey: "write", icon: PenLine },
];
const ieltsSpeakingHub = {
    href: "/ielts-speaking",
    labelKey: "speak" as TranslationKey,
    icon: Mic,
};
const ieltsAiSpeakingLink = {
    href: "/real-time-call",
    labelKey: "aiSpeakingNav" as TranslationKey,
    icon: Bot,
};
/** IELTS vocabulary notes (word + meaning sets); route `/flashcards` kept for bookmarks/API. */
const ieltsVocabNotesLink = {
    href: "/flashcards",
    labelKey: "ieltsVocabNotes" as TranslationKey,
    icon: NotebookText,
};
const studySectionLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
}[] = [
    { href: "/study-kit", labelKey: "studyKit", icon: Sparkles },
];
const scheduleSectionLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
}[] = [
    { href: "/calendar", labelKey: "calendar", icon: CalendarDays },
    { href: "/call", labelKey: "meets", icon: PhoneCall },
    { href: "/notes", labelKey: "notes", icon: FileText },
];
const portfolioSectionLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: typeof Home;
}[] = [
    { href: "/", labelKey: "portfolioHome", icon: Home },
    { href: "/profile", labelKey: "portfolioProfile", icon: UserCircle },
    { href: "/contact", labelKey: "portfolioContact", icon: Mail },
];
const othersDriveChildLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: typeof Cloud;
    dashboard?: boolean;
}[] = [
    { href: "/drive", labelKey: "navDriveDashboard", icon: LayoutGrid, dashboard: true },
    { href: "/drive/folders", labelKey: "navDriveFolders", icon: FolderOpen },
    { href: "/drive/documents", labelKey: "navDriveDocuments", icon: FileText },
    { href: "/drive/images", labelKey: "navDriveImages", icon: LucideImage },
    { href: "/drive/media", labelKey: "navDriveMedia", icon: Video },
    { href: "/drive/starred", labelKey: "navDriveStarred", icon: Star },
];
const dictionarySectionLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: typeof BookOpen;
}[] = [
    { href: "/dictionary", labelKey: "search", icon: BookOpen },
    { href: "/translate", labelKey: "translate", icon: Languages },
    { href: "/library", labelKey: "library", icon: LibraryBig },
    { href: "/history", labelKey: "history", icon: History },
];

/** Accent nav rows: clearer active + hover (aligns with Meets / product blue) */
const NAV_LINK_ROW_ACTIVE =
    "border-l-2 border-blue-600 bg-blue-50 pl-[30px] font-semibold text-[#111827] dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-50";
const NAV_LINK_ROW_IDLE =
    "border-l-2 border-transparent pl-8 font-medium text-zinc-600 hover:border-blue-200 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-sky-500/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const NAV_LINK_SUB_ACTIVE =
    "border-l-2 border-blue-600 bg-blue-50 pl-[38px] font-semibold text-[#111827] dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-50";
const NAV_LINK_SUB_IDLE =
    "border-l-2 border-transparent pl-11 font-medium text-zinc-600 hover:border-blue-200 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-sky-500/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const NAV_LINK_DRIVE_ACTIVE =
    "border-l-2 border-blue-600 bg-blue-50 pl-[42px] font-semibold text-[#111827] dark:border-sky-400 dark:bg-sky-950/50 dark:text-sky-50";
const NAV_LINK_DRIVE_IDLE =
    "border-l-2 border-transparent pl-11 font-medium text-zinc-600 hover:border-blue-200 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-sky-500/25 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
/** Meets đang trong cuộc gọi — nổi bật cả khi đang ở route khác (Calendar, …). */
const NAV_LINK_ROW_MEETS_LIVE =
    "border-l-2 border-red-500 bg-gradient-to-r from-red-50 via-orange-50/40 to-transparent pl-[30px] font-semibold text-red-950 shadow-sm ring-1 ring-red-200/60 dark:border-red-400 dark:from-red-950/55 dark:via-red-950/25 dark:to-transparent dark:text-red-50 dark:ring-red-500/25";

function isActive(pathname: string, href: string) {
    if (href === "/")
        return pathname === "/";
    if (href === "/dictionary")
        return pathname === "/dictionary";
    return pathname.startsWith(href);
}
function isPortfolioPath(pathname: string) {
    if (pathname === "/")
        return true;
    return ["/profile", "/contact"].includes(pathname);
}
function isOthersPath(pathname: string) {
    return pathname === "/drive" || pathname.startsWith("/drive/");
}
function isOthersDriveLinkActive(pathname: string, href: string, dashboard?: boolean) {
    if (dashboard || href === "/drive") {
        return pathname === "/drive" || pathname === "/drive/";
    }
    if (href === "/drive/folders") {
        return (pathname.startsWith("/drive/folders") ||
            pathname.startsWith("/drive/folder/"));
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}
function isIeltsPath(pathname: string) {
    if (pathname.startsWith("/real-time-call"))
        return true;
    if (pathname.startsWith("/flashcards"))
        return true;
    return (ieltsSkillLinks.some((link) => pathname.startsWith(link.href)) ||
        pathname.startsWith("/ielts-speaking"));
}
function isStudyPath(pathname: string) {
    return studySectionLinks.some((link) => pathname.startsWith(link.href));
}
function isSchedulePath(pathname: string) {
    return scheduleSectionLinks.some((link) => pathname.startsWith(link.href));
}
function isDictionaryPath(pathname: string) {
    return dictionarySectionLinks.some((link) => link.href === "/dictionary"
        ? pathname === "/dictionary"
        : pathname.startsWith(link.href));
}
function navSearchNormalize(s: string): string {
    try {
        return s
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLowerCase();
    }
    catch {
        return s.toLowerCase();
    }
}
/** Lọc sidebar: không phân biệt hoa thường, bỏ dấu (vi/en). */
function navMatches(label: string, queryRaw: string): boolean {
    const q = queryRaw.trim();
    if (!q)
        return true;
    return navSearchNormalize(label).includes(navSearchNormalize(q));
}
function IeltsExpandedNavLinks({ pathname, t, filterQuery = "", onLinkClick, }: {
    pathname: string;
    t: (key: TranslationKey) => string;
    filterQuery?: string;
    /** Xóa ô quick search khi đã chọn mục (kể cả khi vẫn cùng route). */
    onLinkClick?: () => void;
}) {
    const rowBase = "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200";
    const rowActive = NAV_LINK_ROW_ACTIVE;
    const rowIdle = NAV_LINK_ROW_IDLE;
    const subBase = "group flex items-center gap-3 rounded-r-xl py-2 pr-4 text-sm transition-all duration-200";
    const subActive = NAV_LINK_SUB_ACTIVE;
    const subIdle = NAV_LINK_SUB_IDLE;
    const q = filterQuery.trim();
    const ieltsHit = !q || navMatches(t("ielts"), filterQuery);
    const matchKey = (key: TranslationKey) =>
        !q || ieltsHit || navMatches(t(key), filterQuery);
    /** Sub-item of Speaking: show when AI label matches or parent Speaking matches. */
    const showAiUnderSpeaking =
        !q ||
        ieltsHit ||
        navMatches(t(ieltsAiSpeakingLink.labelKey), filterQuery) ||
        navMatches(t(ieltsSpeakingHub.labelKey), filterQuery);
    return (<>
      {ieltsSkillLinks.filter((link) => matchKey(link.labelKey)).map((link) => {
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (<Link key={link.href} href={link.href} onClick={onLinkClick} className={[rowBase, active ? rowActive : rowIdle].join(" ")}>
            <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
            <span>{t(link.labelKey)}</span>
          </Link>);
        })}
      {matchKey(ieltsSpeakingHub.labelKey) ? (() => {
            const link = ieltsSpeakingHub;
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (<Link key={link.href} href={link.href} onClick={onLinkClick} className={[rowBase, active ? rowActive : rowIdle].join(" ")}>
            <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
            <span>{t(link.labelKey)}</span>
          </Link>);
        })() : null}
      {showAiUnderSpeaking ? (() => {
            const link = ieltsAiSpeakingLink;
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (<Link key={link.href} href={link.href} onClick={onLinkClick} className={[subBase, active ? subActive : subIdle].join(" ")}>
            <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
            <span>{t(link.labelKey)}</span>
          </Link>);
        })() : null}
      {matchKey(ieltsVocabNotesLink.labelKey) ? (() => {
            const link = ieltsVocabNotesLink;
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (<Link key={link.href} href={link.href} onClick={onLinkClick} className={[rowBase, active ? rowActive : rowIdle].join(" ")}>
            <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
            <span>{t(link.labelKey)}</span>
          </Link>);
        })() : null}
    </>);
}
function OthersExpandedNavLinks({ pathname, t, filterQuery = "", onLinkClick, }: {
    pathname: string;
    t: (key: TranslationKey) => string;
    filterQuery?: string;
    onLinkClick?: () => void;
}) {
    const rowBase = "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200";
    const rowActive = NAV_LINK_ROW_ACTIVE;
    const rowIdle = NAV_LINK_ROW_IDLE;
    const driveChildActive = NAV_LINK_DRIVE_ACTIVE;
    const driveChildIdle = NAV_LINK_DRIVE_IDLE;
    const q = filterQuery.trim();
    const othersHit =
        !q ||
        navMatches(t("others"), filterQuery) ||
        navMatches(t("portfolioGoogleDrive"), filterQuery);
    const matchDriveKey = (key: TranslationKey) =>
        !q || othersHit || navMatches(t(key), filterQuery);
    const driveLinksToShow = othersDriveChildLinks.filter((link) => matchDriveKey(link.labelKey));
    const showGdriveHeader =
        !q ||
        othersHit ||
        driveLinksToShow.length > 0 ||
        navMatches(t("driveIntegrationTitle"), filterQuery);
    const showDriveIntegration =
        !q ||
        navMatches(t("driveIntegrationTitle"), filterQuery) ||
        driveLinksToShow.length > 0;
    return (<>
      {showGdriveHeader ? (<div className={`${rowBase} border-l-2 border-transparent pl-8 font-medium text-zinc-500 dark:text-zinc-400`} role="presentation">
        <Cloud className="h-4 w-4 shrink-0 opacity-70"/>
        <span>{t("portfolioGoogleDrive")}</span>
      </div>) : null}
      {driveLinksToShow.map((link) => {
            const active = isOthersDriveLinkActive(pathname, link.href, link.dashboard);
            const Icon = link.icon;
            return (<Link key={link.href} href={link.href} onClick={onLinkClick} className={[rowBase, active ? driveChildActive : driveChildIdle].join(" ")}>
            <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
            <span>{t(link.labelKey)}</span>
          </Link>);
        })}
      {showDriveIntegration ? <DriveIntegrationNavBlock onLinkClick={onLinkClick}/> : null}
    </>);
}
export function SiteNav() {
    const pathname = usePathname();
    const { t, locale, setLocale } = useI18n();
    const { user, isLoading: authLoading, signOut, openAuthModal } = useAuth();
    const [profileOpen, setProfileOpen] = useState(false);
    const [securityOpen, setSecurityOpen] = useState(false);
    const meetCall = useMeetCallOptional();
    const meetInProgress = Boolean(meetCall?.session && meetCall.micPrecheckDone);
    const [isDark, setIsDark] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [ieltsOpen, setIeltsOpen] = useState(true);
    const [studyOpen, setStudyOpen] = useState(true);
    const [scheduleOpen, setScheduleOpen] = useState(true);
    const [dictionaryOpen, setDictionaryOpen] = useState(true);
    const [portfolioOpen, setPortfolioOpen] = useState(true);
    const [othersOpen, setOthersOpen] = useState(true);
    const [navSearch, setNavSearch] = useState("");
    const clearQuickSearch = useCallback(() => setNavSearch(""), []);
    const navFilter = useMemo(() => {
        const navQ = navSearch.trim();
        const fq = navQ.length > 0;
        const match = (text: string) => navMatches(text, navQ);
        const plinks = !fq
            ? portfolioSectionLinks
            : match(t("portfolio"))
                ? portfolioSectionLinks
                : portfolioSectionLinks.filter((l) => match(t(l.labelKey)));
        const showPortfolio = !fq || match(t("portfolio")) || plinks.length > 0;
        const dlinks = !fq
            ? dictionarySectionLinks
            : match(t("navLanguageSection")) || match(t("dictionary"))
                ? dictionarySectionLinks
                : dictionarySectionLinks.filter((l) => match(t(l.labelKey)));
        const showDictionary =
            !fq || match(t("navLanguageSection")) || match(t("dictionary")) || dlinks.length > 0;
        const studyLinks = !fq
            ? studySectionLinks
            : match(t("navStudySection")) || match(t("studyKit"))
                ? studySectionLinks
                : studySectionLinks.filter((l) => match(t(l.labelKey)));
        const showStudy =
            !fq || match(t("navStudySection")) || match(t("studyKit")) || studyLinks.length > 0;
        const scheduleLinks = !fq
            ? scheduleSectionLinks
            : match(t("navScheduleSection")) || match(t("notes"))
                ? scheduleSectionLinks
                : scheduleSectionLinks.filter((l) => match(t(l.labelKey)));
        const showSchedule =
            !fq ||
            match(t("navScheduleSection")) ||
            match(t("notes")) ||
            scheduleLinks.length > 0;
        const ieltsLinksMatch = [
            ...ieltsSkillLinks,
            ieltsSpeakingHub,
            ieltsVocabNotesLink,
            ieltsAiSpeakingLink,
        ].some((l) => match(t(l.labelKey)));
        const showIelts = !fq || match(t("ielts")) || ieltsLinksMatch;
        const othersLinksMatch = othersDriveChildLinks.some((l) =>
            match(t(l.labelKey)),
        );
        const showOthers =
            !fq ||
            match(t("others")) ||
            match(t("portfolioGoogleDrive")) ||
            match(t("driveIntegrationTitle")) ||
            othersLinksMatch;
        const anyShown =
            showPortfolio ||
            showDictionary ||
            showIelts ||
            showStudy ||
            showSchedule ||
            showOthers;
        return {
            fq,
            plinks,
            dlinks,
            studyLinks,
            scheduleLinks,
            showPortfolio,
            showDictionary,
            showIelts,
            showStudy,
            showSchedule,
            showOthers,
            anyShown,
        };
    }, [navSearch, t, locale]);
    useEffect(() => {
        if (!navSearch.trim()) {
            return;
        }
        setPortfolioOpen(true);
        setDictionaryOpen(true);
        setIeltsOpen(true);
        setStudyOpen(true);
        setScheduleOpen(true);
        setOthersOpen(true);
    }, [navSearch]);
    useEffect(() => {
        const onClear = () => setNavSearch("");
        window.addEventListener(CLEAR_NAV_QUICK_SEARCH_EVENT, onClear);
        return () =>
            window.removeEventListener(CLEAR_NAV_QUICK_SEARCH_EVENT, onClear);
    }, []);
    /** Đổi trang → xóa quick search (chọn link khác section). */
    useEffect(() => {
        setNavSearch("");
    }, [pathname]);
    useEffect(() => {
        const savedTheme = window.localStorage.getItem("theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const nextIsDark = savedTheme ? savedTheme === "dark" : prefersDark;
        setIsDark(nextIsDark);
        document.documentElement.classList.toggle("dark", nextIsDark);
        document.documentElement.classList.toggle("dark-mode", nextIsDark);
    }, []);
    useEffect(() => {
        const saved = window.localStorage.getItem("sidebarOpen");
        if (saved !== null)
            setSidebarOpen(saved === "true");
    }, []);
    useEffect(() => {
        const saved = window.localStorage.getItem("ieltsSectionOpen");
        if (saved !== null)
            setIeltsOpen(saved === "true");
    }, []);
    useEffect(() => {
        const saved = window.localStorage.getItem("dictionarySectionOpen");
        if (saved !== null)
            setDictionaryOpen(saved === "true");
    }, []);
    useEffect(() => {
        const saved = window.localStorage.getItem("portfolioSectionOpen");
        if (saved !== null)
            setPortfolioOpen(saved === "true");
    }, []);
    useEffect(() => {
        const savedStudy = window.localStorage.getItem("studySectionOpen");
        const savedSchedule = window.localStorage.getItem("scheduleSectionOpen");
        const legacy = window.localStorage.getItem("studyToolsSectionOpen");
        if (savedStudy !== null) {
            setStudyOpen(savedStudy === "true");
        }
        else if (legacy !== null) {
            setStudyOpen(legacy === "true");
        }
        if (savedSchedule !== null) {
            setScheduleOpen(savedSchedule === "true");
        }
        else if (legacy !== null) {
            setScheduleOpen(legacy === "true");
        }
    }, []);
    useEffect(() => {
        const saved = window.localStorage.getItem("othersSectionOpen");
        if (saved !== null)
            setOthersOpen(saved === "true");
    }, []);
    useEffect(() => {
        if (isIeltsPath(pathname))
            setIeltsOpen(true);
    }, [pathname]);
    useEffect(() => {
        if (isStudyPath(pathname))
            setStudyOpen(true);
    }, [pathname]);
    useEffect(() => {
        if (isSchedulePath(pathname))
            setScheduleOpen(true);
    }, [pathname]);
    useEffect(() => {
        if (isDictionaryPath(pathname))
            setDictionaryOpen(true);
    }, [pathname]);
    useEffect(() => {
        if (isPortfolioPath(pathname))
            setPortfolioOpen(true);
    }, [pathname]);
    useEffect(() => {
        if (isOthersPath(pathname))
            setOthersOpen(true);
    }, [pathname]);
    function toggleIeltsSection() {
        const next = !ieltsOpen;
        setIeltsOpen(next);
        window.localStorage.setItem("ieltsSectionOpen", String(next));
    }
    function toggleStudySection() {
        const next = !studyOpen;
        setStudyOpen(next);
        window.localStorage.setItem("studySectionOpen", String(next));
    }
    function toggleScheduleSection() {
        const next = !scheduleOpen;
        setScheduleOpen(next);
        window.localStorage.setItem("scheduleSectionOpen", String(next));
    }
    function toggleDictionarySection() {
        const next = !dictionaryOpen;
        setDictionaryOpen(next);
        window.localStorage.setItem("dictionarySectionOpen", String(next));
    }
    function togglePortfolioSection() {
        const next = !portfolioOpen;
        setPortfolioOpen(next);
        window.localStorage.setItem("portfolioSectionOpen", String(next));
    }
    function toggleOthersSection() {
        const next = !othersOpen;
        setOthersOpen(next);
        window.localStorage.setItem("othersSectionOpen", String(next));
    }
    function toggleSidebar() {
        const next = !sidebarOpen;
        setSidebarOpen(next);
        window.localStorage.setItem("sidebarOpen", String(next));
    }
    function toggleTheme() {
        const next = !isDark;
        setIsDark(next);
        document.documentElement.classList.toggle("dark", next);
        document.documentElement.classList.toggle("dark-mode", next);
        window.localStorage.setItem("theme", next ? "dark" : "light");
    }
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);
    return (<>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 md:hidden">
        <button type="button" onClick={() => setMobileOpen((prev) => !prev)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" aria-label={t("ariaToggleNav")}>
          {mobileOpen ? (<X className="h-4 w-4"/>) : (<Menu className="h-4 w-4"/>)}
        </button>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {t("appTitle")}
        </p>
        <div className="flex items-center gap-1">
          {!authLoading && (user ? (<button type="button" onClick={() => {
                signOut();
                toast.success(t("toastLoggedOut"));
            }} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" aria-label={t("logOutApp")}>
                <LogOut className="h-3.5 w-3.5"/>
                {t("logOutApp")}
              </button>) : (<button type="button" onClick={() => openAuthModal()} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" aria-label={t("logIn")}>
                <LogIn className="h-3.5 w-3.5"/>
                {t("logIn")}
              </button>))}
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
            <button type="button" onClick={() => setLocale("en")} className={["rounded-l-md px-2 py-1.5 text-xs font-medium transition", locale === "en" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"].join(" ")} aria-label={t("ariaEnglish")}>
              EN
            </button>
            <button type="button" onClick={() => setLocale("vi")} className={["rounded-r-md px-2 py-1.5 text-xs font-medium transition", locale === "vi" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"].join(" ")} aria-label={t("ariaVietnamese")}>
              VN
            </button>
          </div>
          <button type="button" onClick={toggleTheme} className={[
            "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition",
            isDark
                ? "border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
        ].join(" ")} aria-label={t("ariaToggleDark")}>
            {isDark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
          </button>
        </div>
      </header>
      {mobileOpen && (<div className="fixed inset-0 z-30 md:hidden">
          <button type="button" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/30" aria-label={t("ariaCloseDrawer")}/>
          <aside className="relative z-10 flex h-full w-80 flex-col overflow-y-auto border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-6 px-2 shrink-0">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {t("appTitle")}
              </h1>
              <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-zinc-400">{t("appTaglinePrimary")}</p>
            </div>
            <div className="mb-3 shrink-0 px-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" aria-hidden/>
                <input type="search" autoComplete="off" value={navSearch} onChange={(e) => setNavSearch(e.target.value)} placeholder={t("navQuickSearchPlaceholder")} aria-label={t("navQuickSearchAria")} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500/40 dark:focus:ring-sky-500/20"/>
              </div>
            </div>
            <nav className="flex flex-1 flex-col gap-1 pb-6">
              {navFilter.fq && !navFilter.anyShown ? (<p className="px-2 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                {t("navSearchNoResults")}
              </p>) : null}
              {navFilter.showPortfolio ? (<div className="flex flex-col gap-0.5">
                <button type="button" onClick={togglePortfolioSection} className={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isPortfolioPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}>
                  <span className="flex items-center gap-3">
                    <span className={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isPortfolioPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}>
                      <LayoutDashboard className="h-5 w-5"/>
                    </span>
                    <span>{t("portfolio")}</span>
                  </span>
                  <ChevronDown className={[
                "h-5 w-5 shrink-0 transition-transform text-zinc-400",
                portfolioOpen ? "rotate-180" : "",
            ].join(" ")}/>
                </button>
                {portfolioOpen &&
                navFilter.plinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const Icon = link.icon;
                    return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")}>
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
                        <span>{t(link.labelKey)}</span>
                      </Link>);
                })}
              </div>) : null}

              {navFilter.showPortfolio && navFilter.showDictionary ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showDictionary ? (<div className="flex flex-col gap-0.5">
                <button type="button" onClick={toggleDictionarySection} className={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isDictionaryPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}>
                  <span className="flex items-center gap-3">
                    <span className={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isDictionaryPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}>
                      <BookMarked className="h-5 w-5"/>
                    </span>
                    <span>{t("navLanguageSection")}</span>
                  </span>
                  <ChevronDown className={[
                "h-5 w-5 shrink-0 transition-transform text-zinc-400",
                dictionaryOpen ? "rotate-180" : "",
            ].join(" ")}/>
                </button>
                {dictionaryOpen &&
                navFilter.dlinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const Icon = link.icon;
                    return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")}>
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
                        <span>{t(link.labelKey)}</span>
                      </Link>);
                })}
              </div>) : null}

              {navFilter.showDictionary && navFilter.showIelts ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showIelts ? (<div className="flex flex-col gap-0.5">
                <button type="button" onClick={toggleIeltsSection} className={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isIeltsPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}>
                  <span className="flex items-center gap-3">
                    <span className={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isIeltsPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}>
                      <BookOpen className="h-5 w-5"/>
                    </span>
                    <span>{t("ielts")}</span>
                  </span>
                  <ChevronDown className={[
                "h-5 w-5 shrink-0 transition-transform text-zinc-400",
                ieltsOpen ? "rotate-180" : "",
            ].join(" ")}/>
                </button>
                {ieltsOpen && (<IeltsExpandedNavLinks pathname={pathname} t={t} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
              </div>) : null}

              {navFilter.showIelts && navFilter.showStudy ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showStudy ? (<div className="flex flex-col gap-0.5">
                <button type="button" onClick={toggleStudySection} className={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isStudyPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}>
                  <span className="flex items-center gap-3">
                    <span className={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isStudyPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}>
                      <GraduationCap className="h-5 w-5"/>
                    </span>
                    <span>{t("navStudySection")}</span>
                  </span>
                  <ChevronDown className={[
                "h-5 w-5 shrink-0 transition-transform text-zinc-400",
                studyOpen ? "rotate-180" : "",
            ].join(" ")}/>
                </button>
                {studyOpen &&
                navFilter.studyLinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const Icon = link.icon;
                    return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")}>
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
                        <span>{t(link.labelKey)}</span>
                      </Link>);
                })}
              </div>) : null}

              {navFilter.showStudy && navFilter.showSchedule ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showSchedule ? (<div className="flex flex-col gap-0.5">
                <button type="button" onClick={toggleScheduleSection} className={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isSchedulePath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}>
                  <span className="flex items-center gap-3">
                    <span className={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isSchedulePath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}>
                      <CalendarClock className="h-5 w-5"/>
                    </span>
                    <span>{t("navScheduleSection")}</span>
                  </span>
                  <ChevronDown className={[
                "h-5 w-5 shrink-0 transition-transform text-zinc-400",
                scheduleOpen ? "rotate-180" : "",
            ].join(" ")}/>
                </button>
                {scheduleOpen &&
                navFilter.scheduleLinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const meetsLive = link.href === "/call" && meetInProgress;
                    const Icon = link.icon;
                    return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            meetsLive ? NAV_LINK_ROW_MEETS_LIVE : active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")}>
                        <Icon className={`h-4 w-4 shrink-0 ${active || meetsLive ? "opacity-90" : "opacity-70"}`}/>
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          {t(link.labelKey)}
                          {meetsLive ? (<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-red-400/50 dark:bg-red-500 dark:ring-red-300/40" title={t("meetsCallInProgress")}>
                                <span className="leading-none" aria-hidden>🔴</span>
                                {t("meetsLiveBadge")}
                              </span>) : null}
                        </span>
                      </Link>);
                })}
              </div>) : null}

              {navFilter.showSchedule && navFilter.showOthers ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showOthers ? (<div className="flex flex-col gap-0.5">
                <button type="button" onClick={toggleOthersSection} className={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isOthersPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}>
                  <span className="flex items-center gap-3">
                    <span className={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isOthersPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}>
                      <Cloud className="h-5 w-5"/>
                    </span>
                    <span>{t("others")}</span>
                  </span>
                  <ChevronDown className={[
                "h-5 w-5 shrink-0 transition-transform text-zinc-400",
                othersOpen ? "rotate-180" : "",
            ].join(" ")}/>
                </button>
                {othersOpen && (<OthersExpandedNavLinks pathname={pathname} t={t} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
              </div>) : null}
            </nav>
            <NavAccountFooter variant="drawer" onOpenProfile={() => setProfileOpen(true)} onOpenSecurity={() => setSecurityOpen(true)}/>
          </aside>
        </div>)}
      
      {!sidebarOpen && (<button type="button" onClick={toggleSidebar} className="hidden fixed left-0 top-1/2 z-50 -translate-y-1/2 flex h-12 w-6 items-center justify-center rounded-r-lg border border-l-0 border-zinc-200 bg-zinc-100 text-zinc-600 shadow-sm transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 md:flex" aria-label={t("ariaOpenSidebar")}>
          <ChevronRight className="h-4 w-4"/>
        </button>)}
      <aside className={[
            "hidden h-screen shrink-0 border-r border-zinc-200/70 bg-zinc-50/80 backdrop-blur-xl transition-[width] duration-200 dark:border-zinc-800 dark:bg-zinc-900/80 md:flex md:overflow-y-auto",
            sidebarOpen ? "w-80" : "w-0 overflow-hidden border-r-0",
        ].join(" ")}>
        <div className="relative flex min-h-0 w-full flex-1 flex-col px-4 py-5">
          {sidebarOpen && (<button type="button" onClick={toggleSidebar} className="absolute -right-3 top-1/2 z-10 flex h-10 w-6 shrink-0 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-zinc-200 bg-zinc-100 text-zinc-600 shadow-sm transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700" aria-label={t("ariaCloseSidebar")}>
              <ChevronLeft className="h-4 w-4"/>
            </button>)}
          <div className="mb-8 px-3">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {t("appTitle")}
              </h1>
              <button type="button" onClick={toggleTheme} className={[
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
            isDark
                ? "border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
        ].join(" ")} aria-label={t("ariaToggleDark")}>
                {isDark ? (<Sun className="h-4 w-4"/>) : (<Moon className="h-4 w-4"/>)}
              </button>
            </div>
            <p className="mt-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300">{t("appTaglinePrimary")}</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex shrink-0 rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                <button type="button" onClick={() => setLocale("en")} className={["rounded-md px-2.5 py-1.5 text-xs font-medium transition", locale === "en" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"].join(" ")} aria-label={t("ariaEnglish")}>
                  EN
                </button>
                <button type="button" onClick={() => setLocale("vi")} className={["rounded-md px-2.5 py-1.5 text-xs font-medium transition", locale === "vi" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"].join(" ")} aria-label={t("ariaVietnamese")}>
                  VN
                </button>
              </div>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" aria-hidden />
                <input type="search" autoComplete="off" value={navSearch} onChange={(e) => setNavSearch(e.target.value)} placeholder={t("navQuickSearchPlaceholder")} aria-label={t("navQuickSearchAria")} className="h-8 w-full rounded-lg border border-zinc-200 bg-white py-1 pl-8 pr-2 text-xs text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500/40 dark:focus:ring-sky-500/20" />
              </div>
            </div>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {navFilter.fq && !navFilter.anyShown ? (<p className="px-3 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t("navSearchNoResults")}
            </p>) : null}
            {navFilter.showPortfolio ? (<div className="flex shrink-0 flex-col gap-0.5">
              <button type="button" onClick={togglePortfolioSection} className={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isPortfolioPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")}>
                <span className="flex items-center gap-3">
                  <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isPortfolioPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}>
                    <LayoutDashboard className="h-5 w-5"/>
                  </span>
                  <span>{t("portfolio")}</span>
                </span>
                <ChevronDown className={[
            "h-5 w-5 shrink-0 transition-transform text-zinc-400",
            portfolioOpen ? "rotate-180" : "",
        ].join(" ")}/>
              </button>
              {portfolioOpen &&
            navFilter.plinks.map((link) => {
                const active = isActive(pathname, link.href);
                const Icon = link.icon;
                return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")}>
                      <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
                      <span>{t(link.labelKey)}</span>
                    </Link>);
            })}
            </div>) : null}

            {navFilter.showPortfolio && navFilter.showDictionary ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showDictionary ? (<div className="flex shrink-0 flex-col gap-0.5">
              <button type="button" onClick={toggleDictionarySection} className={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isDictionaryPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")}>
                <span className="flex items-center gap-3">
                  <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isDictionaryPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}>
                    <BookMarked className="h-5 w-5"/>
                  </span>
                  <span>{t("navLanguageSection")}</span>
                </span>
                <ChevronDown className={[
            "h-5 w-5 shrink-0 transition-transform text-zinc-400",
            dictionaryOpen ? "rotate-180" : "",
        ].join(" ")}/>
              </button>
              {dictionaryOpen &&
            navFilter.dlinks.map((link) => {
                const active = isActive(pathname, link.href);
                const Icon = link.icon;
                return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")}>
                      <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
                      <span>{t(link.labelKey)}</span>
                    </Link>);
            })}
            </div>) : null}

            {navFilter.showDictionary && navFilter.showIelts ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showIelts ? (<div className="flex shrink-0 flex-col gap-0.5">
              <button type="button" onClick={toggleIeltsSection} className={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isIeltsPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")}>
                <span className="flex items-center gap-3">
                  <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isIeltsPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}>
                    <BookOpen className="h-5 w-5"/>
                  </span>
                  <span>{t("ielts")}</span>
                </span>
                <ChevronDown className={[
            "h-5 w-5 shrink-0 transition-transform text-zinc-400",
            ieltsOpen ? "rotate-180" : "",
        ].join(" ")}/>
              </button>
              {ieltsOpen && (<IeltsExpandedNavLinks pathname={pathname} t={t} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
            </div>) : null}

            {navFilter.showIelts && navFilter.showStudy ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showStudy ? (<div className="flex shrink-0 flex-col gap-0.5">
              <button type="button" onClick={toggleStudySection} className={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isStudyPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")}>
                <span className="flex items-center gap-3">
                  <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isStudyPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}>
                    <GraduationCap className="h-5 w-5"/>
                  </span>
                  <span>{t("navStudySection")}</span>
                </span>
                <ChevronDown className={[
            "h-5 w-5 shrink-0 transition-transform text-zinc-400",
            studyOpen ? "rotate-180" : "",
        ].join(" ")}/>
              </button>
              {studyOpen &&
            navFilter.studyLinks.map((link) => {
                const active = isActive(pathname, link.href);
                const Icon = link.icon;
                return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")}>
                      <Icon className={`h-4 w-4 shrink-0 ${active ? "opacity-90" : "opacity-70"}`}/>
                      <span>{t(link.labelKey)}</span>
                    </Link>);
            })}
            </div>) : null}

            {navFilter.showStudy && navFilter.showSchedule ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showSchedule ? (<div className="flex shrink-0 flex-col gap-0.5">
              <button type="button" onClick={toggleScheduleSection} className={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isSchedulePath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")}>
                <span className="flex items-center gap-3">
                  <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isSchedulePath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}>
                    <CalendarClock className="h-5 w-5"/>
                  </span>
                  <span>{t("navScheduleSection")}</span>
                </span>
                <ChevronDown className={[
            "h-5 w-5 shrink-0 transition-transform text-zinc-400",
            scheduleOpen ? "rotate-180" : "",
        ].join(" ")}/>
              </button>
              {scheduleOpen &&
            navFilter.scheduleLinks.map((link) => {
                const active = isActive(pathname, link.href);
                const meetsLive = link.href === "/call" && meetInProgress;
                const Icon = link.icon;
                return (<Link key={link.href} href={link.href} onClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        meetsLive ? NAV_LINK_ROW_MEETS_LIVE : active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")}>
                      <Icon className={`h-4 w-4 shrink-0 ${active || meetsLive ? "opacity-90" : "opacity-70"}`}/>
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        {t(link.labelKey)}
                        {meetsLive ? (<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-red-400/50 dark:bg-red-500 dark:ring-red-300/40" title={t("meetsCallInProgress")}>
                                <span className="leading-none" aria-hidden>🔴</span>
                                {t("meetsLiveBadge")}
                              </span>) : null}
                      </span>
                    </Link>);
            })}
            </div>) : null}

            {navFilter.showSchedule && navFilter.showOthers ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showOthers ? (<div className="flex shrink-0 flex-col gap-0.5">
              <button type="button" onClick={toggleOthersSection} className={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isOthersPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")}>
                <span className="flex items-center gap-3">
                  <span className={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isOthersPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}>
                    <Cloud className="h-5 w-5"/>
                  </span>
                  <span>{t("others")}</span>
                </span>
                <ChevronDown className={[
            "h-5 w-5 shrink-0 transition-transform text-zinc-400",
            othersOpen ? "rotate-180" : "",
        ].join(" ")}/>
              </button>
              {othersOpen && (<OthersExpandedNavLinks pathname={pathname} t={t} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
            </div>) : null}
            </nav>

            <NavAccountFooter variant="sidebar" onOpenProfile={() => setProfileOpen(true)} onOpenSecurity={() => setSecurityOpen(true)}/>
          </div>
      </aside>
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)}/>
      <SecurityModal open={securityOpen} onClose={() => setSecurityOpen(false)}/>
    </>);
}
