"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { createFlashcardSet, deleteFlashcard, deleteFlashcardSet, getFlashcardSets, getFlashcardsBySet, setFlashcardPinned, updateFlashcard, updateFlashcardSet, type Flashcard, type FlashcardSet, } from "@/lib/flashcard-storage";
import { Check, Layers, MoreHorizontal, NotebookText, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { AddFlashcardModal } from "@/components/ielts";
import { RichTextEditor } from "@/components/RichTextEditor";
import DOMPurify from "isomorphic-dompurify";
export default function FlashcardsPage() {
    const { t } = useI18n();
    const [sets, setSets] = useState<FlashcardSet[]>([]);
    const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
    const [cards, setCards] = useState<Flashcard[]>([]);
    const [editingSetId, setEditingSetId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [showAddModal, setShowAddModal] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [isAddingSet, setIsAddingSet] = useState(false);
    const [newSetName, setNewSetName] = useState("");
    const [editingCard, setEditingCard] = useState<{
        id: string;
        word: string;
        definition: string;
    } | null>(null);
    const [savingCard, setSavingCard] = useState(false);
    useEffect(() => {
        getFlashcardSets().then((loaded) => {
            setSets(loaded);
            if (loaded.length > 0 && !selectedSetId)
                setSelectedSetId(loaded[0].id);
        });
    }, []);
    useEffect(() => {
        if (!selectedSetId) {
            setCards([]);
            return;
        }
        getFlashcardsBySet(selectedSetId).then(setCards);
    }, [selectedSetId]);
    const currentSet = sets.find((s) => s.id === selectedSetId);
    function handleAddSet() {
        setNewSetName("");
        setIsAddingSet(true);
    }
    async function handleConfirmAddSet() {
        const name = newSetName.trim();
        if (!name) {
            setIsAddingSet(false);
            return;
        }
        try {
            const newSet = await createFlashcardSet(name);
            const loaded = await getFlashcardSets();
            setSets(loaded);
            setSelectedSetId(newSet.id);
        }
        catch {
        }
        finally {
            setIsAddingSet(false);
            setNewSetName("");
        }
    }
    function handleStartEditSet(set: FlashcardSet) {
        setEditingSetId(set.id);
        setEditingName(set.name);
    }
    async function handleSaveEditSet() {
        if (!editingSetId)
            return;
        try {
            await updateFlashcardSet(editingSetId, editingName);
            const loaded = await getFlashcardSets();
            setSets(loaded);
            setEditingSetId(null);
        }
        catch {
        }
    }
    async function handleTogglePin(set: FlashcardSet) {
        try {
            const updated = await setFlashcardPinned(set.id, !set.pinned);
            if (!updated)
                return;
            const loaded = await getFlashcardSets();
            setSets(loaded);
            setSelectedSetId((prev) => prev ?? updated.id);
        }
        catch {
        }
    }
    async function handleDeleteSet(setId: string) {
        try {
            await deleteFlashcardSet(setId);
            const next = await getFlashcardSets();
            setSets(next);
            if (selectedSetId === setId)
                setSelectedSetId(next[0]?.id ?? null);
            setEditingSetId(null);
            toast.success(t("toastSetDeleted"));
        }
        catch {
        }
    }
    async function handleDeleteCard(id: string) {
        try {
            await deleteFlashcard(id);
            if (selectedSetId) {
                const next = await getFlashcardsBySet(selectedSetId);
                setCards(next);
            }
            toast.success(t("toastCardDeleted"));
        }
        catch {
        }
    }
    async function handleSaveCard() {
        if (!editingCard)
            return;
        setSavingCard(true);
        try {
            await updateFlashcard(editingCard.id, editingCard.word, editingCard.definition);
            if (selectedSetId) {
                const next = await getFlashcardsBySet(selectedSetId);
                setCards(next);
            }
            setEditingCard(null);
            toast.success(t("toastCardUpdated"));
        }
        catch {
        }
        finally {
            setSavingCard(false);
        }
    }
    return (<div className="mx-auto max-w-4xl px-4 py-8">
      
      <h1 className="mb-8 flex items-center gap-2.5 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        <NotebookText className="h-6 w-6"/>
        {t("ieltsVocabNotes")}
      </h1>

      {sets.length === 0 ? (<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <Layers className="mb-4 h-10 w-10 text-zinc-300 dark:text-zinc-600"/>
          <p className="mb-1 text-base font-semibold text-zinc-700 dark:text-zinc-300">
            {t("noSetsYet")}
          </p>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            {t("createFirstSetHint")}
          </p>
          <button type="button" onClick={handleAddSet} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            <Plus className="h-4 w-4"/>
            {t("createFirstSet")}
          </button>
        </div>) : (<div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          
          <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white sm:h-[calc(100vh-7rem)] sm:w-60 dark:border-zinc-800 dark:bg-zinc-900">
            
            <button type="button" onClick={handleAddSet} className="flex w-full shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-2.5 text-left text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200">
              <span className="text-sm font-medium">{t("addSetTitle")}</span>
              <Plus className="h-4 w-4"/>
            </button>

            
            {isAddingSet && (<div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <input type="text" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} onKeyDown={(e) => {
                    if (e.key === "Enter")
                        handleConfirmAddSet();
                    if (e.key === "Escape") {
                        setIsAddingSet(false);
                        setNewSetName("");
                    }
                }} placeholder={t("newSet")} className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" autoFocus/>
                <p className="mt-1 text-[11px] text-zinc-400">{t("enterToSaveEscToCancel")}</p>
              </div>)}

            
            <ul className="flex-1 overflow-y-auto pb-1">
              {sets.map((s) => {
                const isActive = selectedSetId === s.id;
                return (<li key={s.id} className="group relative">
                    {editingSetId === s.id ? (<div className="px-3 py-2">
                        <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} onBlur={handleSaveEditSet} onKeyDown={(e) => {
                            if (e.key === "Enter")
                                handleSaveEditSet();
                            if (e.key === "Escape")
                                setEditingSetId(null);
                        }} className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100" autoFocus/>
                      </div>) : (<div className={`flex items-center ${isActive
                            ? "border-l-2 border-l-zinc-900 bg-zinc-100 dark:border-l-zinc-100 dark:bg-zinc-800"
                            : "border-l-2 border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}>
                        <button type="button" onClick={() => setSelectedSetId(s.id)} className="min-w-0 flex-1 py-2.5 pl-3 pr-1 text-left">
                          <span className={`flex items-center gap-1.5 truncate text-sm ${isActive
                            ? "font-semibold text-zinc-900 dark:text-zinc-100"
                            : "font-medium text-zinc-700 dark:text-zinc-300"}`}>
                            {s.pinned && (<Pin className="h-3 w-3 shrink-0 fill-current text-amber-500"/>)}
                            {s.name}
                          </span>
                        </button>

                        
                        <div className="relative pr-1">
                          <button type="button" onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)} className={`rounded p-1.5 transition-opacity ${openMenuId === s.id
                            ? "opacity-100 text-zinc-700 dark:text-zinc-200"
                            : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"}`}>
                            <MoreHorizontal className="h-4 w-4"/>
                          </button>

                          
                          {openMenuId === s.id && (<>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)}/>
                              <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                                <button type="button" onClick={() => {
                                handleTogglePin(s);
                                setOpenMenuId(null);
                            }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700">
                                  <Pin className={`h-3.5 w-3.5 ${s.pinned ? "fill-current text-amber-500" : ""}`}/>
                                  {s.pinned ? t("unpinSetTitle") : t("pinSetTitle")}
                                </button>
                                <button type="button" onClick={() => {
                                handleStartEditSet(s);
                                setOpenMenuId(null);
                            }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700">
                                  <Pencil className="h-3.5 w-3.5"/>
                                  {t("renameSetTitle")}
                                </button>
                                <div className="my-1 border-t border-zinc-100 dark:border-zinc-700"/>
                                <button type="button" onClick={() => {
                                setOpenMenuId(null);
                                if (confirm(t("confirmDeleteSet")))
                                    handleDeleteSet(s.id);
                            }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
                                  <Trash2 className="h-3.5 w-3.5"/>
                                  {t("deleteSetTitle")}
                                </button>
                              </div>
                            </>)}
                        </div>
                      </div>)}
                  </li>);
            })}
            </ul>
          </aside>

          
          <div className="min-w-0 flex-1">
            {currentSet && (<>
                
                <div className="mb-5 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        {currentSet.name}
                      </h2>
                      <p className="mt-0.5 text-sm text-zinc-400 dark:text-zinc-500">
                        {cards.length === 0
                    ? t("noCardsInSet")
                    : `${cards.length} card${cards.length > 1 ? "s" : ""}`}
                      </p>
                    </div>
                    {cards.length > 0 && (<button type="button" onClick={() => setShowAddModal(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                        <Plus className="h-4 w-4"/>
                        {t("addNewFlashcard")}
                      </button>)}
                  </div>
                </div>

                {cards.length === 0 ? (<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
                    <Layers className="mb-4 h-10 w-10 text-zinc-300 dark:text-zinc-600"/>
                    <p className="mb-1 text-base font-semibold text-zinc-700 dark:text-zinc-300">
                      {t("noFlashcardsYet")}
                    </p>
                    <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
                      {t("createFirstCardHint")}
                    </p>
                    <button type="button" onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                      <Plus className="h-4 w-4"/>
                      {t("addNewFlashcard")}
                    </button>
                  </div>) : (<>
                    <ul className="space-y-3">
                      {cards.map((c) => {
                        const isEditing = editingCard?.id === c.id;
                        return (<li key={c.id} className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:shadow-md hover:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-900">
                            {isEditing ? (<div className="space-y-3">
                                <input type="text" value={editingCard.word} onChange={(e) => setEditingCard((prev) => prev ? { ...prev, word: e.target.value } : prev)} placeholder={t("wordLabel")} className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"/>
                                <RichTextEditor value={editingCard.definition} onChange={(html) => setEditingCard((prev) => prev ? { ...prev, definition: html } : prev)} placeholder={t("definitionLabel")} minHeightClassName="min-h-[120px]"/>
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => setEditingCard(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800">
                                    <X className="h-3.5 w-3.5"/>
                                    {t("cancelButton")}
                                  </button>
                                  <button type="button" onClick={handleSaveCard} disabled={savingCard || !editingCard.word.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
                                    <Check className="h-3.5 w-3.5"/>
                                    {savingCard ? t("saving") : t("saveButton")}
                                  </button>
                                </div>
                              </div>) : (<div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {c.word}
                                  </p>
                                  {c.definition ? (<div className="mt-1 prose prose-sm prose-zinc max-w-none text-zinc-600 dark:prose-invert dark:text-zinc-400" dangerouslySetInnerHTML={{
                                        __html: DOMPurify.sanitize(c.definition),
                                    }}/>) : (<p className="mt-1 text-sm text-zinc-400">—</p>)}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button type="button" onClick={() => setEditingCard({
                                    id: c.id,
                                    word: c.word,
                                    definition: c.definition,
                                })} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title={t("editCardTitle")}>
                                    <Pencil className="h-4 w-4"/>
                                  </button>
                                  <button type="button" onClick={() => {
                                    if (confirm(t("confirmDeleteCard")))
                                        handleDeleteCard(c.id);
                                }} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400" title={t("deleteCardTitle")}>
                                    <Trash2 className="h-4 w-4"/>
                                  </button>
                                </div>
                              </div>)}
                          </li>);
                    })}
                    </ul>
                  </>)}
              </>)}
          </div>
        </div>)}

      {showAddModal && (<AddFlashcardModal initialWord="" onClose={() => setShowAddModal(false)} onSaved={async () => {
                if (selectedSetId) {
                    const next = await getFlashcardsBySet(selectedSetId);
                    setCards(next);
                }
            }}/>)}
    </div>);
}
