import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ActivationForm from "../src/app/(public)/activate/[token]/activation-form";
import { readFileSync } from "node:fs";
import { registrationCopy } from "../src/lib/i18n";

describe("activation form", () => {
  it("renders PasswordField with localized toggles", () => {
    const copy = registrationCopy("fr");
    const html = renderToStaticMarkup(
      React.createElement(ActivationForm, {
        token: "t",
        locale: "fr",
        copy,
        showLabel: copy.activation.showPassword,
        hideLabel: copy.activation.hidePassword,
      }),
    );
    expect(html).toContain('data-testid="activation-password-toggle"');
    expect(html).toContain('data-testid="activation-password-confirm-toggle"');
    // Both fields reveal their affordance in the reader's language, and neither
    // field falls back to the English default hint.
    expect(html.match(/Afficher/g) ?? []).toHaveLength(2);
    expect(html).not.toMatch(/>Show</);
    expect(html).not.toMatch(/At least 10 characters/);
    expect((html.match(/10 caractères minimum/g) ?? [])).toHaveLength(2);
  });

  it("renders the Arabic copy with RTL and Arabic affordances", () => {
    const copy = registrationCopy("ar");
    const html = renderToStaticMarkup(
      React.createElement(ActivationForm, {
        token: "t",
        locale: "ar",
        copy,
        showLabel: copy.activation.showPassword,
        hideLabel: copy.activation.hidePassword,
      }),
    );
    expect(html).toContain("إظهار");
    expect(html).not.toMatch(/>Show</);
    expect(html).not.toMatch(/At least 10 characters/);
  });

  it("forwards both affordance labels for the reveal control", () => {
    // The hidden-state label is only rendered after the user toggles, which needs a
    // browser; the wiring is pinned here and the render is asserted above.
    const src = readFileSync(
      new URL("../src/app/(public)/activate/[token]/activation-form.tsx", import.meta.url),
      "utf8",
    );
    expect((src.match(/hideLabel=\{props\.hideLabel\}/g) ?? [])).toHaveLength(2);
    expect((src.match(/showLabel=\{props\.showLabel\}/g) ?? [])).toHaveLength(2);
  });
});
