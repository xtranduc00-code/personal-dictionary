"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { navItems } from "@gd/constants";
import { DRIVE_BASE } from "@gd/drive-base";
import { usePathname } from "next/navigation";
import { cn } from "@gd/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, } from "@gd/components/ui/tooltip";
const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const DRIVE_NAV_OPEN_KEY = "drive-nav-google-open";
function isDriveNavActive(pathname: string, url: string, dashboardUrl: string) {
    if (url === dashboardUrl) {
        return pathname === dashboardUrl || pathname === `${dashboardUrl}/`;
    }
    return pathname === url || pathname.startsWith(`${url}/`);
}
interface Props {
    fullName: string;
    avatar: string;
    email: string;
}
const Sidebar = ({ fullName, avatar, email }: Props) => {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [driveNavOpen, setDriveNavOpen] = useState(true);
    useEffect(() => {
        try {
            const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
            if (stored === "true")
                setCollapsed(true);
            const navOpen = localStorage.getItem(DRIVE_NAV_OPEN_KEY);
            if (navOpen === "false")
                setDriveNavOpen(false);
        }
        catch {
        }
    }, []);
    useEffect(() => {
        if (navItems.some((item) => isDriveNavActive(pathname, item.url, DRIVE_BASE))) {
            setDriveNavOpen(true);
        }
    }, [pathname]);
    const toggle = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
            }
            catch {
            }
            return next;
        });
    };
    const toggleDriveNav = () => {
        setDriveNavOpen((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(DRIVE_NAV_OPEN_KEY, String(next));
            }
            catch {
            }
            return next;
        });
    };
    return (<aside className={cn("sidebar", collapsed && "sidebar--collapsed")}>
      <div className="sidebar-header">
        <Link href={DRIVE_BASE} className="sidebar-logo">
          <Image src="/gdrive/assets/icons/logo-full-brand.svg" alt="StoreIt" width={160} height={50} className="sidebar-logo-full"/>
          <Image src="/gdrive/assets/icons/logo-brand.svg" alt="StoreIt" width={52} height={52} className="sidebar-logo-icon"/>
        </Link>
        <button type="button" onClick={toggle} className="sidebar-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <span className="sidebar-toggle-icon" aria-hidden>
            {collapsed ? (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>) : (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>)}
          </span>
        </button>
      </div>

      <nav className="sidebar-nav">
        {collapsed ? (<ul className="flex flex-1 flex-col gap-6">
            {navItems.map(({ url, name, icon }) => {
                const active = isDriveNavActive(pathname, url, DRIVE_BASE);
                return (<Tooltip key={name}>
                  <TooltipTrigger asChild>
                    <Link href={url} className="lg:w-full">
                      <li className={cn("sidebar-nav-item", active && "shad-active")}>
                        <span className={cn("sidebar-nav-icon-wrap", active && "sidebar-nav-icon-wrap--active")}>
                          <Image src={icon} alt="" width={28} height={28} className="sidebar-nav-icon"/>
                        </span>
                        <p className="sidebar-nav-label">{name}</p>
                      </li>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {name}
                  </TooltipContent>
                </Tooltip>);
            })}
          </ul>) : (<div className="flex w-full flex-col gap-1">
            <button type="button" onClick={toggleDriveNav} className="sidebar-nav-section-trigger flex w-full items-center gap-3 rounded-xl py-2 text-left text-light-100 transition-colors hover:bg-brand/5 lg:px-3" aria-expanded={driveNavOpen}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                <Image src="/gdrive/assets/icons/documents.svg" alt="" width={22} height={22} className="sidebar-nav-icon opacity-80"/>
              </span>
              <span className="sidebar-nav-label min-w-0 flex-1 font-semibold">
                Google Drive
              </span>
              <svg className={cn("mr-1 h-4 w-4 shrink-0 text-light-200 transition-transform", driveNavOpen && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            {driveNavOpen && (<ul className="mt-1 flex flex-col gap-1 border-l-2 border-light-300/80 pl-3 lg:ml-[18px] lg:pl-3">
                {navItems.map(({ url, name, icon }) => {
                    const active = isDriveNavActive(pathname, url, DRIVE_BASE);
                    return (<li key={name}>
                      <Link href={url} className={cn("flex items-center gap-3 rounded-xl py-2.5 pl-1 pr-2 transition-colors hover:bg-brand/5 lg:pl-2", active && "bg-brand text-white shadow-drop-2 hover:bg-brand")}>
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-white/20" : "bg-light-300/40")}>
                          <Image src={icon} alt="" width={22} height={22} className={cn("sidebar-nav-icon", active && "brightness-0 invert")}/>
                        </span>
                        <span className={cn("text-sm font-medium", active ? "text-white" : "text-light-100")}>
                          {name}
                        </span>
                      </Link>
                    </li>);
                })}
              </ul>)}
          </div>)}
      </nav>

      <div className="mt-4 px-2">
        <Link href="/dictionary" className="body-2 flex items-center justify-center gap-1 rounded-full py-2 text-light-200 transition-colors hover:text-brand lg:justify-start lg:px-4">
          ← KFC
        </Link>
      </div>

      <div className="sidebar-illustration">
        <Image src="/gdrive/assets/images/files-2.png" alt="" width={506} height={418} className="w-full"/>
      </div>

      <div className="sidebar-user-info">
        {avatar.startsWith("http") ? (<img src={avatar} alt="" width={44} height={44} className="sidebar-user-avatar rounded-full object-cover" referrerPolicy="no-referrer"/>) : (<Image src={avatar} alt="Avatar" width={44} height={44} className="sidebar-user-avatar"/>)}
        <div className="sidebar-user-text">
          <p className="subtitle-2 capitalize">{fullName}</p>
          <p className="caption">{email}</p>
        </div>
      </div>
    </aside>);
};
export default Sidebar;
