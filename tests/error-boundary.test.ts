import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorView } from "@/components/error-view";
import Loading from "@/app/loading";
import { request } from "./helpers/request";
describe("localized safe boundaries", () => {
  it("renders retry and home recovery in Arabic without showing server details", () => {
    const html=renderToStaticMarkup(React.createElement(ErrorView,{locale:"ar",retry:()=>undefined}));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("المحاولة مجددًا");
    expect(html).toContain("العودة إلى الرئيسية");
    expect(html).toContain('type="button"');
  });
  it("announces loading in the current interface language", async () => {
    request.cookie="fr";
    try {
      const html=renderToStaticMarkup(await Loading());
      expect(html).toContain('role="status"');
      expect(html).toContain("Chargement de votre espace");
    } finally {request.cookie="";}
  });
});
