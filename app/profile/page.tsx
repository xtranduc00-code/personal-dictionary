import type { Metadata } from "next";
import { ProfilePageClient } from "@/components/portfolio/profile-page-client";

export const metadata: Metadata = {
    title: "Profile | Portfolio",
    description: "Intro, tech stack, flagship project, experience, education & certifications.",
};

export default function ProfilePage() {
    return <ProfilePageClient />;
}
