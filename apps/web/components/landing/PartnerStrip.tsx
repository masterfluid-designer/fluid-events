import Image from "next/image";

const partners = [
  { name: "Kkiapay", src: "/images/partenaire-logo/kkiapay-logo.png" },
  { name: "CinetPay", src: "/images/partenaire-logo/cinetpay-logo.jpg" },
  { name: "FedaPay", src: "/images/partenaire-logo/fedapay-logo.jpg" },
  { name: "Orange Money", src: "/images/partenaire-logo/Orange-Money-logo.png" },
  { name: "Moov Money", src: "/images/partenaire-logo/Moov_Money_Flooz-logo.png" },
  { name: "Mastercard", src: "/images/partenaire-logo/Mastercard-logo.webp" },
];

export default function PartnerStrip() {
  return (
    <section className="border-y border-stroke bg-white py-8 dark:border-strokedark dark:bg-blacksection">
      <div className="mx-auto max-w-c-1390 px-4 md:px-8 2xl:px-0">
        <div className="grid grid-cols-2 items-center gap-8 opacity-70 sm:grid-cols-3 lg:grid-cols-6">
          {partners.map((partner) => (
            <div key={partner.name} className="flex h-12 items-center justify-center">
              <Image
                src={partner.src}
                alt={partner.name}
                width={130}
                height={48}
                className="max-h-10 w-auto object-contain grayscale transition hover:grayscale-0"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
