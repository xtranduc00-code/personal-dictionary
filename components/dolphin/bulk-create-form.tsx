"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_BROWSER_VERSION,
  DEFAULT_NAME_PREFIX,
  DEFAULT_PLATFORM,
  DEFAULT_START_INDEX,
} from "@/lib/dolphin/constants";
import { useDolphin } from "@/lib/dolphin/context";
import {
  parseNotesList,
  parseProfileNamesList,
  parseProxyList,
} from "@/lib/dolphin/parsers";
import type {
  BulkCreateFormValues,
  ProfilePair,
} from "@/lib/dolphin/types";
import { DolphinResultLog } from "@/components/dolphin/result-log";
import { FormFields } from "@/components/dolphin/form-fields";
import { RunControls } from "@/components/dolphin/run-controls";

const INITIAL_FORM: BulkCreateFormValues = {
  useExistingProfiles: false,
  namePrefix: DEFAULT_NAME_PREFIX,
  startIndex: DEFAULT_START_INDEX,
  platform: DEFAULT_PLATFORM,
  browserVersion: DEFAULT_BROWSER_VERSION,
  tag: "",
  autoFingerprint: true,
  proxiesText: "",
  profileNamesText: "",
  notesText: "",
};

export function BulkCreateForm() {
  const [values, setValues] = useState<BulkCreateFormValues>(INITIAL_FORM);
  const { state } = useDolphin();

  const { parsed: parsedProxies, errors: proxyErrors } = useMemo(
    () => parseProxyList(values.proxiesText),
    [values.proxiesText],
  );
  const { parsed: parsedNames, errors: nameErrors } = useMemo(
    () => parseProfileNamesList(values.profileNamesText),
    [values.profileNamesText],
  );
  const parsedNotes = useMemo(
    () => parseNotesList(values.notesText),
    [values.notesText],
  );

  const pairs = useMemo<ProfilePair[]>(() => {
    if (values.useExistingProfiles) {
      if (parsedNames.length === 0) return [];
      if (parsedNotes.length > 0 && parsedNotes.length !== parsedNames.length) {
        return [];
      }
      return parsedNames.map((profileId, i) => ({
        name: profileId,
        proxy: null,
        notes: parsedNotes[i],
      }));
    }
    if (parsedNames.length !== parsedProxies.length) return [];
    if (parsedNotes.length > 0 && parsedNotes.length !== parsedNames.length) {
      return [];
    }
    return parsedProxies.map((proxy, i) => ({
      name: parsedNames[i],
      proxy,
      notes: parsedNotes[i],
    }));
  }, [parsedNames, parsedProxies, parsedNotes, values.useExistingProfiles]);

  const preflightError = useMemo<string | null>(() => {
    if (proxyErrors.length > 0) return "Fix proxy parse errors first.";
    if (nameErrors.length > 0) return "Fix name parse errors first.";
    if (parsedNames.length === 0) return "Add at least one profile name.";
    if (!values.useExistingProfiles) {
      if (parsedProxies.length === 0) return "Add at least one proxy.";
      if (parsedNames.length !== parsedProxies.length) {
        return `Names (${parsedNames.length}) and proxies (${parsedProxies.length}) count must match.`;
      }
    }
    if (parsedNotes.length > 0 && parsedNotes.length !== parsedNames.length) {
      return `Notes (${parsedNotes.length}) and names (${parsedNames.length}) count must match (or notes empty).`;
    }
    return null;
  }, [
    parsedNames,
    parsedProxies,
    parsedNotes,
    nameErrors,
    proxyErrors,
    values.useExistingProfiles,
  ]);

  const isActive = state.status === "running" || state.status === "paused";

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h1 className="text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Bulk create profiles
      </h1>
      <FormFields values={values} onChange={setValues} disabled={isActive} />
      <RunControls
        values={values}
        pairs={pairs}
        proxyErrors={proxyErrors}
        nameErrors={nameErrors}
        preflightError={preflightError}
      />
      <DolphinResultLog />
    </section>
  );
}
