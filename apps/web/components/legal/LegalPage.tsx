import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Lines from '@/components/Lines';
import { TO_FILL, type LegalSection } from '@/lib/content/legal';

/**
 * Gabarit commun aux pages légales et institutionnelles (mentions légales,
 * confidentialité, conditions, à propos). Même en-tête/pied de page que le
 * reste du site vitrine, mise en page sobre orientée lecture.
 *
 * Les valeurs encore marquées `À COMPLÉTER` sont mises en évidence visuellement
 * plutôt que masquées : une mention légale incomplète doit se voir, sinon elle
 * finit publiée telle quelle.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}) {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden">
        <Lines />
        <section className="px-4 pb-20 pt-35 md:px-8 lg:pb-25 2xl:px-0">
          <div className="mx-auto max-w-c-1235 px-4 md:px-8 xl:px-0">
            <div className="max-w-3xl">
              <span className="mb-4 inline-flex rounded-full bg-zumthor px-4.5 py-1.5 text-sectiontitle font-medium text-black dark:border dark:border-strokedark dark:bg-blacksection dark:text-white">
                {eyebrow}
              </span>
              <h1 className="mb-5 text-3xl font-bold text-black dark:text-white xl:text-hero">
                {title}
              </h1>
              <p className="text-lg text-waterloo dark:text-manatee">{intro}</p>
            </div>

            <div className="mt-14 flex max-w-3xl flex-col gap-11">
              {sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="mb-4 text-2xl font-semibold text-black dark:text-white">
                    {section.heading}
                  </h2>
                  <div className="flex flex-col gap-3">
                    {section.paragraphs.map((paragraph, i) => (
                      <p
                        key={i}
                        className={`leading-relaxed ${
                          paragraph.includes(TO_FILL)
                            ? 'rounded-lg bg-amber-500/10 px-3 py-2 font-medium text-amber-700 dark:text-amber-400'
                            : 'text-waterloo dark:text-manatee'
                        }`}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {section.bullets && (
                    <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-waterloo dark:text-manatee">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="leading-relaxed">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
