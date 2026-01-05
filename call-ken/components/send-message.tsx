import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
} from "react";
import { useEffect, useState, useRef } from "react";
import { Image01, X } from "@untitledui/icons";
import { Button } from "@/call-ken/components/base/buttons/button";
import { ButtonUtility } from "@/call-ken/components/base/buttons/button-utility";
import { TextAreaBase } from "@/call-ken/components/base/textarea/textarea";
import { cx } from "@/call-ken/utils/cx";

interface MessageActionTextareaProps {
  onSubmit: (message: string, file?: File) => void;
  className?: string;
  textAreaClassName?: string;
}

export const MessageActionTextarea = ({
  onSubmit,
  className,
  textAreaClassName,
  ...props
}: MessageActionTextareaProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get("message") as string;
    if (message.trim() || selectedFile) {
      onSubmit?.(message, selectedFile || undefined);
      formRef.current?.reset();
      // keep preview visible after send (user can close with X)
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const setFileFromInput = (file: File | null) => {
    setSelectedFile(null);
    setImagePreview(null);
    setDocPreview(null);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    if (!file) return;

    if (file.type.startsWith("image/")) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) =>
        setImagePreview((e.target?.result as string) ?? null);
      reader.readAsDataURL(file);
      return;
    }

    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      setSelectedFile(file);
      setPdfPreviewUrl(URL.createObjectURL(file));
      return;
    }

    const isText =
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      /\.(txt|csv|md|json)$/i.test(file.name);
    if (isText) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setDocPreview((e.target?.result as string) ?? "");
      reader.readAsText(file);
      return;
    }

    setDocPreview(
      "Unsupported file type. Use .txt, .csv, .md, .json, .pdf, or an image.",
    );
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFileFromInput(e.target.files?.[0] ?? null);
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setDocPreview(null);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items?.length) setIsDragOver(true);
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
    const file =
      e.clipboardData.files?.[0] ??
      Array.from(e.clipboardData.items ?? [])
        .find((i) => i.kind === "file")
        ?.getAsFile();
    if (file) setFileFromInput(file);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
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

  const showPanel =
    (imagePreview || pdfPreviewUrl || docPreview) &&
    (selectedFile || docPreview);

  return (
    <>
      <form
        ref={formRef}
        className={cx(
          "relative flex h-max items-center gap-3",
          isDragOver && "ring-2 ring-zinc-400 ring-offset-2 ring-dashed dark:ring-zinc-500",
          className,
        )}
        onSubmit={handleSubmit}
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

        <div className="relative flex flex-1 flex-col">
          <TextAreaBase
            aria-label="Message"
            placeholder="Message"
            name="message"
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            className={cx(
              "h-24 sm:h-18 w-full resize-none text-base",
              textAreaClassName,
            )}
          />
          <p className="mt-1 text-xs text-fg-quaternary whitespace-nowrap overflow-x-auto min-w-0">
            Enter to send · Shift+Enter new line · ⌘K to attach
          </p>
        </div>

        <div className="absolute right-4 bottom-13 sm:right-3.5 sm:bottom-10 flex items-center gap-2">
          <ButtonUtility
            icon={Image01}
            size="xs"
            color="tertiary"
            onClick={handleAttachClick}
            type="button"
          />
          <Button size="sm" color="link-color" type="submit">
            Send
          </Button>
        </div>
      </form>

      {showPanel && (
        <div className="fixed inset-2 sm:inset-y-0 sm:right-4 z-50 flex items-center justify-center sm:justify-end">
          <div className="w-full sm:w-auto rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 shadow-2xl">
            <div className="flex justify-end">
              <ButtonUtility
                icon={X}
                size="xs"
                color="tertiary"
                onClick={handleRemove}
                type="button"
              />
            </div>
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Preview"
                className="mt-1 h-[70vh] sm:h-[800px] w-full sm:w-[600px] max-h-[90vh] sm:max-w-[65vw] object-contain rounded-xl border border-gray-100 bg-black/5"
              />
            ) : pdfPreviewUrl ? (
              <iframe
                src={pdfPreviewUrl}
                title="PDF preview"
                className="mt-1 h-[70vh] sm:h-[800px] w-full sm:w-[600px] max-h-[90vh] sm:max-w-[65vw] rounded-xl border border-gray-100 bg-gray-50"
              />
            ) : (
              <pre className="mt-1 h-[70vh] sm:h-[800px] w-full sm:w-[600px] max-h-[90vh] sm:max-w-[65vw] overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs">
                {docPreview}
              </pre>
            )}
          </div>
        </div>
      )}
    </>
  );
};
