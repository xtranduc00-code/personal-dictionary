"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "react-toastify";
import { DriveIntegrationNavBlock } from "@/components/drive-integration-nav";
import {
    NavLabelsProvider,
    NavSectionEditableTitle,
    NavSectionHeader,
    NavSidebarRow,
    useNavLabels,
} from "@/components/nav-sidebar-custom-labels";
import { NavAccountFooter } from "@/components/nav-account-footer";
import { ProfileModal } from "@/components/profile-modal";
import { SecurityModal } from "@/components/security-modal";
import { BookHeart, BookOpen, BookMarked, BookText, Bot, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clapperboard, Cloud, FileText, FolderOpen, GraduationCap, Headphones, Image as LucideImage, History, Home, Languages, LayoutDashboard, Layers, LayoutGrid, LibraryBig, LogIn, LogOut, Mail, Menu, Mic, Moon, Newspaper, NotebookText, PartyPopper, PenLine, PhoneCall, Search, Sparkles, Star, Sun, Table2, UserCircle, Video, X, type LucideIcon, } from "lucide-react";
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
const studyNavEntries: {
    href: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
    sub: boolean;
}[] = [
    { href: "/study-kit", labelKey: "studyKit", icon: Sparkles, sub: false },
    { href: "/study-kit/history", labelKey: "studyKitSessionHistory", icon: History, sub: true },
    { href: "/study-kit/saved", labelKey: "studyKitSavedFolder", icon: FolderOpen, sub: false },
];
type NewsSourceLink = {
    href: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
    dailyNewsSource: "engoo" | "guardian";
};
const newsSectionLinks: NewsSourceLink[] = [
    {
        href: "/",
        labelKey: "dailyNewsSourceEngoo",
        icon: Newspaper,
        dailyNewsSource: "engoo",
    },
    {
        href: "/?src=guardian",
        labelKey: "dailyNewsSourceGuardian",
        icon: Newspaper,
        dailyNewsSource: "guardian",
    },
];
const entertainmentSectionLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
}[] = [
    { href: "/watch", labelKey: "watchTogetherNav", icon: Clapperboard },
    { href: "/notes/diary", labelKey: "notesDiary", icon: BookHeart },
];
const scheduleSectionLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
}[] = [
    { href: "/calendar", labelKey: "calendar", icon: CalendarDays },
    { href: "/study-schedule", labelKey: "studySchedule", icon: Table2 },
    { href: "/call", labelKey: "meets", icon: PhoneCall },
    { href: "/notes", labelKey: "notes", icon: FileText },
];
const portfolioSectionLinks: {
    href: string;
    labelKey: TranslationKey;
    icon: typeof Home;
}[] = [
    { href: "/portfolio", labelKey: "portfolioHome", icon: Home },
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

/** Same row geometry as top-level nav links (e.g. Watch together); keeps “News” label from looking like a tiny sub-caption. */
function EntertainmentNewsGroupTitle({ label }: { label: string }) {
    return (<div className="flex items-center gap-3 rounded-r-xl border-l-2 border-transparent py-2.5 pl-8 pr-4 text-base font-medium text-zinc-700 dark:text-zinc-300" role="presentation">
      <Newspaper className="h-4 w-4 shrink-0 opacity-70" aria-hidden/>
      <span>{label}</span>
    </div>);
}

function isActive(pathname: string, href: string) {
    if (href === "/")
        return (pathname === "/" ||
            pathname === "/news" ||
            pathname.startsWith("/news/") ||
            pathname.startsWith("/articles/") ||
            pathname.startsWith("/reading/"));
    if (href === "/dictionary")
        return pathname === "/dictionary";
    /** `/study-kit` is not active on `/study-kit/saved` or `/study-kit/result`. */
    if (href === "/study-kit")
        return pathname === "/study-kit" || pathname === "/study-kit/";
    /** Diary is a separate route; `/notes` should not stay highlighted there. */
    if (href === "/notes")
        return pathname === "/notes";
    return pathname.startsWith(href);
}
function isPortfolioPath(pathname: string) {
    if (pathname === "/portfolio")
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
    return pathname.startsWith("/study-kit");
}
function isNewsPath(pathname: string) {
    if (pathname === "/" ||
        pathname === "/news" ||
        pathname.startsWith("/news/") ||
        pathname.startsWith("/articles/") ||
        pathname.startsWith("/reading/"))
        return true;
    return false;
}
function isEntertainmentPath(pathname: string) {
    return (
        pathname === "/watch" ||
        pathname.startsWith("/watch/") ||
        pathname === "/notes/diary" ||
        pathname.startsWith("/notes/diary/")
    );
}
/** Entertainment section active when on Daily News routes or Watch together. */
function isEntertainmentSidebarActive(pathname: string) {
    return isNewsPath(pathname) || isEntertainmentPath(pathname);
}
/** Sidebar: Engoo daily hub + lesson/article paths (not Guardian hub / in-app readers). */
function isEngooDailyNewsNavActive(pathname: string, src: string | null): boolean {
    if (pathname.startsWith("/reading/") || pathname.startsWith("/articles/"))
        return true;
    if (pathname.startsWith("/news/football") || pathname.startsWith("/news/guardian"))
        return false;
    if (pathname.startsWith("/news/"))
        return true;
    if (pathname === "/" || pathname === "/news")
        return src !== "guardian";
    return false;
}
function isGuardianDailyNewsNavActive(pathname: string, src: string | null): boolean {
    if (pathname.startsWith("/news/football") || pathname.startsWith("/news/guardian"))
        return true;
    if (pathname === "/" || pathname === "/news")
        return src === "guardian";
    return false;
}
function isSchedulePath(pathname: string) {
    return scheduleSectionLinks.some((link) => {
        if (link.href === "/notes") {
            return pathname === "/notes";
        }
        return pathname === link.href || pathname.startsWith(`${link.href}/`);
    });
}
function isDictionaryPath(pathname: string) {
    return dictionarySectionLinks.some((link) => {
        if (link.href === "/dictionary")
            return pathname === "/dictionary";
        return pathname.startsWith(link.href);
    });
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
            return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={onLinkClick} className={[rowBase, active ? rowActive : rowIdle].join(" ")} active={active} icon={Icon}/>);
        })}
      {matchKey(ieltsSpeakingHub.labelKey) ? (() => {
            const link = ieltsSpeakingHub;
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={onLinkClick} className={[rowBase, active ? rowActive : rowIdle].join(" ")} active={active} icon={Icon}/>);
        })() : null}
      {showAiUnderSpeaking ? (() => {
            const link = ieltsAiSpeakingLink;
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={onLinkClick} className={[subBase, active ? subActive : subIdle].join(" ")} active={active} sub icon={Icon}/>);
        })() : null}
      {matchKey(ieltsVocabNotesLink.labelKey) ? (() => {
            const link = ieltsVocabNotesLink;
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={onLinkClick} className={[rowBase, active ? rowActive : rowIdle].join(" ")} active={active} icon={Icon}/>);
        })() : null}
    </>);
}
function NewsSourceExpandedNavLinks({ pathname, t, filterQuery = "", onLinkClick, links, dailyNewsSrc, }: {
    pathname: string;
    t: (key: TranslationKey) => string;
    filterQuery?: string;
    onLinkClick?: () => void;
    links: NewsSourceLink[];
    /** `null` during Suspense fallback — treat hub as Engoo for highlight. */
    dailyNewsSrc: string | null;
}) {
    const subBase = "group flex items-center gap-3 rounded-r-xl py-2 pr-4 text-sm transition-all duration-200";
    const subActive = NAV_LINK_SUB_ACTIVE;
    const subIdle = NAV_LINK_SUB_IDLE;
    const fq = filterQuery.trim();
    const entHit = !fq || navMatches(t("navEntertainmentSection"), filterQuery);
    const newsHit = !fq || navMatches(t("navNewsSection"), filterQuery);
    const matchKey = (key: TranslationKey) =>
        !fq || entHit || newsHit || navMatches(t(key), filterQuery);
    return (<>
      {links.filter((e) => matchKey(e.labelKey)).map((e) => {
            const active = e.dailyNewsSource === "engoo"
                ? isEngooDailyNewsNavActive(pathname, dailyNewsSrc)
                : isGuardianDailyNewsNavActive(pathname, dailyNewsSrc);
            const Icon = e.icon;
            return (<NavSidebarRow key={e.href} href={e.href} labelKey={e.labelKey} onLinkClick={onLinkClick} className={[subBase, active ? subActive : subIdle].join(" ")} active={active} sub icon={Icon}/>);
        })}
    </>);
}
function NewsSourceNavSearchParamsBridge({ pathname, t, filterQuery, onLinkClick, links, }: {
    pathname: string;
    t: (key: TranslationKey) => string;
    filterQuery?: string;
    onLinkClick?: () => void;
    links: NewsSourceLink[];
}) {
    const searchParams = useSearchParams();
    const dailyNewsSrc = searchParams.get("src");
    return (<NewsSourceExpandedNavLinks pathname={pathname} t={t} filterQuery={filterQuery} onLinkClick={onLinkClick} links={links} dailyNewsSrc={dailyNewsSrc}/>);
}
function StudyExpandedNavLinks({ pathname, t, filterQuery = "", onLinkClick, links, }: {
    pathname: string;
    t: (key: TranslationKey) => string;
    filterQuery?: string;
    onLinkClick?: () => void;
    links: typeof studyNavEntries;
}) {
    const rowBase = "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200";
    const subBase = "group flex items-center gap-3 rounded-r-xl py-2 pr-4 text-sm transition-all duration-200";
    const rowActive = NAV_LINK_ROW_ACTIVE;
    const rowIdle = NAV_LINK_ROW_IDLE;
    const subActive = NAV_LINK_SUB_ACTIVE;
    const subIdle = NAV_LINK_SUB_IDLE;
    const fq = filterQuery.trim();
    const studyHit = !fq || navMatches(t("navStudySection"), filterQuery);
    const matchKey = (key: TranslationKey) =>
        !fq || studyHit || navMatches(t(key), filterQuery);
    return (<>
      {links.filter((e) => matchKey(e.labelKey)).map((e) => {
            const active = isActive(pathname, e.href);
            const Icon = e.icon;
            const base = e.sub ? subBase : rowBase;
            const act = e.sub ? subActive : rowActive;
            const idl = e.sub ? subIdle : rowIdle;
            return (<NavSidebarRow key={e.href} href={e.href} labelKey={e.labelKey} onLinkClick={onLinkClick} className={[base, active ? act : idl].join(" ")} active={active} sub={e.sub} icon={Icon}/>);
        })}
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
        <NavSectionEditableTitle labelKey="portfolioGoogleDrive" className="text-base font-medium text-zinc-500 dark:text-zinc-400"/>
      </div>) : null}
      {driveLinksToShow.map((link) => {
            const active = isOthersDriveLinkActive(pathname, link.href, link.dashboard);
            const Icon = link.icon;
            return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={onLinkClick} className={[rowBase, active ? driveChildActive : driveChildIdle].join(" ")} active={active} icon={Icon}/>);
        })}
      {showDriveIntegration ? <DriveIntegrationNavBlock onLinkClick={onLinkClick}/> : null}
    </>);
}
export function SiteNav() {
    return (<NavLabelsProvider>
      <SiteNavInner />
    </NavLabelsProvider>);
}
function SiteNavInner() {
    const pathname = usePathname();
    const { t, locale, setLocale } = useI18n();
    const { navT } = useNavLabels();
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
    const [entertainmentOpen, setEntertainmentOpen] = useState(true);
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
            : match(navT("portfolio"))
                ? portfolioSectionLinks
                : portfolioSectionLinks.filter((l) => match(navT(l.labelKey)));
        const showPortfolio = !fq || match(navT("portfolio")) || plinks.length > 0;
        const dlinks = !fq
            ? dictionarySectionLinks
            : match(navT("navLanguageSection")) || match(navT("dictionary"))
                ? dictionarySectionLinks
                : dictionarySectionLinks.filter((l) => match(navT(l.labelKey)));
        const showDictionary =
            !fq || match(navT("navLanguageSection")) || match(navT("dictionary")) || dlinks.length > 0;
        const studyLinks = !fq
            ? studyNavEntries
            : match(navT("navStudySection")) ||
                match(navT("studyKit")) ||
                match(navT("studyKitSessionHistory")) ||
                match(navT("studyKitSavedFolder"))
              ? studyNavEntries
              : studyNavEntries.filter((l) => match(navT(l.labelKey)));
        const showStudy =
            !fq ||
            match(navT("navStudySection")) ||
            match(navT("studyKit")) ||
            match(navT("studyKitSessionHistory")) ||
            match(navT("studyKitSavedFolder")) ||
            studyLinks.length > 0;
        const newsSearchHit =
            match(navT("navNewsSection")) ||
            match(navT("dailyNewsSourceEngoo")) ||
            match(navT("dailyNewsSourceGuardian")) ||
            match(navT("articleHomeNav")) ||
            navMatches("engoo", navQ) ||
            navMatches("guardian", navQ) ||
            navMatches("daily news", navQ) ||
            navMatches("bài đọc", navQ) ||
            navMatches("doc bai", navQ) ||
            navMatches("tin tức", navQ) ||
            navMatches("tin tuc", navQ);
        const watchSearchHit =
            match(navT("watchTogetherNav")) ||
            navMatches("watch together", navQ) ||
            navMatches("xem chung", navQ);
        const entertainmentSectionHit =
            match(navT("navEntertainmentSection")) ||
            match(navT("notesDiary")) ||
            navMatches("giai tri", navQ) ||
            navMatches("giải trí", navQ) ||
            navMatches("article", navQ) ||
            navMatches("articles", navQ);
        const entertainmentFqMatch =
            entertainmentSectionHit || newsSearchHit || watchSearchHit;
        const newsLinksFiltered =
            !fq || newsSearchHit || entertainmentSectionHit
                ? newsSectionLinks
                : newsSectionLinks.filter((l) => match(navT(l.labelKey)));
        const watchLinksFiltered =
            !fq || watchSearchHit || entertainmentSectionHit
                ? entertainmentSectionLinks
                : entertainmentSectionLinks.filter((l) => match(navT(l.labelKey)));
        const showEntertainment =
            !fq ||
            entertainmentFqMatch ||
            newsLinksFiltered.length > 0 ||
            watchLinksFiltered.length > 0;
        const scheduleLinks = !fq
            ? scheduleSectionLinks
            : match(navT("navScheduleSection")) || match(navT("notes"))
              ? scheduleSectionLinks
              : scheduleSectionLinks.filter((l) => match(navT(l.labelKey)));
        const showSchedule =
            !fq ||
            match(navT("navScheduleSection")) ||
            match(navT("notes")) ||
            scheduleLinks.length > 0;
        const ieltsLinksMatch = [
            ...ieltsSkillLinks,
            ieltsSpeakingHub,
            ieltsVocabNotesLink,
            ieltsAiSpeakingLink,
        ].some((l) => match(navT(l.labelKey)));
        const showIelts = !fq || match(navT("ielts")) || ieltsLinksMatch;
        const othersLinksMatch = othersDriveChildLinks.some((l) =>
            match(navT(l.labelKey)),
        );
        const showOthers =
            !fq ||
            match(navT("others")) ||
            match(navT("portfolioGoogleDrive")) ||
            match(t("driveIntegrationTitle")) ||
            othersLinksMatch;
        const anyShown =
            showPortfolio ||
            showDictionary ||
            showIelts ||
            showStudy ||
            showEntertainment ||
            showSchedule ||
            showOthers;
        return {
            fq,
            plinks,
            dlinks,
            studyLinks,
            newsLinksFiltered,
            watchLinksFiltered,
            scheduleLinks,
            showPortfolio,
            showDictionary,
            showIelts,
            showStudy,
            showEntertainment,
            showSchedule,
            showOthers,
            anyShown,
        };
    }, [navSearch, navT, t, locale]);
    useEffect(() => {
        if (!navSearch.trim()) {
            return;
        }
        setPortfolioOpen(true);
        setDictionaryOpen(true);
        setIeltsOpen(true);
        setStudyOpen(true);
        setEntertainmentOpen(true);
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
        const savedEntertainment = window.localStorage.getItem("entertainmentSectionOpen");
        if (savedEntertainment !== null)
            setEntertainmentOpen(savedEntertainment === "true");
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
        if (isEntertainmentSidebarActive(pathname))
            setEntertainmentOpen(true);
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
    function toggleEntertainmentSection() {
        const next = !entertainmentOpen;
        setEntertainmentOpen(next);
        window.localStorage.setItem("entertainmentSectionOpen", String(next));
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
                <NavSectionHeader isOpen={portfolioOpen} onToggle={togglePortfolioSection} icon={LayoutDashboard} labelKey="portfolio" outerClass={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isPortfolioPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")} iconBoxClass={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isPortfolioPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}/>
                {portfolioOpen &&
                navFilter.plinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const Icon = link.icon;
                    return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")} active={active} icon={Icon}/>);
                })}
              </div>) : null}

              {navFilter.showPortfolio && navFilter.showDictionary ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showDictionary ? (<div className="flex flex-col gap-0.5">
                <NavSectionHeader isOpen={dictionaryOpen} onToggle={toggleDictionarySection} icon={BookMarked} labelKey="navLanguageSection" outerClass={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isDictionaryPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")} iconBoxClass={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isDictionaryPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}/>
                {dictionaryOpen &&
                navFilter.dlinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const Icon = link.icon;
                    return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")} active={active} icon={Icon}/>);
                })}
              </div>) : null}

              {navFilter.showDictionary && navFilter.showIelts ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showIelts ? (<div className="flex flex-col gap-0.5">
                <NavSectionHeader isOpen={ieltsOpen} onToggle={toggleIeltsSection} icon={BookOpen} labelKey="ielts" outerClass={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isIeltsPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")} iconBoxClass={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isIeltsPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}/>
                {ieltsOpen && (<IeltsExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
              </div>) : null}

              {navFilter.showIelts && navFilter.showStudy ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showStudy ? (<div className="flex flex-col gap-0.5">
                <NavSectionHeader isOpen={studyOpen} onToggle={toggleStudySection} icon={GraduationCap} labelKey="navStudySection" outerClass={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isStudyPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")} iconBoxClass={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isStudyPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}/>
                {studyOpen && (<StudyExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch} links={navFilter.studyLinks}/>)}
              </div>) : null}

              {navFilter.showStudy && navFilter.showEntertainment ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showEntertainment ? (<div className="flex flex-col gap-0.5">
                <NavSectionHeader isOpen={entertainmentOpen} onToggle={toggleEntertainmentSection} icon={PartyPopper} labelKey="navEntertainmentSection" outerClass={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isEntertainmentSidebarActive(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")} iconBoxClass={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isEntertainmentSidebarActive(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}/>
                {entertainmentOpen && (<>
                  {navFilter.newsLinksFiltered.length > 0 ? (<>
                    <EntertainmentNewsGroupTitle label={navT("navNewsSection")}/>
                    <Suspense fallback={<NewsSourceExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch} links={navFilter.newsLinksFiltered} dailyNewsSrc={null}/>}>
                      <NewsSourceNavSearchParamsBridge pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch} links={navFilter.newsLinksFiltered}/>
                    </Suspense>
                  </>) : null}
                  {navFilter.watchLinksFiltered.map((link) => {
                    const active = isActive(pathname, link.href);
                    const Icon = link.icon;
                    return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")} active={active} icon={Icon}/>);
                })}
                </>)}
              </div>) : null}

              {navFilter.showEntertainment && navFilter.showSchedule ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showSchedule ? (<div className="flex flex-col gap-0.5">
                <NavSectionHeader isOpen={scheduleOpen} onToggle={toggleScheduleSection} icon={CalendarClock} labelKey="navScheduleSection" outerClass={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isSchedulePath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")} iconBoxClass={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isSchedulePath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}/>
                {scheduleOpen &&
                navFilter.scheduleLinks.map((link) => {
                    const active = isActive(pathname, link.href);
                    const meetsLive = link.href === "/call" && meetInProgress;
                    const Icon = link.icon;
                    return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                            "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                            meetsLive ? NAV_LINK_ROW_MEETS_LIVE : active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                        ].join(" ")} active={active} meetsLive={meetsLive} icon={Icon} badge={meetsLive ? (<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-red-400/50 dark:bg-red-500 dark:ring-red-300/40" title={t("meetsCallInProgress")}>
                                <span className="leading-none" aria-hidden>🔴</span>
                                {t("meetsLiveBadge")}
                              </span>) : undefined}/>);
                })}
              </div>) : null}

              {navFilter.showSchedule && navFilter.showOthers ? (<div className="my-2 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

              {navFilter.showOthers ? (<div className="flex flex-col gap-0.5">
                <NavSectionHeader isOpen={othersOpen} onToggle={toggleOthersSection} icon={Cloud} labelKey="others" outerClass={[
                "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
                isOthersPath(pathname)
                    ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                    : "text-zinc-500 hover:bg-blue-50/90 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")} iconBoxClass={[
                "flex h-10 w-10 items-center justify-center rounded-xl transition",
                isOthersPath(pathname)
                    ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
            ].join(" ")}/>
                {othersOpen && (<OthersExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
              </div>) : null}
            </nav>
            <NavAccountFooter variant="drawer" onOpenProfile={() => setProfileOpen(true)} onOpenSecurity={() => setSecurityOpen(true)}/>
          </aside>
        </div>)}
      
      {!sidebarOpen && (<button type="button" onClick={toggleSidebar} className="hidden fixed left-0 top-1/2 z-50 -translate-y-1/2 flex h-12 w-6 items-center justify-center rounded-r-lg border border-l-0 border-zinc-200 bg-zinc-100 text-zinc-600 shadow-sm transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 md:flex" aria-label={t("ariaOpenSidebar")}>
          <ChevronRight className="h-4 w-4"/>
        </button>)}
      <aside className={[
            "hidden h-screen shrink-0 border-r border-zinc-200/70 bg-zinc-50/80 backdrop-blur-xl transition-[width] duration-200 dark:border-zinc-800 dark:bg-zinc-900/80 md:flex md:flex-col md:overflow-hidden",
            sidebarOpen ? "w-80" : "w-0 overflow-hidden border-r-0",
        ].join(" ")}>
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-5">
          {sidebarOpen && (<button type="button" onClick={toggleSidebar} className="absolute right-1 top-7 z-10 flex h-9 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-600 shadow-sm transition hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700" aria-label={t("ariaCloseSidebar")}>
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
              <NavSectionHeader isOpen={portfolioOpen} onToggle={togglePortfolioSection} icon={LayoutDashboard} labelKey="portfolio" outerClass={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isPortfolioPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")} iconBoxClass={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isPortfolioPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}/>
              {portfolioOpen &&
            navFilter.plinks.map((link) => {
                const active = isActive(pathname, link.href);
                const Icon = link.icon;
                return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")} active={active} icon={Icon}/>);
            })}
            </div>) : null}

            {navFilter.showPortfolio && navFilter.showDictionary ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showDictionary ? (<div className="flex shrink-0 flex-col gap-0.5">
              <NavSectionHeader isOpen={dictionaryOpen} onToggle={toggleDictionarySection} icon={BookMarked} labelKey="navLanguageSection" outerClass={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isDictionaryPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")} iconBoxClass={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isDictionaryPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}/>
              {dictionaryOpen &&
            navFilter.dlinks.map((link) => {
                const active = isActive(pathname, link.href);
                const Icon = link.icon;
                return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")} active={active} icon={Icon}/>);
            })}
            </div>) : null}

            {navFilter.showDictionary && navFilter.showIelts ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showIelts ? (<div className="flex shrink-0 flex-col gap-0.5">
              <NavSectionHeader isOpen={ieltsOpen} onToggle={toggleIeltsSection} icon={BookOpen} labelKey="ielts" outerClass={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isIeltsPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")} iconBoxClass={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isIeltsPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}/>
              {ieltsOpen && (<IeltsExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
            </div>) : null}

            {navFilter.showIelts && navFilter.showStudy ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showStudy ? (<div className="flex shrink-0 flex-col gap-0.5">
              <NavSectionHeader isOpen={studyOpen} onToggle={toggleStudySection} icon={GraduationCap} labelKey="navStudySection" outerClass={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isStudyPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")} iconBoxClass={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isStudyPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}/>
              {studyOpen && (<StudyExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch} links={navFilter.studyLinks}/>)}
            </div>) : null}

            {navFilter.showStudy && navFilter.showEntertainment ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showEntertainment ? (<div className="flex shrink-0 flex-col gap-0.5">
              <NavSectionHeader isOpen={entertainmentOpen} onToggle={toggleEntertainmentSection} icon={PartyPopper} labelKey="navEntertainmentSection" outerClass={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isEntertainmentSidebarActive(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")} iconBoxClass={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isEntertainmentSidebarActive(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}/>
              {entertainmentOpen && (<>
                {navFilter.newsLinksFiltered.length > 0 ? (<>
                  <EntertainmentNewsGroupTitle label={navT("navNewsSection")}/>
                  <Suspense fallback={<NewsSourceExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch} links={navFilter.newsLinksFiltered} dailyNewsSrc={null}/>}>
                    <NewsSourceNavSearchParamsBridge pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch} links={navFilter.newsLinksFiltered}/>
                  </Suspense>
                </>) : null}
                {navFilter.watchLinksFiltered.map((link) => {
                const active = isActive(pathname, link.href);
                const Icon = link.icon;
                return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")} active={active} icon={Icon}/>);
            })}
              </>)}
            </div>) : null}

            {navFilter.showEntertainment && navFilter.showSchedule ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showSchedule ? (<div className="flex shrink-0 flex-col gap-0.5">
              <NavSectionHeader isOpen={scheduleOpen} onToggle={toggleScheduleSection} icon={CalendarClock} labelKey="navScheduleSection" outerClass={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isSchedulePath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")} iconBoxClass={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isSchedulePath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}/>
              {scheduleOpen &&
            navFilter.scheduleLinks.map((link) => {
                const active = isActive(pathname, link.href);
                const meetsLive = link.href === "/call" && meetInProgress;
                const Icon = link.icon;
                return (<NavSidebarRow key={link.href} href={link.href} labelKey={link.labelKey} onLinkClick={clearQuickSearch} className={[
                        "group flex items-center gap-3 rounded-r-xl py-2.5 pr-4 text-base transition-all duration-200",
                        meetsLive ? NAV_LINK_ROW_MEETS_LIVE : active ? NAV_LINK_ROW_ACTIVE : NAV_LINK_ROW_IDLE,
                    ].join(" ")} active={active} meetsLive={meetsLive} icon={Icon} badge={meetsLive ? (<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-red-400/50 dark:bg-red-500 dark:ring-red-300/40" title={t("meetsCallInProgress")}>
                              <span className="leading-none" aria-hidden>🔴</span>
                              {t("meetsLiveBadge")}
                            </span>) : undefined}/>);
            })}
            </div>) : null}

            {navFilter.showSchedule && navFilter.showOthers ? (<div className="my-2 shrink-0 border-t border-zinc-200 dark:border-zinc-700"/>) : null}

            {navFilter.showOthers ? (<div className="flex shrink-0 flex-col gap-0.5">
              <NavSectionHeader isOpen={othersOpen} onToggle={toggleOthersSection} icon={Cloud} labelKey="others" outerClass={[
            "group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-base font-medium transition-all duration-200",
            isOthersPath(pathname)
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-blue-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                : "text-zinc-500 hover:bg-blue-50/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        ].join(" ")} iconBoxClass={[
            "flex h-10 w-10 items-center justify-center rounded-xl transition",
            isOthersPath(pathname)
                ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
        ].join(" ")}/>
              {othersOpen && (<OthersExpandedNavLinks pathname={pathname} t={navT} filterQuery={navSearch} onLinkClick={clearQuickSearch}/>)}
            </div>) : null}
            </nav>

            <NavAccountFooter variant="sidebar" onOpenProfile={() => setProfileOpen(true)} onOpenSecurity={() => setSecurityOpen(true)}/>
          </div>
      </aside>
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)}/>
      <SecurityModal open={securityOpen} onClose={() => setSecurityOpen(false)}/>
    </>);
}
