'use client';

import { useState } from 'react';
import { PaymentProviderType } from '@saas-events/types';
import { Eye, EyeOff, ShieldCheck, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FicheProvider } from '@/lib/catalogue-paiement';

/**
 * Saisie des identifiants d'un fournisseur (2026-08-24).
 *
 * ⚠️ **Rien n'est jamais pré-rempli.** Le serveur ne renvoie aucune clé, pas
 * même la publique : une fois soumis, les identifiants ne se relisent plus.
 * Le formulaire s'ouvre donc toujours vide, y compris pour un fournisseur déjà
 * configuré — et le dit, sans quoi l'organisateur croirait avoir tout perdu.
 *
 * Le remplacement est complet ou nul. Autoriser une mise à jour partielle
 * demanderait de deviner ce qui est encore en place, alors que précisément
 * plus rien ne s'affiche.
 */
export interface ValeursCles {
  provider: PaymentProviderType;
  publicKey?: string;
  privateKey: string;
  webhookSecret: string;
  siteId?: string;
  environment?: 'sandbox' | 'live';
  isActive: boolean;
  global: boolean;
}

function demandePublicKey(p: PaymentProviderType): boolean {
  return (
    p === PaymentProviderType.KKIAPAY ||
    p === PaymentProviderType.FEDAPAY ||
    p === PaymentProviderType.PAYPAL
  );
}

function demandeEnvironnement(p: PaymentProviderType): boolean {
  return (
    p === PaymentProviderType.KKIAPAY ||
    p === PaymentProviderType.FEDAPAY ||
    p === PaymentProviderType.PAYPAL
  );
}

/** Champ secret : masqué par défaut, révélable le temps d'une relecture. */
function ChampSecret({
  label,
  aide,
  value,
  onChange,
  required = true,
}: {
  label: string;
  aide: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{aide}</span>
      <span className="relative mt-1.5 block">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 pr-10 font-mono text-sm outline-none focus:border-primary"
        />
        {/*
          Révéler ce qu'on vient de taper : une clé se colle, et une clé collée
          de travers ne se voit qu'au premier paiement raté.
        */}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer' : 'Afficher'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  );
}

export function FormulaireCles({
  fiche,
  dejaConfigure,
  plusieursEvenements,
  urlNotification,
  enCours,
  onSubmit,
  onCancel,
}: {
  fiche: FicheProvider;
  dejaConfigure: boolean;
  plusieursEvenements: boolean;
  urlNotification: string;
  enCours: boolean;
  onSubmit: (valeurs: ValeursCles) => void;
  onCancel: () => void;
}) {
  const provider = fiche.id as PaymentProviderType;

  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [siteId, setSiteId] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [isActive, setIsActive] = useState(true);
  const [global, setGlobal] = useState(false);

  const libelle = (nom: string) =>
    fiche.identifiants.find((i) => i.champ === nom)?.chezLeFournisseur ?? nom;
  const ou = (nom: string) => fiche.identifiants.find((i) => i.champ === nom)?.ou ?? '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          provider,
          publicKey: demandePublicKey(provider) ? publicKey.trim() : undefined,
          privateKey: privateKey.trim(),
          webhookSecret: webhookSecret.trim(),
          siteId: provider === PaymentProviderType.CINETPAY ? siteId.trim() : undefined,
          environment: demandeEnvironnement(provider) ? environment : undefined,
          isActive,
          global,
        });
      }}
      className="flex flex-col gap-4"
    >
      {dejaConfigure && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <span>
            Des identifiants {fiche.nom} sont déjà en place. Ils ne peuvent pas être réaffichés —
            ce formulaire les <strong>remplacera entièrement</strong>. Laissez-le si vous ne
            souhaitez rien changer.
          </span>
        </div>
      )}

      {provider === PaymentProviderType.CINETPAY && (
        <label className="block">
          <span className="text-sm font-medium">Identifiant du site</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {libelle('Identifiant du site')} — {ou('Identifiant du site')}
          </span>
          <input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            required
            autoComplete="off"
            className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          />
        </label>
      )}

      {demandePublicKey(provider) && (
        <label className="block">
          <span className="text-sm font-medium">Clé publique</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {libelle('Clé publique')} — {ou('Clé publique')}
          </span>
          <input
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          />
        </label>
      )}

      <ChampSecret
        label="Clé privée"
        aide={`${libelle('Clé privée')} — ${ou('Clé privée')}`}
        value={privateKey}
        onChange={setPrivateKey}
      />

      <ChampSecret
        label="Secret webhook"
        aide={`${libelle('Secret webhook')} — ${ou('Secret webhook')}`}
        value={webhookSecret}
        onChange={setWebhookSecret}
      />

      {demandeEnvironnement(provider) && (
        <label className="block">
          <span className="text-sm font-medium">Mode</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Le bac à sable n’encaisse rien : il sert à vérifier tout le parcours avant d’ouvrir
            la vente.
          </span>
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as 'sandbox' | 'live')}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="sandbox">Bac à sable (test)</option>
            <option value="live">Production (encaisse réellement)</option>
          </select>
        </label>
      )}

      {/*
        L'URL que le fournisseur doit rappeler. Elle est affichée ici plutôt
        que dans la documentation seule : c'est au moment de remplir le
        formulaire qu'on en a besoin, pas trois écrans plus tôt.
      */}
      <div className="rounded-lg border border-border bg-secondary/40 p-3">
        <div className="text-xs font-medium">URL de notification à déclarer chez {fiche.nom}</div>
        <code className="mt-1 block break-all font-mono text-xs text-muted-foreground">
          {urlNotification}
        </code>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-border pt-4">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            <span className="font-medium">Activer ce moyen de paiement</span>
            <span className="block text-xs text-muted-foreground">
              Un seul fournisseur encaisse à la fois : activer celui-ci désactivera l’autre.
            </span>
          </span>
        </label>

        {plusieursEvenements && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={global}
              onChange={(e) => setGlobal(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="font-medium">Appliquer à tous mes événements</span>
              <span className="block text-xs text-muted-foreground">
                Ces identifiants seront recopiés sur chacun de vos événements, et sur ceux que
                vous créerez ensuite.
              </span>
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Chiffrés avant enregistrement, jamais réaffichés.
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={enCours}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? 'Enregistrement…' : 'Vérifier et enregistrer'}
        </Button>
      </div>
    </form>
  );
}
