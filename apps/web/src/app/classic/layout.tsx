import type { ReactNode } from "react";
import { ClassicShell } from "../../classic/ClassicShell";
import { ClassicI18nProvider } from "../../classic/i18n";

export default function ClassicLayout({ children }: { children: ReactNode }) {
  return (
    <ClassicI18nProvider>
      <ClassicShell>{children}</ClassicShell>
    </ClassicI18nProvider>
  );
}
