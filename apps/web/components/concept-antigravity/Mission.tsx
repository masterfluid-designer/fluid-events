import ScrubText from "@/components/motion/ScrubText";

export default function Mission() {
  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-[1600px] px-6 md:px-12">
        <ScrubText
          text="Fluid Events donne aux organisateurs africains les moyens de vendre, encaisser en Mobile Money et scanner leurs entrées, sans écrire une ligne de code."
          className="font-space-grotesk text-3xl font-medium leading-snug tracking-tight text-black md:text-5xl md:leading-snug dark:text-white"
        />
      </div>
    </section>
  );
}
