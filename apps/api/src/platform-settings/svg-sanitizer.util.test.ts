/**
 * Tests unitaires — sanitizeSvg()
 * Nettoyage du logo/icône SVG uploadé (page Branding Admin, 2026-07-17).
 */
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { sanitizeSvg } from './svg-sanitizer.util';

describe('sanitizeSvg()', () => {
  it('conserve un SVG simple valide (path + attributs autorisés)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#123456"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('<svg');
    expect(result).toContain('<path');
    expect(result).toContain('d="M0 0h24v24H0z"');
    expect(result).toContain('fill="#123456"');
  });

  it('supprime un <script> intégré (XSS stocké)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle cx="5" cy="5" r="5"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<circle');
  });

  it('supprime un gestionnaire d\'événement onload sur la racine <svg>', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle cx="5" cy="5" r="5"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('onload');
    expect(result).not.toContain('alert');
  });

  it('supprime un <foreignObject> (peut embarquer du HTML/script)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><script>alert(1)</script></foreignObject><rect width="10" height="10"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('foreignObject');
    expect(result).not.toContain('script');
    expect(result).toContain('<rect');
  });

  it('supprime une balise <use> (référence externe via xlink:href)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="https://evil.example/x.svg#y"/><rect width="10" height="10"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('<use');
    expect(result).not.toContain('evil.example');
  });

  it('rejette une entrée vide', () => {
    expect(() => sanitizeSvg('')).toThrow(BadRequestException);
    expect(() => sanitizeSvg('   ')).toThrow(BadRequestException);
  });

  it('rejette une entrée qui ne commence pas par <svg>', () => {
    expect(() => sanitizeSvg('<div>pas un svg</div>')).toThrow(BadRequestException);
    expect(() => sanitizeSvg('ceci n\'est pas du tout un svg')).toThrow(BadRequestException);
  });

  it('rejette une entrée dépassant la taille maximale (100 Ko)', () => {
    const oversized = `<svg xmlns="http://www.w3.org/2000/svg">${'a'.repeat(100_001)}</svg>`;
    expect(() => sanitizeSvg(oversized)).toThrow(BadRequestException);
  });

  it('conserve viewBox (attribut à casse mixte, jamais mis en minuscule)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="5" cy="5" r="5"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('viewBox="0 0 24 24"');
    expect(result).not.toContain('viewbox=');
  });

  it('conserve les balises à casse mixte (clipPath, linearGradient)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1"><stop offset="0" stop-color="#fff"/></linearGradient><clipPath id="c1"><rect width="10" height="10"/></clipPath></defs><circle cx="5" cy="5" r="5" fill="url(#g1)"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('<linearGradient');
    expect(result).toContain('<clipPath');
    expect(result).not.toContain('<lineargradient');
    expect(result).not.toContain('<clippath');
  });

  it('conserve un texte de logo (<text>) au lieu de le laisser fuir en texte brut', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" font-family="Georgia">Fluid Events</text></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('<text');
    expect(result).toContain('Fluid Events');
  });

  it('accepte un préambule XML avant la racine <svg>', () => {
    const svg = '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5"/></svg>';
    const result = sanitizeSvg(svg);
    expect(result).toContain('<svg');
    expect(result).toContain('<circle');
  });
});
