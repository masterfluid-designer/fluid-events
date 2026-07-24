"use client";

import { ArrowRight } from "lucide-react";
import HorizontalScrollCards, {
  type HorizontalCardItem,
} from "@/components/motion/HorizontalScrollCards";
import Typewriter from "@/components/motion/Typewriter";
import { blogContent } from "@/lib/content/landing/blog";

const POSTS = blogContent.posts;

export default function BlogCarousel() {
  const items: HorizontalCardItem[] = POSTS.map((post) => {
    const Icon = post.icon;
    return {
      id: post.id,
      caption: null,
      content: (
        <a href="#" className="group block">
          <div
            className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-linear-to-br ${post.gradient}`}
          >
            <Icon className="size-20 text-white/90" strokeWidth={1.5} />
          </div>
          <div className="mt-4">
            <h4 className="font-space-grotesk text-itemtitle2 font-semibold text-black transition-colors group-hover:text-primary dark:text-white">
              {post.title}
            </h4>
            <p className="mt-2 text-metatitle text-manatee dark:text-waterloo">
              {post.date} · {post.category}
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-metatitle font-medium text-primary">
              {blogContent.readLabel}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </a>
      ),
    };
  });

  return (
    <HorizontalScrollCards
      items={items}
      cardWidthClass="w-[70vw] max-w-[320px]"
      showCaption={false}
      header={
        <div className="flex w-full flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-accent-terracotta dark:text-accent-terracotta-dark text-sectiontitle font-bold uppercase tracking-[0.06em]">
              {blogContent.eyebrow}
            </span>
            <h2 className="font-space-grotesk mt-3 max-w-xl text-3xl font-medium text-black md:text-5xl dark:text-white">
              <Typewriter once segments={[{ text: blogContent.title }]} />
            </h2>
          </div>
          <a
            href="#"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-stroke px-5 py-2.5 text-regular font-medium text-black transition duration-300 ease-in-out hover:border-primary hover:text-primary dark:border-strokedark dark:text-white"
          >
            {blogContent.viewMoreLabel}
            <ArrowRight className="size-4" />
          </a>
        </div>
      }
    />
  );
}
