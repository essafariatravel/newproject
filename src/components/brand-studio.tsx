"use client";

/**
 * Brand Studio — live white-label editor for the super admin.
 * Colors / radius / fonts update a real-size preview instantly; "Save"
 * persists via the saveBrandingAction server action. Logo upload is its own
 * multipart form bound to uploadLogoAction.
 */
import { useState } from "react";
import { SubmitButton } from "@/components/forms";
import BrandMark from "@/components/brand-mark";
import type { Branding } from "@/lib/branding";

type SaveAction = (formData: FormData) => Promise<void>;
type LogoUploadAction = (formData: FormData) => Promise<void>;
type LogoRemoveAction = () => Promise<void>;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function norm(value: string): string {
  const v = value.trim();
  if (HEX_RE.test(v)) {
    if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
    return v.toLowerCase();
  }
  return "#000000";
}

function ColorField(props: {
  name: string;
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div>
      <span className="label">{props.label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-ivory-200 bg-white p-2 shadow-[0_1px_2px_rgb(23_30_63/0.04)]">
        <input
          type="color"
          aria-label={`${props.label} color picker`}
          value={norm(props.value)}
          onChange={(e) => props.onChange(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          type="text"
          name={props.name}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          spellCheck={false}
          className="w-full border-0 bg-transparent p-0 font-mono text-sm uppercase text-navy-900 focus:outline-none focus:ring-0"
          maxLength={7}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">{props.hint}</p>
    </div>
  );
}

export function BrandStudio(props: {
  initial: Branding;
  logoUrl: string | null;
  saveAction: SaveAction;
  uploadLogoAction: LogoUploadAction;
  removeLogoAction: LogoRemoveAction;
}) {
  const [primary, setPrimary] = useState(props.initial.primary);
  const [accent, setAccent] = useState(props.initial.accent);
  const [ink, setInk] = useState(props.initial.ink);
  const [radius, setRadius] = useState(props.initial.radius);
  const [fonts, setFonts] = useState(props.initial.fonts);

  const mix = (color: string, toward: "white" | "black", pct: number) =>
    `color-mix(in srgb, ${norm(color)} ${100 - pct}%, ${toward})`;

  const radiusCard = radius === "crisp" ? "0.55rem" : radius === "balanced" ? "0.9rem" : "1.25rem";
  const radiusBtn = radius === "crisp" ? "0.55rem" : radius === "balanced" ? "0.9rem" : "999px";
  const previewVars = {
    "--p": norm(primary),
    "--p-soft": mix(primary, "white", 90),
    "--p-tint": mix(primary, "white", 78),
    "--a": norm(accent),
    "--a-tint": mix(accent, "white", 76),
    "--ink": norm(ink),
    "--radius-card": radiusCard,
    "--radius-btn": radiusBtn,
    fontFamily:
      fonts === "classic"
        ? "Georgia, serif"
        : fonts === "modern"
          ? 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
          : undefined, // aurora = inherit the app's real stack
  } as React.CSSProperties;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      {/* -------- editor -------- */}
      <div className="space-y-4">
        {/*
         * The Save form wraps every persisted input (colors, radius, fonts,
         * identity copy). Regression guard: PREVIOUSLY the inputs and the
         * "Save branding" button were rendered WITHOUT any <form>, so the
         * live preview changed but nothing was ever posted → nothing saved.
         */}
        <form action={props.saveAction}>
          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="text-sm font-bold text-navy-900">Colors</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                The whole interface — buttons, badges, gradients, charts — re-tints from these three colors.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <ColorField name="brand.primary" label="Primary" hint="Actions, links, active states" value={primary} onChange={setPrimary} />
                <ColorField name="brand.accent" label="Accent" hint="Highlights, roles, eyebrows" value={accent} onChange={setAccent} />
                <ColorField name="brand.ink" label="Ink" hint="Headings & deep surfaces" value={ink} onChange={setInk} />
              </div>
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-bold text-navy-900">Shape & type</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="brand.radius">Corner style</label>
                  <select
                    id="brand.radius"
                    name="brand.radius"
                    value={radius}
                    onChange={(e) => setRadius(e.target.value as Branding["radius"])}
                    className="input"
                  >
                    <option value="soft">Soft — pill buttons, 20px cards</option>
                    <option value="balanced">Balanced — 14px corners</option>
                    <option value="crisp">Crisp — tight, editorial 9px</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="brand.fonts">Typography</label>
                  <select
                    id="brand.fonts"
                    name="brand.fonts"
                    value={fonts}
                    onChange={(e) => setFonts(e.target.value as Branding["fonts"])}
                    className="input"
                  >
                    <option value="aurora">Aurora — rounded sans + soft display serif</option>
                    <option value="modern">Modern — clean system sans throughout</option>
                    <option value="classic">Classic — serif throughout</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="brand.name">Brand name</label>
                  <input id="brand.name" name="brand.name" defaultValue={props.initial.name} className="input" maxLength={80} />
                </div>
                <div>
                  <label className="label" htmlFor="brand.tagline">Tagline</label>
                  <input id="brand.tagline" name="brand.tagline" defaultValue={props.initial.tagline} className="input" maxLength={160} />
                </div>
              </div>
            </div>

            <SubmitButton className="btn-primary" pendingLabel="Saving…">Save branding</SubmitButton>
          </div>
        </form>

        {/* Logo upload/remove are deliberately OUTSIDE the Save form — HTML
            forbids nested forms and each action has its own payload. */}
        <div className="card p-5">
          <h2 className="text-sm font-bold text-navy-900">Platform logo</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            PNG, JPEG or WebP up to 2 MB. Shown in the website header, portals and sign-in. Leave empty to use the
            built-in monogram.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-ivory-200 bg-ivory-50">
              <BrandMark className="h-11 w-11" src={props.logoUrl} alt="Platform logo" />
            </div>
            {props.logoUrl ? (
              <form action={props.removeLogoAction}>
                <SubmitButton className="btn-danger btn-sm" pendingLabel="Removing…">Remove logo</SubmitButton>
              </form>
            ) : null}
            <form action={props.uploadLogoAction} encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp"
                required
                className="max-w-full text-xs file:mr-2 file:cursor-pointer file:rounded-full file:border-0 file:bg-iris-600 file:px-3.5 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
              <SubmitButton className="btn-secondary btn-sm" pendingLabel="Uploading…">Upload logo</SubmitButton>
            </form>
          </div>
        </div>
      </div>

      {/* -------- live preview -------- */}
      <div className="h-fit xl:sticky xl:top-24">
        <div className="card overflow-hidden">
          <div className="border-b border-line/70 bg-ivory-50/70 px-5 py-3">
            <h2 className="text-sm font-bold text-navy-900">Live preview</h2>
            <p className="text-[11px] text-slate-400">Applies instantly · saved on “Save branding”.</p>
          </div>
          <div style={previewVars} className="space-y-4 bg-white p-5">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-[30%] text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--p) 55%, white), var(--p))" }}
              >
                E
              </span>
              <span>
                <span className="block text-sm font-bold" style={{ color: "var(--ink)" }}>ESSAFARIA</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--a)" }}>
                  Visa Operations
                </span>
              </span>
            </div>
            <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--ink)_8%,white)] p-4 shadow-[0_10px_30px_-18px_rgb(23_30_63/0.25)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Case EVT-26-9F3K21</p>
              <p className="mt-1 font-serif text-lg" style={{ color: "var(--ink)" }}>France · Schengen Tourist</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "var(--p-soft)", color: "color-mix(in srgb, var(--p) 80%, black)" }}
                >
                  ● Under review
                </span>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "var(--a-tint)", color: "color-mix(in srgb, var(--a) 60%, black)" }}
                >
                  ◆ Priority
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgb(0_0_0/0.35)]"
                  style={{ background: "var(--p)", borderRadius: "var(--radius-btn)" }}
                >
                  Approve
                </span>
                <span
                  className="inline-flex items-center border border-[color-mix(in_srgb,var(--ink)_10%,white)] bg-white px-4 py-2 text-[13px] font-semibold"
                  style={{ color: "var(--ink)", borderRadius: "var(--radius-btn)" }}
                >
                  Request docs
                </span>
              </div>
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,white)]">
                  <div className="h-full w-2/3 rounded-full" style={{ background: "var(--p)" }} />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Checklist 2 of 3 complete</p>
              </div>
            </div>
            <p className="text-center text-[11px] text-slate-400">Public site, portals and emails follow the same palette.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
