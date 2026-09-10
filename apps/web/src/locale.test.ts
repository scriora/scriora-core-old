import { describe, expect, it } from "vitest";
import { defaultLocale, direction, t } from "./locale.js";

describe("locale factory", () => {
  it("switches Classic copy between English and Arabic", () => {
    expect(defaultLocale).toBe("en");
    expect(direction("en")).toBe("ltr");
    expect(direction("ar")).toBe("rtl");
    expect(t("ar").source).toBe("المصدر");
    expect(t("en").addImage).toBe("Add image");
    expect(t("ar").connectLinkedIn).toBe("ربط LinkedIn");
  });
});
