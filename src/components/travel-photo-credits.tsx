import type { UiLocale } from "@/lib/ui-i18n";
import photos from "../../public/images/travel/credits.json";

const copy = {
  en: { title: "Photography", places: ["Washington Dulles International Airport", "Cape Greco, Cyprus", "St. Gallen, Switzerland", "Ostuni, Italy"], note: "Photographs resized and cropped for display. These versions are shared under the original licence." },
  fr: { title: "Crédits photographiques", places: ["Aéroport international de Washington-Dulles", "Cap Greco, Chypre", "Saint-Gall, Suisse", "Ostuni, Italie"], note: "Photographies redimensionnées et recadrées pour le site. Ces versions sont diffusées sous leur licence d’origine." },
  ar: { title: "حقوق الصور", places: ["مطار واشنطن دالاس الدولي", "كيب غريكو، قبرص", "سانت غالن، سويسرا", "أوستوني، إيطاليا"], note: "عُدّلت أبعاد الصور واقتُصّت لتناسب العرض. وتُنشر هذه النسخ بموجب الترخيص الأصلي." },
} as const;

export function TravelPhotoCredits({ locale }: { locale: UiLocale }) {
  const labels = copy[locale];
  return (
    <details className="travel-photo-credits">
      <summary>{labels.title}</summary>
      <ul>{photos.map((photo, index) => (
        <li key={photo.source}>
          <span>{labels.places[index]}</span>{" · "}<a href={photo.source}><bdi>{photo.photographer}</bdi></a>{" · "}
          <a href={photo.licenseURL} rel="license"><bdi>{photo.license}</bdi></a>
        </li>
      ))}</ul>
      <p>{labels.note}</p>
    </details>
  );
}
