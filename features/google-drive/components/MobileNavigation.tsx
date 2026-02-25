"use client";
import { Sheet, SheetContent, SheetTitle, SheetTrigger, } from "@gd/components/ui/sheet";
import Image from "next/image";
import React, { useState } from "react";
import { Separator } from "@radix-ui/react-separator";
import { Button } from "@gd/components/ui/button";
import FileUploader from "@gd/components/FileUploader";
import { signOut } from "next-auth/react";
import { useI18n } from "@/components/i18n-provider";
interface Props {
    $id: string;
    accountId: string;
    fullName: string;
    avatar: string;
    email: string;
}
const MobileNavigation = ({ $id: ownerId, accountId, fullName, avatar, email, }: Props) => {
    const [open, setOpen] = useState(false);
    const { t } = useI18n();
    return (<header className="mobile-header">
      <Image src="/gdrive/assets/icons/logo-full-brand.svg" alt="logo" width={120} height={52} className="h-auto"/>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger>
          <Image src="/gdrive/assets/icons/menu.svg" alt="Search" width={30} height={30}/>
        </SheetTrigger>
        <SheetContent className="shad-sheet h-screen px-3">
          <SheetTitle>
            <div className="header-user">
              
              {avatar.startsWith("http") ? (<img src={avatar} alt="" width={44} height={44} className="header-user-avatar rounded-full object-cover" referrerPolicy="no-referrer"/>) : (<Image src={avatar} alt="avatar" width={44} height={44} className="header-user-avatar"/>)}
              <div className="sm:hidden lg:block">
                <p className="subtitle-2 capitalize">{fullName}</p>
                <p className="caption">{email}</p>
              </div>
            </div>
            <Separator className="mb-4 bg-light-200/20"/>
          </SheetTitle>

          <p className="mb-3 px-2 text-center text-sm text-light-200">
            Use the KFC sidebar:{" "}
            <strong className="text-white">Others → Google Drive</strong> to switch pages.
          </p>

          <Separator className="my-5 bg-light-200/20"/>

          <div className="flex flex-col justify-between gap-5 pb-5">
            <FileUploader className="w-full justify-center"/>
            <div className="flex flex-col gap-2 px-1">
              <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                {t("driveConnectHint")}
              </p>
              <Button type="button" variant="outline" className="w-full border-zinc-300 text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200" onClick={() => signOut({ callbackUrl: "/drive" })}>
                {t("driveMobileDisconnect")}
              </Button>
              <p className="text-center text-[11px] leading-snug text-zinc-400">
                {t("driveMobileDisconnectHint")}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>);
};
export default MobileNavigation;
