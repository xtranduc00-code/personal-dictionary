type FileType = "document" | "image" | "video" | "audio" | "other";
interface ActionType {
    label: string;
    icon: string;
    value: string;
}
interface SearchParamProps {
    params?: Promise<{
        type?: string;
        [key: string]: string | string[] | undefined;
    }>;
    searchParams?: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}
