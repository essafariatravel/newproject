import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("premium ESSAFARIA interaction system", () => {
  it("defines a compact five-level motion vocabulary", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--motion-instant: 80ms");
    expect(css).toContain("--motion-micro: 120ms");
    expect(css).toContain("--motion-standard: 200ms");
    expect(css).toContain("--motion-overlay: 220ms");
    expect(css).toContain("--motion-spatial: 240ms");
  });

  it("anchors navigable rows with logical-edge emphasis without lift or scale", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".tr-hover > .td:first-child");
    expect(css).toContain("border-inline-start");
    expect(css).toContain(".tr-hover:has(a:focus-visible)");
    expect(css).not.toMatch(/\.tr-hover[^}]*transform/s);
  });

  it("anchors sidebar selection instead of floating it like a pill", () => {
    const nav = read("src/components/nav-list.tsx");
    const css = read("src/app/globals.css");
    expect(nav).toContain("workspace-nav-icon");
    expect(nav).toContain("rounded-md");
    expect(nav).not.toContain("rounded-lg px-3 py-2");
    expect(css).toContain(".workspace-nav-link[aria-current=\"page\"]");
    expect(css).toContain("border-inline-start-color");
  });
});

describe("operational tooling hierarchy", () => {
  it("uses a flat filter/tool strip instead of a card container", () => {
    const widgets = read("src/components/app-widgets.tsx");
    const css = read("src/app/globals.css");
    expect(widgets).toContain('className="filter-bar');
    expect(widgets).not.toContain('className="card mb-4 flex flex-wrap items-end gap-3 p-4"');
    expect(css).toContain(".filter-bar");
  });

  it("uses text-scale page-size controls and RTL-safe pagination arrows", () => {
    const widgets = read("src/components/app-widgets.tsx");
    expect(widgets).toContain("page-size-option");
    expect(widgets).not.toContain('className={props.pageSize === size ? "badge');
    expect(widgets.match(/className="directional"/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("document workflow craft", () => {
  it("uses one document surface with state rows instead of repeated document cards", () => {
    const detail = read("src/components/application-detail.tsx");
    expect(detail).toContain("document-list");
    expect(detail).toContain("document-state");
    expect(detail).not.toContain('<div key={doc.id} className="card p-4">');
  });

  it("marks upload/resubmission slots and document rows for meaningful state motion", () => {
    const detail = read("src/components/application-detail.tsx");
    const css = read("src/app/globals.css");
    expect(detail).toContain("document-upload-slot");
    expect(detail).toContain("document-file-settle");
    expect(css).toContain("@keyframes document-slot-open");
    expect(css).toContain("@keyframes document-file-settle");
    expect(css).toContain(".document-state");
  });

  it("collapses document motion safely for reduced-motion users", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.document-upload-slot[\s\S]*animation:\s*none/s);
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*\.document-file-settle[\s\S]*animation:\s*none/s);
  });
});

describe("wizard continuity", () => {
  it("gives the step rail explicit active/completed state semantics", () => {
    const wizard = read("src/app/portal/applications/new/request-wizard.tsx");
    expect(wizard).toContain("wizard-step");
    expect(wizard).toContain('data-state={step === s.n ? "active" : step > s.n ? "complete" : "pending"}');
  });

  it("uses shared choice and file-settle primitives for selection/upload feedback", () => {
    const wizard = read("src/app/portal/applications/new/request-wizard.tsx");
    expect(wizard).toContain("wizard-choice");
    expect(wizard).toContain("wizard-file-settle");
    expect(wizard).toContain("form-feedback");
  });

  it("keeps serious outcomes unanimated", () => {
    const css = read("src/app/globals.css");
    expect(css).not.toContain("wallet-celebrate");
    expect(css).not.toContain("decision-success");
    expect(css).not.toContain("audit-animation");
  });
});
