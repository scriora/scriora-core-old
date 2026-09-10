import { describe, expect, it } from "vitest";
import { defaultLocale, direction, t } from "./locale.js";

describe("locale factory", () => {
  it("uses English LTR until next-intl is installed", () => {
    expect(defaultLocale).toBe("en");
    expect(direction("en")).toBe("ltr");
    expect(direction("ar")).toBe("rtl");
    expect(t("ar").source).toBe("المصدر");
  });
});
