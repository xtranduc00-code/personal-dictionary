import React from "react";
import { cn, formatDateTime } from "@gd/lib/utils";
export const FormattedDateTime = ({ date, className, }: {
    date: string;
    className?: string;
}) => {
    return (<p className={cn("text-sm font-medium leading-snug text-zinc-700 dark:text-zinc-400", className)}>
      {formatDateTime(date)}
    </p>);
};
export default FormattedDateTime;
