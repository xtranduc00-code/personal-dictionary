import type { Metadata } from "next";
import { PortfolioHome } from "@/components/portfolio/portfolio-home";
export const metadata: Metadata = {
    title: "Portfolio | KFC Workspace",
    description: "Front-end developer portfolio — Duy Tran.",
};
export default function HomePage() {
    return <PortfolioHome />;
}
