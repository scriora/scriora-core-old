import { defaultLocale, t } from "../locale";

export default function HomePage() {
  const copy = t(defaultLocale);
  const stages = [copy.stageDraft, copy.stageApprove, copy.stagePublish];

  return (
    <main className="min-h-svh bg-ink text-paper">
      <header className="flex items-center justify-between px-[6vw] py-5">
        <a href="/" className="flex items-center gap-3 text-paper no-underline">
          <img
            src="/scriora-mark.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 object-cover"
          />
          <span className="font-[family-name:var(--font-display)] text-lg tracking-wide">
            {copy.brand}
          </span>
        </a>
        <p className="m-0 text-sm text-muted">{copy.pronunciation}</p>
      </header>

      <section className="flex min-h-[calc(100svh-4.5rem)] flex-col justify-end px-[6vw] pb-16 pt-10">
        <p className="m-0 max-w-[22ch] font-[family-name:var(--font-display)] text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.95] font-medium tracking-[-0.03em]">
          {copy.headlineLead}
          <br />
          {copy.headlineTail}
        </p>
        <p className="mt-8 max-w-[36rem] text-lg leading-relaxed text-muted">
          {copy.lede}
        </p>

        <ol className="mt-12 m-0 flex list-none flex-wrap items-center gap-0 p-0 text-sm tracking-[0.18em] uppercase text-gold">
          {stages.map((stage, index) => (
            <li key={stage} className="flex items-center">
              {index > 0 ? (
                <span
                  aria-hidden
                  className="mx-4 h-px w-10 bg-gold-bright/70 sm:w-16"
                />
              ) : null}
              {stage}
            </li>
          ))}
        </ol>

        <div className="mt-14 flex flex-wrap items-center gap-6">
          <p className="m-0 max-w-[28rem] text-sm leading-relaxed text-muted">
            {copy.composeStatus}
          </p>
          <a
            className="inline-flex min-h-11 items-center border border-gold px-5 text-sm text-gold no-underline"
            href="/classic"
          >
            {copy.classicOpen}
          </a>
          <a
            className="inline-flex min-h-11 items-center border border-gold px-5 text-sm text-gold no-underline"
            href="https://github.com/scriora/scriora-core"
          >
            {copy.source}
          </a>
        </div>
      </section>
    </main>
  );
}
