import sanitizeHtml from 'sanitize-html';
import { isAllowedImageUrl } from '../storage/image-whitelist.util';

/**
 * Nettoyage du contenu du bloc `html` (Event Builder) — décision produit
 * 2026-07-13. Ce bloc est le seul endroit du Builder où le Manager saisit du
 * HTML brut, rendu ensuite via `dangerouslySetInnerHTML` sur la page
 * publique : sans nettoyage, n'importe quel visiteur exécuterait le script
 * d'un Manager malveillant (XSS stocké). Nettoyé ICI, à l'écriture, pas
 * seulement au rendu — même principe que la whitelist d'URL d'image
 * (RULES.md §6) : la BDD ne doit jamais contenir que du contenu déjà sûr.
 */
const ALLOWED_TAGS = [
  'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'img',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  '*': ['class'],
};

export function sanitizeBlockHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    // Jamais de script/style/iframe/object/svg — même raisonnement que le
    // rejet des SVG sur l'upload d'image (image-whitelist.util.ts).
    disallowedTagsMode: 'discard',
    // Un <img> dont le src ne pointe pas vers le stockage whitelisté est
    // retiré entièrement (RULES.md §6) — sans ce filtre, ce bloc était le
    // seul endroit du Builder à laisser passer une URL d'image externe
    // arbitraire (tracking pixel, hotlinking) malgré la whitelist déjà
    // appliquée partout ailleurs (logo, couverture, galerie, sponsors...).
    exclusiveFilter: (frame) => frame.tag === 'img' && !isAllowedImageUrl(frame.attribs.src ?? ''),
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}
