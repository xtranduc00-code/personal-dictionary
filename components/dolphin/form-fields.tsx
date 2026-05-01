"use client";

import {
  BROWSER_VERSIONS,
  PLATFORMS,
} from "@/lib/dolphin/constants";
import type {
  BulkCreateFormValues,
  DolphinBrowserVersion,
  DolphinPlatform,
} from "@/lib/dolphin/types";
import { Checkbox } from "@/components/dolphin/shared/checkbox";
import { DOLPHIN_INPUT_CLASS, Field } from "@/components/dolphin/shared/field";

/** Toggle to true to expose name-prefix/index/platform/version/tag/auto-fingerprint controls. */
const SHOW_ADVANCED_FIELDS = false;

export function FormFields({
  values,
  onChange,
  disabled,
}: {
  values: BulkCreateFormValues;
  onChange: (v: BulkCreateFormValues) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof BulkCreateFormValues>(
    key: K,
    value: BulkCreateFormValues[K],
  ) => onChange({ ...values, [key]: value });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
        <Checkbox
          label="Use existing profile IDs (skip create; open+login only)"
          checked={values.useExistingProfiles}
          onChange={(v) => set("useExistingProfiles", v)}
          disabled={disabled}
        />
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          When enabled, paste Dolphin <span className="font-mono">profileId</span>s
          in “Profile names”. Proxy list is ignored.
        </p>
      </div>
      {SHOW_ADVANCED_FIELDS ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name prefix" htmlFor="dolphin-prefix">
            <input
              id="dolphin-prefix"
              type="text"
              value={values.namePrefix}
              onChange={(e) => set("namePrefix", e.target.value)}
              disabled={disabled}
              className={DOLPHIN_INPUT_CLASS}
            />
          </Field>
          <Field label="Start index" htmlFor="dolphin-start">
            <input
              id="dolphin-start"
              type="number"
              min={0}
              value={values.startIndex}
              onChange={(e) =>
                set("startIndex", Number.parseInt(e.target.value, 10) || 0)
              }
              disabled={disabled}
              className={DOLPHIN_INPUT_CLASS}
            />
          </Field>
          <Field label="Platform" htmlFor="dolphin-platform">
            <select
              id="dolphin-platform"
              value={values.platform}
              onChange={(e) =>
                set("platform", e.target.value as DolphinPlatform)
              }
              disabled={disabled}
              className={DOLPHIN_INPUT_CLASS}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Browser version" htmlFor="dolphin-version">
            <select
              id="dolphin-version"
              value={values.browserVersion}
              onChange={(e) =>
                set(
                  "browserVersion",
                  e.target.value as DolphinBrowserVersion,
                )
              }
              disabled={disabled}
              className={DOLPHIN_INPUT_CLASS}
            >
              {BROWSER_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Tag (optional)"
            htmlFor="dolphin-tag"
            className="sm:col-span-2"
          >
            <input
              id="dolphin-tag"
              type="text"
              value={values.tag}
              onChange={(e) => set("tag", e.target.value)}
              disabled={disabled}
              className={DOLPHIN_INPUT_CLASS}
            />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="Auto-generate fingerprint (useragent + WebGL)"
              checked={values.autoFingerprint}
              onChange={(v) => set("autoFingerprint", v)}
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}

      <Field label="Profile names" htmlFor="dolphin-names">
        <textarea
          id="dolphin-names"
          value={values.profileNamesText}
          onChange={(e) => set("profileNamesText", e.target.value)}
          disabled={disabled}
          rows={6}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          placeholder={
            values.useExistingProfiles ? "0b8f...-uuid\n1a2b...-uuid" : "acc_1\nacc_2"
          }
          className={`${DOLPHIN_INPUT_CLASS} font-mono`}
        />
      </Field>

      {!values.useExistingProfiles ? (
        <Field label="Proxy list" htmlFor="dolphin-proxies">
          <textarea
            id="dolphin-proxies"
            value={values.proxiesText}
            onChange={(e) => set("proxiesText", e.target.value)}
            disabled={disabled}
            rows={8}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            placeholder="http://160.22.174.193:27524:frfKgL:AeGtNW"
            className={`${DOLPHIN_INPUT_CLASS} font-mono`}
          />
        </Field>
      ) : null}

      <Field label="Notes (optional)" htmlFor="dolphin-notes">
        <textarea
          id="dolphin-notes"
          value={values.notesText}
          onChange={(e) => set("notesText", e.target.value)}
          disabled={disabled}
          rows={8}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          placeholder="username|password|recovery|2fa"
          className={`${DOLPHIN_INPUT_CLASS} font-mono`}
        />
      </Field>
    </div>
  );
}
