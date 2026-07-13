import { describe, expect, it } from 'vitest';
import { sanitizeBlockHtml } from './html-sanitizer.util';

describe('sanitizeBlockHtml()', () => {
  it('retire les balises <script>', () => {
    const out = sanitizeBlockHtml('<p>Bonjour</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>Bonjour</p>');
  });

  it('retire les gestionnaires d’événements inline (onerror, onclick...)', () => {
    const out = sanitizeBlockHtml('<img src="x" onerror="alert(1)"><a href="#" onclick="steal()">lien</a>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onclick');
  });

  it('retire les URLs javascript:', () => {
    const out = sanitizeBlockHtml('<a href="javascript:alert(1)">clique</a>');
    expect(out).not.toContain('javascript:');
  });

  it('retire les balises non autorisées (iframe, object, style, svg)', () => {
    const out = sanitizeBlockHtml(
      '<iframe src="https://evil.example"></iframe><object data="x"></object><style>body{display:none}</style><svg onload="alert(1)"></svg>',
    );
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('<svg');
  });

  it('conserve le contenu texte/structure autorisé', () => {
    const out = sanitizeBlockHtml(
      '<h2>Titre</h2><p>Texte <strong>important</strong> et <a href="https://example.com">un lien</a>.</p><ul><li>Un</li><li>Deux</li></ul>',
    );
    expect(out).toContain('<h2>Titre</h2>');
    expect(out).toContain('<strong>important</strong>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('<li>Un</li>');
  });

  it('ajoute rel="noopener noreferrer" et target="_blank" aux liens', () => {
    const out = sanitizeBlockHtml('<a href="https://example.com">lien</a>');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('retire les data: URLs sur les images (autre vecteur XSS classique)', () => {
    const out = sanitizeBlockHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(out).not.toContain('data:text/html');
  });
});
