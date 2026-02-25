import type { Metadata } from "next";
import { DriveStylesLoader } from "@gd/components/DriveStylesLoader";
import { DriveSessionProvider } from "@gd/components/providers/DriveSessionProvider";
export const metadata: Metadata = {
    title: "Google Drive | KFC",
    description: "Kết nối Google Drive trong KFC — tách với đăng nhập tài khoản app.",
};
export default function DriveRootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<DriveSessionProvider>
      <div id="drive-portal-root" className="drive-app relative z-[100] min-h-0 min-w-0 w-full max-w-full flex-1 bg-transparent font-sans text-inherit">
        <DriveStylesLoader />
        {children}
      </div>
    </DriveSessionProvider>);
}
