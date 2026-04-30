import type { ReactNode } from "react";
import { DolphinProvider } from "@/components/dolphin/dolphin-provider";

export default function DolphinLayout({ children }: { children: ReactNode }) {
  return <DolphinProvider>{children}</DolphinProvider>;
}
