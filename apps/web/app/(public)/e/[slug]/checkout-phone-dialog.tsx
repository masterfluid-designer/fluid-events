'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AsYouType, type CountryCode } from 'libphonenumber-js';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CountryPicker } from '@/components/ui/country-picker';
import { apiPost, ApiError } from '@/lib/api';
import { COUNTRIES } from '@/lib/countries';

/**
 * CheckoutPhoneDialog — Collecte le numéro de l'acheteur entre
 * l'authentification Google et l'ouverture du paiement (décision produit
 * 2026-08-16).
 *
 * SANS vérification par code, contrairement au `PhoneVerificationGate` des
 * Manager : ce numéro n'ouvre aucun accès, il sert à pré-remplir le
 * formulaire du prestataire et à joindre l'acheteur. Exiger un code
 * WhatsApp ici ajouterait une étape au moment le plus fragile du tunnel — et
 * dépendrait d'un canal que la production n'a pas toujours.
 *
 * Jamais affiché à un client qui a déjà un numéro en base : l'appelant
 * (`ResumeCheckout`) le saute dans ce cas, pour qu'un achat suivant aille
 * droit au paiement.
 */
export function CheckoutPhoneDialog({
  onSaved,
  onCancel,
}: {
  onSaved: (phone: string) => void;
  onCancel: () => void;
}) {
  const [countryIso2, setCountryIso2] = useState(COUNTRIES[0].iso2);
  const [nationalDigits, setNationalDigits] = useState('');

  const selectedCountry = COUNTRIES.find((c) => c.iso2 === countryIso2) ?? COUNTRIES[0];
  const fullPhone = `+${selectedCountry.dialCode}${nationalDigits}`;

  // Même formatage par pays que le gate Manager (libphonenumber-js) — un
  // espacement par groupes de 2 ne convient qu'à une partie des pays.
  const formattedNational = useMemo(() => {
    const formatter = new AsYouType(countryIso2 as CountryCode);
    return formatter.input(nationalDigits);
  }, [nationalDigits, countryIso2]);

  const savePhone = useMutation({
    mutationFn: () =>
      apiPost<{ phone: string; country: string | null }>('/api/auth/phone', { phone: fullPhone }),
    onSuccess: (data) => onSaved(data.phone),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Numéro invalide, vérifiez la saisie.'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-solid-2">
        <div className="mb-4 flex items-center gap-2">
          <Phone className="size-5 text-primary" />
          <h2 className="font-serif text-lg">Votre numéro</h2>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            savePhone.mutate();
          }}
          className="space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            Pour recevoir vos billets et finaliser le paiement. Aucun code à saisir.
          </p>
          <div className="flex gap-2">
            <CountryPicker value={countryIso2} onChange={setCountryIso2} />
            <Input
              required
              autoFocus
              type="tel"
              placeholder="90 00 00 00"
              value={formattedNational}
              onChange={(e) => setNationalDigits(e.target.value.replace(/\D/g, ''))}
              className="flex-1"
            />
          </div>
          <Button type="submit" className="w-full" disabled={savePhone.isPending}>
            {savePhone.isPending ? 'Enregistrement...' : 'Continuer vers le paiement'}
          </Button>
          {/* Annulable, contrairement au gate Manager : on est dans un tunnel
              d'achat, pas devant une obligation de compte — un visiteur doit
              pouvoir renoncer sans se retrouver piégé sur un écran opaque. */}
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-center text-xs text-muted-foreground underline"
          >
            Annuler
          </button>
        </form>
      </div>
    </div>
  );
}
