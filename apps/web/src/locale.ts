export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function direction(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export const messages = {
  en: {
    brand: "Scriora",
    pronunciation: "skree-OR-ah · سكريورا",
    headlineLead: "AI works.",
    headlineTail: "Human controls.",
    lede: "Open-source social growth OS. Schedule with truth. Grow from evidence. Official APIs only — LinkedIn first.",
    stageDraft: "Draft",
    stageApprove: "Approve",
    stagePublish: "Publish",
    composeStatus:
      "Compose is planned. The gate is already in the domain: a draft cannot skip approval to go live.",
    source: "Source",
  },
  ar: {
    brand: "Scriora",
    pronunciation: "skree-OR-ah · سكريورا",
    headlineLead: "الذكاء يعمل.",
    headlineTail: "والإنسان يتحكم.",
    lede: "نظام مفتوح المصدر لنمو الشبكات الاجتماعية. جدولة بصدق. نمو من الدليل. واجهات رسمية فقط — لنكدإن أولاً.",
    stageDraft: "مسودة",
    stageApprove: "موافقة",
    stagePublish: "نشر",
    composeStatus:
      "التأليف مخطط له. البوابة موجودة في النطاق: المسودة لا تُنشر دون موافقة.",
    source: "المصدر",
  },
} as const;

export function t(locale: Locale) {
  return messages[locale];
}
