"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { X } from "lucide-react";
import { addFlashcard, createFlashcardSet, getFlashcardSets, type FlashcardSet, } from "@/lib/flashcard-storage";
import { useI18n } from "@/components/i18n-provider";
import { RichTextEditor } from "@/components/RichTextEditor";
type Props = {
    initialWord: string;
    onClose: () => void;
    onSaved?: () => void;
};
export function AddFlashcardModal({ initialWord, onClose, onSaved, }: Props) {
    const { t } = useI18n();
    const [sets, setSets] = useState<FlashcardSet[]>([]);
    const [selectedSetId, setSelectedSetId] = useState<string>("");
    const [word, setWord] = useState(initialWord);
    const [example, setExample] = useState("");
    const [definition, setDefinition] = useState("");
    const [showCreateSet, setShowCreateSet] = useState(false);
    const [newSetName, setNewSetName] = useState("");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        getFlashcardSets().then((loaded) => {
            setSets(loaded);
            if (loaded.length > 0 && !selectedSetId)
                setSelectedSetId(loaded[0].id);
        });
    }, []);
    const handleCreateSet = async () => {
        const name = newSetName.trim() || t("newSet");
        try {
            const newSet = await createFlashcardSet(name);
            const loaded = await getFlashcardSets();
            setSets(loaded);
            setSelectedSetId(newSet.id);
            setShowCreateSet(false);
            setNewSetName("");
            toast.success(t("toastSetCreated"));
        }
        catch {
            toast.error(t("toastVocabNotesError"));
        }
    };
    const handleSave = async () => {
        let setId = selectedSetId || sets[0]?.id;
        if (!setId) {
            try {
                const defaultSet = await createFlashcardSet(t("defaultSet"));
                const loaded = await getFlashcardSets();
                setSets(loaded);
                setId = defaultSet.id;
            }
            catch {
                toast.error(t("toastVocabNotesError"));
                return;
            }
        }
        setSaving(true);
        try {
            await addFlashcard(setId, word, definition, example);
            onSaved?.();
            onClose();
        }
        catch {
            toast.error(t("toastVocabNotesError"));
        }
        finally {
            setSaving(false);
        }
    };
    const canSave = word.trim().length > 0;
    return (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="add-flashcard-title">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="add-flashcard-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {t("addNewFlashcard")}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300" aria-label={t("ariaClose")}>
            <X className="h-5 w-5"/>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t("selectSet")}
            </label>
            {showCreateSet ? (<div className="mt-1 flex gap-2">
                <input type="text" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder={t("setName")} className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" autoFocus/>
                <button type="button" onClick={handleCreateSet} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {t("createSet")}
                </button>
                <button type="button" onClick={() => setShowCreateSet(false)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:text-zinc-300">
                  {t("cancel")}
                </button>
              </div>) : (<>
                <select value={selectedSetId} onChange={(e) => setSelectedSetId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
                  <option value="">{t("selectSet")}</option>
                  {sets.map((s) => (<option key={s.id} value={s.id}>
                      {s.name}
                    </option>))}
                </select>
                <button type="button" onClick={() => setShowCreateSet(true)} className="mt-2 text-sm text-zinc-700 hover:underline dark:text-zinc-400">
                  {t("orCreateNewSet")}
                </button>
              </>)}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t("wordOrPhrase")}
            </label>
            <input type="text" value={word} onChange={(e) => setWord(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" placeholder={t("wordOrPhrase")}/>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t("definitionLabel")}
            </label>
            <input type="text" value={definition} onChange={(e) => setDefinition(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" placeholder={t("definitionPlaceholder")}/>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Example
            </label>
            <RichTextEditor value={example} onChange={setExample} placeholder="Example…" className="mt-1" minHeightClassName="min-h-[80px]"/>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={handleSave} disabled={!canSave || saving} className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700">
            {t("saveButton")}
          </button>
          <Link href="/flashcards" onClick={onClose} className="block text-center text-sm text-zinc-600 hover:underline dark:text-zinc-400">
            {t("goToFlashcards")}
          </Link>
        </div>
      </div>
    </div>);
}
