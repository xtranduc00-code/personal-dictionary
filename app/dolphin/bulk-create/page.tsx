import type { Metadata } from "next";
import { BulkCreateForm } from "@/components/dolphin/bulk-create-form";

export const metadata: Metadata = {
  title: "Bulk profile creator — Ken Workspace",
  description:
    "Create Dolphin Anty browser profiles in bulk, each bound to its own proxy.",
};

export default function DolphinBulkCreatePage() {
  return <BulkCreateForm />;
}
