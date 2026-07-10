import Image from "next/image";
import Link from "next/link";
import SectionHeader from "@/components/landing/SectionHeader";

const posts = [
  {
    title: "Préparer une billetterie Mobile Money pour un concert",
    image: "/images/blog/blog-01.png",
    href: "/docs",
  },
  {
    title: "Réduire la fraude avec des QR codes signés",
    image: "/images/blog/blog-02.png",
    href: "/docs",
  },
  {
    title: "Organiser une entrée fluide avec un scanner PWA",
    image: "/images/blog/blog-03.png",
    href: "/support",
  },
];

export default function Blog() {
  return (
    <section className="py-20 lg:py-25 xl:py-30">
      <div className="mx-auto max-w-c-1315 px-4 md:px-8 xl:px-0">
        <SectionHeader
          headerInfo={{
            title: "RESSOURCES",
            subtitle: "Guides pour mieux vendre vos événements",
            description:
              "Quelques points pratiques pour préparer la vente, le paiement et l'accès le jour J.",
          }}
        />

        <div className="mt-12.5 grid gap-7.5 md:grid-cols-3 lg:mt-15 xl:mt-20">
          {posts.map((post) => (
            <article
              key={post.title}
              className="group overflow-hidden rounded-lg bg-white shadow-solid-10 dark:bg-blacksection"
            >
              <Link href={post.href} className="relative block aspect-[370/240]">
                <Image
                  src={post.image}
                  alt={post.title}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              </Link>
              <div className="p-7.5">
                <h3 className="mb-4 text-metatitle2 font-semibold text-black dark:text-white">
                  <Link href={post.href} className="hover:text-primary">
                    {post.title}
                  </Link>
                </h3>
                <p className="mb-5">
                  Des conseils courts pour passer d'une page événement à une
                  entrée contrôlée sans friction.
                </p>
                <Link href={post.href} className="font-medium text-primary">
                  Lire le guide
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
