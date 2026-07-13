'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * ColorField — Picker HEX strict (aucun composant équivalent shadcn/ui
 * dans ce repo) : `<input type="color">` + saisie texte manuelle, l'un
 * synchronisant l'autre. `onChange` ne reçoit une valeur que si elle est
 * un HEX 6 chiffres valide (sinon `undefined`, cohérent avec la validation
 * Zod stricte côté backend — RULES.md §4/§6).
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? '');

  useEffect(() => setText(value ?? ''), [value]);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_PATTERN.test(text) ? text : '#000000'}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          className="size-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5"
        />
        <Input
          value={text}
          placeholder="#000000"
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            onChange(HEX_PATTERN.test(next) ? next : undefined);
          }}
        />
      </div>
    </div>
  );
}
