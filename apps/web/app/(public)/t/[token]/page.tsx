import { notFound } from 'next/navigation';
import { CalendarDays, MapPin, Ticket as TicketIcon, CheckCircle2, Clock } from 'lucide-react';

/**
 * Page du billet ouverte par lien signé (lot 1, 2026-08-22).
 *
 * Un acheteur sans compte n'a pas de tableau de bord : ce lien, reçu par
 * email, EST son accès. La page ne demande rien, ne propose aucune connexion,
 * et n'affiche que la commande que le jeton désigne.
 *
 * Rendue côté serveur, sans cache : un billet scanné doit se voir comme
 * scanné à l'ouverture suivante, pas trente secondes plus tard.
 */
export const dynamic = 'force-dynamic';

interface ItemBillet {
  id: string;
  ticketName: string;
  hasTicket: boolean;
  isScanned: boolean;
  qrCode: string | null;
}

interface CommandeParLien {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  paidAt: string | null;
  event: {
    title: string;
    slug: string;
    startDate: string;
    venueName: string | null;
    city: string | null;
  };
  items: ItemBillet[];
}

async function lireCommande(token: string): Promise<CommandeParLien | null> {
  /*
   * Appel SERVEUR : depuis le conteneur web, l'API n'est pas joignable via le
   * port mappé sur l’hôte. INTERNAL_API_URL porte l’adresse interne ; en dev
   * natif elle est absente et l’adresse publique suffit. Le piège a déjà
   * coûté un déploiement (voir DEPLOYMENT.md).
   */
  const base =
    process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  const reponse = await fetch(`${base}/api/payments/ticket/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!reponse.ok) return null;
  const corps = await reponse.json().catch(() => null);
  return corps?.success ? (corps.data as CommandeParLien) : null;
}

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default async function PageBilletParLien({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const commande = await lireCommande(token);

  // Lien invalide, expiré ou commande disparue : une seule et même page. La
  // distinction ne servirait qu'à qui cherche à fabriquer un jeton.
  if (!commande) notFound();

  const payee = commande.status === 'PAID';
  const lieu = [commande.event.venueName, commande.event.city].filter(Boolean).join(', ');

  return (
    <main className="min-h-svh bg-alabaster dark:bg-blackho">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10 md:px-8 md:py-14">
        <header className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-terracotta dark:text-accent-terracotta-dark">
            {payee ? 'Billets confirmés' : 'Commande en attente'}
          </span>
          <h1 className="font-serif text-2xl font-semibold leading-tight md:text-3xl">
            {commande.event.title}
          </h1>
          <div className="flex flex-col gap-1 text-sm text-waterloo dark:text-manatee">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" />
              {formaterDate(commande.event.startDate)}
            </span>
            {lieu && (
              <span className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0" />
                {lieu}
              </span>
            )}
          </div>
        </header>

        {!payee && (
          /*
           * Le paiement n'est pas confirmé. On ne dit pas « échec » : le
           * webhook peut arriver quelques secondes après le retour du
           * prestataire, et annoncer un échec à quelqu'un qui vient de payer
           * serait faux autant qu'alarmant.
           */
          <div className="flex items-start gap-3 rounded-xl border border-stroke bg-white p-4 text-sm dark:border-strokedark dark:bg-blacksection">
            <Clock className="mt-0.5 size-4 shrink-0 text-waterloo dark:text-manatee" />
            <p className="text-waterloo dark:text-manatee">
              Votre paiement n’est pas encore confirmé. Rechargez cette page dans une minute — si
              rien ne change, votre banque ou votre opérateur ne l’a pas validé, et aucun montant
              n’a été débité.
            </p>
          </div>
        )}

        <section className="flex flex-col gap-3">
          {commande.items.map((item, index) => (
            <article
              key={item.id}
              className="flex flex-col gap-4 rounded-2xl border border-stroke bg-white p-5 shadow-solid-2 dark:border-strokedark dark:bg-blacksection sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-waterloo dark:text-manatee">
                  Billet {index + 1} sur {commande.items.length}
                </span>
                <span className="font-serif text-lg font-semibold">{item.ticketName}</span>

                {item.isScanned ? (
                  <span className="mt-1 flex items-center gap-1.5 text-sm text-waterloo dark:text-manatee">
                    <CheckCircle2 className="size-4 shrink-0" />
                    Déjà utilisé à l’entrée
                  </span>
                ) : (
                  <span className="mt-1 flex items-center gap-1.5 text-sm text-waterloo dark:text-manatee">
                    <TicketIcon className="size-4 shrink-0" />
                    {item.hasTicket ? 'Valable — à présenter à l’entrée' : 'Billet en préparation'}
                  </span>
                )}
              </div>

              {item.qrCode && (
                /*
                 * Le QR est la pièce réellement contrôlée. Fond blanc en dur,
                 * y compris en thème sombre : un lecteur ne lit pas un code
                 * inversé, et le billet s'ouvre souvent en pleine nuit devant
                 * une entrée.
                 */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.qrCode}
                  alt={`Code du billet ${item.ticketName}`}
                  className="size-36 shrink-0 self-center rounded-xl bg-white p-2 sm:size-32"
                />
              )}
            </article>
          ))}
        </section>

        <footer className="flex flex-col gap-1 border-t border-stroke pt-4 text-xs text-waterloo dark:border-strokedark dark:text-manatee">
          <span>
            Commande {commande.orderNumber} ·{' '}
            {new Intl.NumberFormat('fr-FR').format(commande.totalAmount)} {commande.currency}
          </span>
          <span>
            Gardez ce lien : il ouvre vos billets sans mot de passe, jusqu’à deux mois après
            l’événement.
          </span>
        </footer>
      </div>
    </main>
  );
}
