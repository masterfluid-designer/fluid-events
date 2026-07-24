import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Lines from "@/components/Lines";
import { docsContent } from "@/lib/content/docs";

const sections = docsContent.sections;

export const metadata: Metadata = {
  title: "Docs — Fluid Events",
  description:
    "Documentation Fluid Events pour créer, vendre, encaisser et scanner vos événements.",
};

export default function DocsPage() {
  return (
    <>
      <Header />
      <main className="relative overflow-hidden">
        <Lines />
        <section className="pb-16 pt-32 md:pb-20 md:pt-40 lg:pb-24">
          <div className="mx-auto max-w-c-1390 px-4 md:px-8 2xl:px-0">
            <div className="-mx-4 flex flex-wrap gap-y-8">
              <div className="w-full px-4 lg:w-1/4">
                <div className="sticky top-[100px] rounded-lg border border-white bg-white p-4 shadow-solid-4 transition-all dark:border-strokedark dark:bg-blacksection">
                  <ul className="space-y-2">
                    {sections.map((section, index) => (
                      <li key={section.title}>
                        <a
                          href={`#section-${index + 1}`}
                          className={`flex w-full rounded-xs px-3 py-2 text-base text-black dark:text-white ${
                            index === 0
                              ? "bg-stroke dark:bg-blackho"
                              : "hover:bg-stroke dark:hover:bg-blackho"
                          }`}
                        >
                          {section.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="w-full px-4 lg:w-3/4">
                <div className="blog-details-docs rounded-lg bg-white px-8 py-11 shadow-solid-4 dark:bg-blacksection sm:p-[55px] lg:mb-5 lg:px-8 xl:p-[55px]">
                  <span className="mb-4 inline-flex rounded-full bg-zumthor px-4.5 py-1.5 text-sectiontitle font-medium text-black dark:border dark:border-strokedark dark:bg-black dark:text-white">
                    {docsContent.badge}
                  </span>
                  <h1 className="mb-5 text-3xl font-bold text-black dark:text-white xl:text-sectiontitle2">
                    {docsContent.title}
                  </h1>
                  <p className="mb-10 text-base">{docsContent.intro}</p>

                  <div className="space-y-10">
                    {sections.map((section, index) => (
                      <section id={`section-${index + 1}`} key={section.title}>
                        <h2 className="mb-3 text-itemtitle2 font-semibold text-black dark:text-white">
                          {index + 1}. {section.title}
                        </h2>
                        <p>{section.body}</p>
                      </section>
                    ))}
                  </div>

                  <div className="mt-12.5 rounded-lg bg-zumthor p-7.5 dark:bg-black">
                    <h3 className="mb-3 text-metatitle2 font-semibold text-black dark:text-white">
                      {docsContent.helpBlock.title}
                    </h3>
                    <p className="mb-5">{docsContent.helpBlock.text}</p>
                    <Link
                      href="/support"
                      className="inline-flex rounded-full bg-primary px-6 py-3 text-primary-foreground hover:bg-primaryho"
                    >
                      {docsContent.helpBlock.linkLabel}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}