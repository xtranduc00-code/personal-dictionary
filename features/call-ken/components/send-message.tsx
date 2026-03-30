import type { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, } from "react";
import { useEffect, useState, useRef } from "react";
import { Image01, X } from "@untitledui/icons";
import { Button } from "@/features/call-ken/components/base/buttons/button";
import { ButtonUtility } from "@/features/call-ken/components/base/buttons/button-utility";
import { TextAreaBase } from "@/features/call-ken/components/base/textarea/textarea";
import { cx } from "@/features/call-ken/utils/cx";

interface MessageActionTextareaProps {
    onSubmit: (message: string, file?: File) => void | Promise<void>;
    className?: string;
    textAreaClassName?: string;
}

export const MessageActionTextarea = ({ onSubmit, className, textAreaClassName, ...props }: MessageActionTextareaProps) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [docPreview, setDocPreview] = useState<string | null>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const clearAttachment = () => {
        setSelectedFile(null);
        setImagePreview(null);
        setDocPreview(null);
        if (pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
        }
        if (fileInputRef.current)
            fileInputRef.current.value = "";
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const message = (formData.get("message") as string) ?? "";
        const file = selectedFile;
        if (!message.trim() && !file)
            return;
        try {
            await Promise.resolve(onSubmit?.(message, file ?? undefined));
        }
        finally {
            formRef.current?.reset();
            clearAttachment();
        }
    };

    const handleAttachClick = () => {
        fileInputRef.current?.click();
    };

    const setFileFromInput = (file: File | null) => {
        clearAttachment();
        if (!file)
            return;
        if (file.type.startsWith("image/")) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setImagePreview((ev.target?.result as string) ?? null);
            reader.readAsDataURL(file);
            return;
        }
        if (file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")) {
            setSelectedFile(file);
            setPdfPreviewUrl(URL.createObjectURL(file));
            return;
        }
        const isText = file.type.startsWith("text/") ||
            file.type === "application/json" ||
            /\.(txt|csv|md|json)$/i.test(file.name);
        if (isText) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setDocPreview((ev.target?.result as string) ?? "");
            reader.readAsText(file);
            return;
        }
        setSelectedFile(null);
        setDocPreview("Unsupported file type. Use .txt, .csv, .md, .json, .pdf, or an image.");
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFileFromInput(e.target.files?.[0] ?? null);
    };

    const handleRemove = () => {
        clearAttachment();
    };

    const handleDragOver = (e: DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.items?.length)
            setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e: DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        setFileFromInput(e.dataTransfer.files?.[0] ?? null);
    };

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const file = e.clipboardData.files?.[0] ??
            Array.from(e.clipboardData.items ?? [])
                .find((i) => i.kind === "file")
                ?.getAsFile();
        if (file)
            setFileFromInput(file);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void formRef.current?.requestSubmit();
        }
    };

    useEffect(() => {
        const onKey = (e: globalThis.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                fileInputRef.current?.click();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => () => {
        if (pdfPreviewUrl)
            URL.revokeObjectURL(pdfPreviewUrl);
    }, [pdfPreviewUrl]);

    const showPanel = Boolean(imagePreview || pdfPreviewUrl || (docPreview && (selectedFile || docPreview)));

    return (
        <form
            ref={formRef}
            className={cx(
                "flex flex-col gap-2",
                isDragOver && "rounded-xl ring-2 ring-dashed ring-zinc-400 ring-offset-2 dark:ring-zinc-500",
                className,
            )}
            onSubmit={(e) => void handleSubmit(e)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            {...props}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.txt,.csv,.md,.json,.pdf,application/pdf"
                onChange={handleFileChange}
                className="hidden"
            />

            {showPanel && (
                <div className="relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/80">
                    <div className="flex justify-end border-b border-zinc-200 px-2 py-1 dark:border-zinc-600">
                        <ButtonUtility icon={X} size="xs" color="tertiary" onClick={handleRemove} type="button" />
                    </div>
                    <div className="max-h-[min(40vh,320px)] w-full overflow-y-auto overscroll-contain">
                        {imagePreview ? (
                            <img
                                src={imagePreview}
                                alt="Preview"
                                className="mx-auto max-h-[min(40vh,320px)] w-full object-contain p-2"
                            />
                        ) : pdfPreviewUrl ? (
                            <iframe
                                src={pdfPreviewUrl}
                                title="PDF preview"
                                className="h-[min(40vh,320px)] w-full border-0 bg-white dark:bg-zinc-900"
                            />
                        ) : (
                            <pre className="whitespace-pre-wrap p-3 text-xs text-zinc-800 dark:text-zinc-200">
                                {docPreview}
                            </pre>
                        )}
                    </div>
                    {selectedFile && (
                        <p className="border-t border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                            {selectedFile.name}
                        </p>
                    )}
                </div>
            )}

            <div className="flex items-end gap-2">
                <div className="relative flex min-w-0 flex-1 flex-col">
                    <TextAreaBase
                        aria-label="Message"
                        placeholder="Message"
                        name="message"
                        onPaste={handlePaste}
                        onKeyDown={handleKeyDown}
                        className={cx("h-24 w-full resize-none text-base sm:h-20", textAreaClassName)}
                    />
                    <p className="mt-1 min-w-0 overflow-x-auto whitespace-nowrap text-xs text-fg-quaternary">
                        Enter to send · Shift+Enter new line · ⌘K to attach
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 pb-6">
                    <ButtonUtility icon={Image01} size="xs" color="tertiary" onClick={handleAttachClick} type="button" />
                    <Button size="sm" color="link-color" type="submit">
                        Send
                    </Button>
                </div>
            </div>
        </form>
    );
};
