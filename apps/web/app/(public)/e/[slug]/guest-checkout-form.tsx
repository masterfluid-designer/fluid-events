'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Formulaire d'achat sans compte (lot 1, 2026-08-22).
 *
 * Remplace la connexion Google quand l'organisateur a choisi le régime « sans
 * compte ». On demande le minimum qui permette d'envoyer le billet et de
 * joindre l'acheteur — rien de plus : chaque champ supplémentaire sur un
 * formulaire d'achat coûte des ventes.
 *
 * L'adresse email porte le billet. C'est le seul moyen pour l'acheteur de le
 * retrouver, puisqu'il n'aura pas de tableau de bord — d'où l'insistance de la
 * mention sous le champ.
 */
export interface IdentiteInvite {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export function GuestCheckoutForm({
  onSubmit,
  onCancel,
  pending,
}: {
  onSubmit: (identite: IdentiteInvite) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const complet = firstName.trim() && lastName.trim() && email.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!complet || pending) return;
        onSubmit({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-event text-lg leading-tight">Vos coordonnées</h3>
        <p className="text-sm text-waterloo dark:text-manatee">
          Pas de compte à créer. Vos billets vous seront envoyés par email.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          Prénom
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            placeholder="Ama"
            className="rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-blacksection"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Nom
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            placeholder="Dzikpé"
            className="rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-blacksection"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        Email
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="vous@exemple.com"
          className="rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-blacksection"
        />
        <span className="text-xs text-waterloo dark:text-manatee">
          Vos billets partent à cette adresse — vérifiez-la bien.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        Téléphone <span className="text-xs text-waterloo dark:text-manatee">(facultatif)</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          placeholder="+228 90 00 00 00"
          className="rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-blacksection"
        />
      </label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-full border border-stroke px-5 py-2.5 text-sm font-semibold transition-colors hover:border-black disabled:opacity-50 dark:border-strokedark dark:hover:border-white"
        >
          Retour
        </button>
        <button
          type="submit"
          disabled={!complet || pending}
          className="btn-accent inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? 'Préparation…' : 'Continuer vers le paiement'}
        </button>
      </div>
    </form>
  );
}
