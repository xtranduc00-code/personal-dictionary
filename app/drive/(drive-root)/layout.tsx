import { DriveLayoutClient } from "@gd/components/DriveLayoutClient";
export const dynamic = "force-dynamic";
export default function DriveSectionLayout({ children, }: {
    children: React.ReactNode;
}) {
    return <DriveLayoutClient>{children}</DriveLayoutClient>;
}
