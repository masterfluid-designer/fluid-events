import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

/**
 * Nettoyage du logo/icône SVG uploadé par le Super Admin (page Branding,
 * 2026-07-17) — même principe que `sanitizeBlockHtml` (builder/html-sanitizer.util.ts) :
 * la BDD ne doit jamais contenir que du contenu déjà sûr, nettoyé à
 * l'écriture. Allowlist stricte de tags/attributs de dessin vectoriel —
 * exclut `script`, `foreignObject`, `use`/`image` (référence externe via
 * xlink:href) et tout attribut `on*` (gestionnaire d'événement), qui ne
 * figurent simplement pas dans la liste autorisée.
 */
const ALLOWED_SVG_TAGS = [
  'svg', 'g', 'defs', 'title', 'desc', 'text', 'tspan',
  'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop',
];

const ALLOWED_SVG_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': [
    'id', 'class', 'transform', 'opacity', 'fill', 'stroke', 'stroke-width',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity',
    'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'mask', 'style',
  ],
  svg: ['xmlns', 'viewBox', 'width', 'height', 'preserveAspectRatio'],
  text: ['x', 'y', 'dx', 'dy', 'text-anchor', 'font-family', 'font-size', 'font-weight'],
  tspan: ['x', 'y', 'dx', 'dy'],
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  linearGradient: ['x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform'],
  radialGradient: ['cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits', 'gradientTransform'],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  clipPath: ['clipPathUnits'],
  mask: ['maskUnits'],
};

const ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    fill: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/, /^[a-zA-Z]+$/, /^none$/],
    stroke: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/, /^[a-zA-Z]+$/, /^none$/],
    opacity: [/^[\d.]+$/],
    'stroke-width': [/^[\d.]+(px)?$/],
  },
};

const MAX_SVG_LENGTH = 100_000; // 100 Ko — largement suffisant pour un logo/icône vectoriel

export function sanitizeSvg(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException('Le SVG est vide.');
  }
  if (trimmed.length > MAX_SVG_LENGTH) {
    throw new BadRequestException('Le SVG dépasse la taille maximale autorisée (100 Ko).');
  }
  if (!/^<svg[\s>]/i.test(trimmed) && !/^<\?xml/i.test(trimmed)) {
    throw new BadRequestException('Le fichier ne semble pas être un SVG valide (racine <svg> attendue).');
  }

  const cleaned = sanitizeHtml(trimmed, {
    allowedTags: ALLOWED_SVG_TAGS,
    allowedAttributes: ALLOWED_SVG_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
    // sanitize-html traite <svg> comme un tag HTML générique par défaut (pas
    // de parsing XML) — suffisant ici car on ne garde qu'un sous-ensemble de
    // balises/attributs de dessin, jamais de script ni de référence externe.
    // ⚠️ Bug réel rencontré en vérifiant en conditions réelles : le parser
    // HTML sous-jacent (htmlparser2) mettait en minuscule les noms de
    // balises/attributs par défaut (HTML est insensible à la casse), cassant
    // silencieusement `viewBox`→`viewbox`, `clipPath`→`clippath`,
    // `linearGradient`→`lineargradient`, etc. (tags/attributs à casse mixte,
    // significative en SVG/XML) — l'allowlist ne matchait alors plus rien et
    // ces attributs/balises disparaissaient sans erreur. Corrigé en désactivant
    // la normalisation de casse du parser.
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  }).trim();

  if (!/^<svg[\s>]/i.test(cleaned)) {
    throw new BadRequestException(
      'Le SVG ne contient plus de balise <svg> après nettoyage — vérifiez le fichier fourni.',
    );
  }

  return cleaned;
}
