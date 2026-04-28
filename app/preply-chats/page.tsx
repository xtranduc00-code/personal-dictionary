import type { Metadata } from "next";
import { PreplyChatPairs } from "@/components/preply-chat-pairs";

export const metadata: Metadata = {
  title: "Random message pairs — Ken Workspace",
  description:
    "Random teacher/student message pairs for Preply trial and follow-up sessions.",
};

export default function PreplyChatsPage() {
  return <PreplyChatPairs />;
}
