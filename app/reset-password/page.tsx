import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";
export const metadata: Metadata = {
    title: "Reset password — KFC Workspace",
    description: "Set a new password for your account.",
};
export default function ResetPasswordPage() {
    return <ResetPasswordForm />;
}
