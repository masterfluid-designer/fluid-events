import type { Block, BlockType } from '@saas-events/types';

/**
 * BlockRenderer — Rend les blocs Builder (CDC §11) sur la page publique.
 *
 * Rendu minimal cohérent avec ce que le Builder permet réellement d'éditer
 * (apps/web/app/(dashboard)/manager/builder/page.tsx) : hero/texte/billets ont
 * un rendu dédié, les autres types (image/vidéo/galerie/countdown/faq/
 * schedule/testimonials/sponsors) un rendu générique titre + contenu — pas de
 * sur-conception pour des blocs dont le Builder n'édite encore que ces deux
 * champs communs.
 */

interface PublicTicket {
  id: string;
  name: string;
  price: number;
  currency: string;
  stock: number;
  stockSold: number;
}

export function BlockRenderer({
  blocks,
  tickets,
  isPublished,
  slug,
  BuyButton,
}: {
  blocks: Block[];
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  BuyButton: (props: { slug: string; ticketId: string; highlighted: boolean }) => React.JSX.Element;
}) {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);

  return (
    <>
      {sorted.map((block) => (
        <BlockItem
          key={block.id}
          block={block}
          tickets={tickets}
          isPublished={isPublished}
          slug={slug}
          BuyButton={BuyButton}
        />
      ))}
    </>
  );
}

function BlockItem({
  block,
  tickets,
  isPublished,
  slug,
  BuyButton,
}: {
  block: Block;
  tickets: PublicTicket[];
  isPublished: boolean;
  slug: string;
  BuyButton: (props: { slug: string; ticketId: string; highlighted: boolean }) => React.JSX.Element;
}) {
  const textAlign = block.styles?.textAlign;

  if (block.type === 'hero') {
    const imageUrl = block.props.imageUrl as string | undefined;
    return (
      <div
        className="relative h-64 w-full bg-[repeating-linear-gradient(135deg,#EFEDE7_0_14px,#E7E4DE_14px_28px)] dark:bg-[repeating-linear-gradient(135deg,#24221F_0_14px,#1B1A18_14px_28px)] md:h-85"
        style={{
          backgroundColor: block.styles?.backgroundColor || undefined,
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute inset-x-6 bottom-5 text-white md:inset-x-9 md:bottom-6" style={{ textAlign }}>
          <h1 className="font-serif text-3xl leading-[1.05] md:text-4xl">
            {(block.props.title as string) || ''}
          </h1>
        </div>
      </div>
    );
  }

  if (block.type === 'text') {
    return (
      <p
        className="max-w-150 whitespace-pre-line px-6 py-4 text-[15px] leading-relaxed text-waterloo dark:text-manatee md:px-9"
        style={{ textAlign }}
      >
        {(block.props.content as string) || ''}
      </p>
    );
  }

  if (block.type === 'tickets') {
    return (
      <div className="flex flex-col gap-3 px-6 py-8 md:px-9">
        <div className="mb-1 text-xs font-bold uppercase tracking-[0.04em] text-manatee dark:text-waterloo">
          Billets
        </div>
        {tickets.length === 0 ? (
          <div className="rounded-xl border border-stroke p-6 text-center text-sm text-muted-foreground dark:border-strokedark">
            Aucun billet en vente pour le moment.
          </div>
        ) : (
          tickets.map((ticket, index) => {
            const available = ticket.stock - ticket.stockSold;
            const soldOut = available <= 0;
            const highlighted = index === 0 && !soldOut;
            return (
              <div
                key={ticket.id}
                className={`flex items-center justify-between gap-4 rounded-xl border p-5 ${
                  soldOut ? 'opacity-50' : ''
                } ${highlighted ? 'border-black dark:border-white' : 'border-stroke dark:border-strokedark'}`}
              >
                <div>
                  <div className="font-semibold">{ticket.name}</div>
                  <div className="mt-0.5 text-xs text-manatee dark:text-waterloo">
                    {soldOut
                      ? 'Épuisé'
                      : `${available} place${available > 1 ? 's' : ''} restante${available > 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-bold">
                    {new Intl.NumberFormat('fr-FR', {
                      style: 'currency',
                      currency: ticket.currency,
                    }).format(Number(ticket.price))}
                  </div>
                  {soldOut || !isPublished ? (
                    <span className="rounded-lg border border-stroke px-4 py-2.5 text-sm font-semibold text-manatee dark:border-strokedark">
                      Indisponible
                    </span>
                  ) : (
                    <BuyButton slug={slug} ticketId={ticket.id} highlighted={highlighted} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  // Rendu générique (image/video/gallery/countdown/faq/schedule/testimonials/sponsors) —
  // seuls titre + contenu sont éditables sur ces types dans le Builder.
  return (
    <div className="px-6 py-4 md:px-9" style={{ textAlign }}>
      {(block.props.title as string) && (
        <div className="text-lg font-semibold">{block.props.title as string}</div>
      )}
      {(block.props.content as string) && (
        <div className="mt-1 text-sm text-waterloo dark:text-manatee">
          {block.props.content as string}
        </div>
      )}
      {block.type === 'image' && (block.props.imageUrl as string) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.props.imageUrl as string} alt="" className="mt-3 max-h-96 w-full rounded-xl object-cover" />
      )}
    </div>
  );
}
