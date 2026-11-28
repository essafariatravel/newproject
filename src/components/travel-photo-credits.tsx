import type { UiLocale } from "@/lib/ui-i18n";
import photos from "../../public/images/travel/credits.json";

const copy = {
  en: { title: "Photography", note: "Photographs resized and cropped for display. These versions are shared under the original licence." },
  fr: { title: "Crédits photographiques", note: "Photographies redimensionnées et recadrées pour le site. Ces versions sont diffusées sous leur licence d’origine." },
  ar: { title: "حقوق الصور", note: "عُدّلت أبعاد الصور واقتُصّت لتناسب العرض. وتُنشر هذه النسخ بموجب الترخيص الأصلي." },
} as const;

const locations: Record<string, Record<UiLocale, string>> = {
  "dulles-terminal.webp": { en: "Washington Dulles International Airport", fr: "Aéroport international de Washington-Dulles", ar: "مطار واشنطن دالاس الدولي" },
  "cape-greco.webp": { en: "Cape Greco, Cyprus", fr: "Cap Greco, Chypre", ar: "كيب غريكو، قبرص" },
  "st-gallen.webp": { en: "St. Gallen, Switzerland", fr: "Saint-Gall, Suisse", ar: "سانت غالن، سويسرا" },
  "ostuni.webp": { en: "Ostuni, Italy", fr: "Ostuni, Italie", ar: "أوستوني، إيطاليا" },
  "alger.webp": { en: "Algiers Airport, West Terminal", fr: "Aéroport d’Alger, terminal Ouest", ar: "مطار الجزائر، المحطة الغربية" },
};

export function TravelPhotoCredits({ locale }: { locale: UiLocale }) {
  const labels = copy[locale];
  return (
    <details id="photo-sources" className="travel-photo-credits">
      <summary>{labels.title}</summary>
      <ul>{photos.map((photo) => (
        <li key={photo.source}>
          <a href={photo.source}>{locations[photo.variants[0]?.file ?? ""]?.[locale] ?? photo.title}</a>{", "}
          <bdi>{photo.photographer}</bdi>{" ("}
          <a href={photo.licenseURL} rel="license"><bdi>{photo.license}</bdi></a>
          {")"}
        </li>
      ))}</ul>
      <p>{labels.note}</p>
    </details>
  );
}
