/**
 * Nationality dictionary (Phase 2-Final, Correction 6).
 *
 * Stable identifiers = ISO 3166-1 alpha-2 codes ("DZ"), never display
 * labels. Display names are UI-localized (en/fr/ar) through explicit labels
 * or the platform's ISO country names. Algeria is the platform default.
 */
import { countryName } from "@/lib/country-names";

export interface Nationality {
  code: string;
  en: string;
  fr?: string;
  ar?: string;
}

export const DEFAULT_NATIONALITY = "DZ";

/** Fully localized (en/fr/ar) entries — primary set, shown first. */
const LOCALIZED: Nationality[] = [
  { code: "AF", en: "Afghanistan", fr: "Afghanistan", ar: "أفغانستان" },
  { code: "DZ", en: "Algeria", fr: "Algérie", ar: "الجزائر" },
  { code: "AO", en: "Angola", fr: "Angola", ar: "أنغولا" },
  { code: "AR", en: "Argentina", fr: "Argentine", ar: "الأرجنتين" },
  { code: "AM", en: "Armenia", fr: "Arménie", ar: "أرمينيا" },
  { code: "AU", en: "Australia", fr: "Australie", ar: "أستراليا" },
  { code: "AT", en: "Austria", fr: "Autriche", ar: "النمسا" },
  { code: "BH", en: "Bahrain", fr: "Bahreïn", ar: "البحرين" },
  { code: "BD", en: "Bangladesh", fr: "Bangladesh", ar: "بنغلاديش" },
  { code: "BE", en: "Belgium", fr: "Belgique", ar: "بلجيكا" },
  { code: "BJ", en: "Benin", fr: "Bénin", ar: "بنين" },
  { code: "BR", en: "Brazil", fr: "Brésil", ar: "البرازيل" },
  { code: "BG", en: "Bulgaria", fr: "Bulgarie", ar: "بلغاريا" },
  { code: "BF", en: "Burkina Faso", fr: "Burkina Faso", ar: "بوركينا فاسو" },
  { code: "CM", en: "Cameroon", fr: "Cameroun", ar: "الكاميرون" },
  { code: "CA", en: "Canada", fr: "Canada", ar: "كندا" },
  { code: "TD", en: "Chad", fr: "Tchad", ar: "تشاد" },
  { code: "CN", en: "China", fr: "Chine", ar: "الصين" },
  { code: "KM", en: "Comoros", fr: "Comores", ar: "جزر القمر" },
  { code: "CG", en: "Congo", fr: "Congo", ar: "الكونغو" },
  { code: "HR", en: "Croatia", fr: "Croatie", ar: "كرواتيا" },
  { code: "CZ", en: "Czech Republic", fr: "Tchéquie", ar: "التشيك" },
  { code: "DK", en: "Denmark", fr: "Danemark", ar: "الدنمارك" },
  { code: "DJ", en: "Djibouti", fr: "Djibouti", ar: "جيبوتي" },
  { code: "EG", en: "Egypt", fr: "Égypte", ar: "مصر" },
  { code: "ET", en: "Ethiopia", fr: "Éthiopie", ar: "إثيوبيا" },
  { code: "FI", en: "Finland", fr: "Finlande", ar: "فنلندا" },
  { code: "FR", en: "France", fr: "France", ar: "فرنسا" },
  { code: "GM", en: "Gambia", fr: "Gambie", ar: "غامبيا" },
  { code: "GE", en: "Georgia", fr: "Géorgie", ar: "جورجيا" },
  { code: "DE", en: "Germany", fr: "Allemagne", ar: "ألمانيا" },
  { code: "GH", en: "Ghana", fr: "Ghana", ar: "غانا" },
  { code: "GR", en: "Greece", fr: "Grèce", ar: "اليونان" },
  { code: "GN", en: "Guinea", fr: "Guinée", ar: "غينيا" },
  { code: "IN", en: "India", fr: "Inde", ar: "الهند" },
  { code: "ID", en: "Indonesia", fr: "Indonésie", ar: "إندونيسيا" },
  { code: "IQ", en: "Iraq", fr: "Irak", ar: "العراق" },
  { code: "IE", en: "Ireland", fr: "Irlande", ar: "أيرلندا" },
  { code: "IT", en: "Italy", fr: "Italie", ar: "إيطاليا" },
  { code: "CI", en: "Ivory Coast", fr: "Côte d'Ivoire", ar: "ساحل العاج" },
  { code: "JO", en: "Jordan", fr: "Jordanie", ar: "الأردن" },
  { code: "KE", en: "Kenya", fr: "Kenya", ar: "كينيا" },
  { code: "KW", en: "Kuwait", fr: "Koweït", ar: "الكويت" },
  { code: "LB", en: "Lebanon", fr: "Liban", ar: "لبنان" },
  { code: "LY", en: "Libya", fr: "Libye", ar: "ليبيا" },
  { code: "MY", en: "Malaysia", fr: "Malaisie", ar: "ماليزيا" },
  { code: "ML", en: "Mali", fr: "Mali", ar: "مالي" },
  { code: "MR", en: "Mauritania", fr: "Mauritanie", ar: "موريتانيا" },
  { code: "MA", en: "Morocco", fr: "Maroc", ar: "المغرب" },
  { code: "MZ", en: "Mozambique", fr: "Mozambique", ar: "موزمبيق" },
  { code: "NL", en: "Netherlands", fr: "Pays-Bas", ar: "هولندا" },
  { code: "NE", en: "Niger", fr: "Niger", ar: "النيجر" },
  { code: "NG", en: "Nigeria", fr: "Nigéria", ar: "نيجيريا" },
  { code: "NO", en: "Norway", fr: "Norvège", ar: "النرويج" },
  { code: "OM", en: "Oman", fr: "Oman", ar: "عُمان" },
  { code: "PK", en: "Pakistan", fr: "Pakistan", ar: "باكستان" },
  { code: "PS", en: "Palestine", fr: "Palestine", ar: "فلسطين" },
  { code: "PL", en: "Poland", fr: "Pologne", ar: "بولندا" },
  { code: "PT", en: "Portugal", fr: "Portugal", ar: "البرتغال" },
  { code: "QA", en: "Qatar", fr: "Qatar", ar: "قطر" },
  { code: "RO", en: "Romania", fr: "Roumanie", ar: "رومانيا" },
  { code: "RU", en: "Russia", fr: "Russie", ar: "روسيا" },
  { code: "RW", en: "Rwanda", fr: "Rwanda", ar: "رواندا" },
  { code: "SA", en: "Saudi Arabia", fr: "Arabie saoudite", ar: "السعودية" },
  { code: "SN", en: "Senegal", fr: "Sénégal", ar: "السنغال" },
  { code: "RS", en: "Serbia", fr: "Serbie", ar: "صربيا" },
  { code: "SI", en: "Slovenia", fr: "Slovénie", ar: "سلوفينيا" },
  { code: "SO", en: "Somalia", fr: "Somalie", ar: "الصومال" },
  { code: "ZA", en: "South Africa", fr: "Afrique du Sud", ar: "جنوب أفريقيا" },
  { code: "KR", en: "South Korea", fr: "Corée du Sud", ar: "كوريا الجنوبية" },
  { code: "ES", en: "Spain", fr: "Espagne", ar: "إسبانيا" },
  { code: "SD", en: "Sudan", fr: "Soudan", ar: "السودان" },
  { code: "SE", en: "Sweden", fr: "Suède", ar: "السويد" },
  { code: "CH", en: "Switzerland", fr: "Suisse", ar: "سويسرا" },
  { code: "SY", en: "Syria", fr: "Syrie", ar: "سوريا" },
  { code: "TG", en: "Togo", fr: "Togo", ar: "توغو" },
  { code: "TN", en: "Tunisia", fr: "Tunisie", ar: "تونس" },
  { code: "TR", en: "Türkiye", fr: "Turquie", ar: "تركيا" },
  { code: "AE", en: "United Arab Emirates", fr: "Émirats arabes unis", ar: "الإمارات" },
  { code: "GB", en: "United Kingdom", fr: "Royaume-Uni", ar: "المملكة المتحدة" },
  { code: "US", en: "United States", fr: "États-Unis", ar: "الولايات المتحدة" },
  { code: "YE", en: "Yemen", fr: "Yémen", ar: "اليمن" },
];

/** Additional ISO-3166 entries; ICU supplies their FR / AR labels. */
const EXTRA: Nationality[] = [
  "Albania:AL", "Andorra:AD", "Anguilla:AI", "Antigua and Barbuda:AG", "Azerbaijan:AZ",
  "Bahamas:BS", "Barbados:BB", "Belarus:BY", "Belize:BZ", "Bermuda:BM", "Bolivia:BO",
  "Bosnia and Herzegovina:BA", "Botswana:BW", "Brunei:BN", "Burundi:BI", "Cambodia:KH",
  "Cape Verde:CV", "Central African Republic:CF", "Chile:CL", "Colombia:CO",
  "Costa Rica:CR", "Cuba:CU", "Cyprus:CY", "Democratic Republic of the Congo:CD",
  "Dominica:DM", "Dominican Republic:DO", "Ecuador:EC", "El Salvador:SV",
  "Equatorial Guinea:GQ", "Eritrea:ER", "Estonia:EE", "Eswatini:SZ", "Fiji:FJ",
  "Gabon:GA", "Grenada:GD", "Guatemala:GT", "Guinea-Bissau:GW", "Guyana:GY",
  "Haiti:HT", "Honduras:HN", "Hong Kong:HK", "Hungary:HU", "Iceland:IS", "Iran:IR",
  "Israel:IL", "Jamaica:JM", "Japan:JP", "Kazakhstan:KZ", "Kiribati:KI",
  "Kyrgyzstan:KG", "Laos:LA", "Latvia:LV", "Lesotho:LS", "Liberia:LR",
  "Liechtenstein:LI", "Lithuania:LT", "Luxembourg:LU", "Macedonia:MK",
  "Madagascar:MG", "Malawi:MW", "Maldives:MV", "Malta:MT", "Marshall Islands:MH",
  "Mauritius:MU", "Mexico:MX", "Micronesia:FM", "Moldova:MD", "Monaco:MC",
  "Mongolia:MN", "Montenegro:ME", "Myanmar:MM", "Namibia:NA", "Nauru:NR",
  "Nepal:NP", "New Zealand:NZ", "Nicaragua:NI", "North Korea:KP", "Palau:PW",
  "Panama:PA", "Papua New Guinea:PG", "Paraguay:PY", "Peru:PE", "Philippines:PH",
  "Saint Kitts and Nevis:KN", "Saint Lucia:LC", "Saint Vincent and the Grenadines:VC",
  "Samoa:WS", "San Marino:SM", "São Tomé and Príncipe:ST", "Seychelles:SC",
  "Sierra Leone:SL", "Singapore:SG", "Slovakia:SK", "Solomon Islands:SB",
  "South Sudan:SS", "Sri Lanka:LK", "Suriname:SR", "Taiwan:TW", "Tajikistan:TJ",
  "Tanzania:TZ", "Thailand:TH", "Timor-Leste:TL", "Tonga:TO", "Trinidad and Tobago:TT",
  "Turkmenistan:TM", "Tuvalu:TV", "Uganda:UG", "Ukraine:UA", "Uruguay:UY",
  "Uzbekistan:UZ", "Vanuatu:VU", "Venezuela:VE", "Vietnam:VN", "Zambia:ZM",
  "Zimbabwe:ZW",
].map((s) => {
  const [en = "", code = ""] = s.split(":");
  return { en, code };
});

export const NATIONALITIES: Nationality[] = [
  ...[...LOCALIZED].sort((a, b) => a.en.localeCompare(b.en)),
  ...[...EXTRA].sort((a, b) => a.en.localeCompare(b.en)),
];

const BY_CODE = new Map(NATIONALITIES.map((n) => [n.code, n]));

export function isValidNationality(code: string): boolean {
  return BY_CODE.has(code.trim().toUpperCase());
}

/** Localized display label; safe fallback to the stored code/raw text. */
export function nationalityLabel(code: string | null | undefined, locale: "en" | "fr" | "ar"): string {
  if (!code) return "—";
  const n = BY_CODE.get(code.trim().toUpperCase());
  if (!n) return code; // legacy free-text value stays untouched
  return (locale === "fr" ? n.fr : locale === "ar" ? n.ar : n.en)
    ?? countryName({ name: n.en, iso2: n.code }, locale);
}
