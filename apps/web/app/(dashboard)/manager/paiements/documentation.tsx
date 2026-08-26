'use client';

import { useState } from 'react';
import { ExternalLink, BookOpen, AlertTriangle, KeyRound, Route, Globe2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CATALOGUE, urlWebhook, type IdentifiantCatalogue } from '@/lib/catalogue-paiement';

/**
 * Documentation intégrée des moyens de paiement (2026-08-24).
 *
 * Un organisateur ouvrait un formulaire réclamant « secret webhook » sans
 * savoir ce que c'est ni où le prendre. Il repartait — et son événement
 * restait publié sans pouvoir encaisser.
 *
 * La documentation vit donc SUR la page de configuration, pas dans un guide
 * séparé : on la lit d'une main pendant qu'on remplit de l'autre. Le sélecteur
 * est délibérément indépendant du fournisseur choisi plus haut — on vient
 * souvent ici pour comparer avant de décider.
 */
export function Documentation({ apiBase }: { apiBase: string }) {
  const [choisi, setChoisi] = useState<IdentifiantCatalogue>(CATALOGUE[0].id);
  const f = CATALOGUE.find((x) => x.id === choisi)!;

  return (
    <Card className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BookOpen className="size-4 text-muted-foreground" />
            Comprendre les moyens de paiement
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce que chacun couvre, comment il se comporte à l’achat, et où récupérer ses
            identifiants.
          </p>
        </div>

        <label className="text-sm">
          <span className="sr-only">Moyen de paiement à consulter</span>
          <select
            value={choisi}
            onChange={(e) => setChoisi(e.target.value as IdentifiantCatalogue)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:border-primary"
          >
            {CATALOGUE.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
                {x.configurable ? '' : ' (via Stripe)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-t border-border pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold">{f.nom}</h3>
          {f.configurable ? (
            <Badge variant="secondary">Configurable ici</Badge>
          ) : (
            <Badge variant="warning">Pas de clés — arrive avec Stripe</Badge>
          )}
        </div>
        <p className="mt-1.5 text-sm">{f.resume}</p>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Globe2 className="size-3.5" />
              Couverture
            </dt>
            <dd className="mt-1 text-sm">{f.zone}</dd>
          </div>
          <div className="rounded-lg border border-border p-3">
            <dt className="text-xs font-medium text-muted-foreground">Moyens acceptés</dt>
            <dd className="mt-1 text-sm">{f.moyens.join(', ')}</dd>
          </div>
          <div className="rounded-lg border border-border p-3">
            <dt className="text-xs font-medium text-muted-foreground">Devises</dt>
            <dd className="mt-1 text-sm">{f.devises}</dd>
          </div>
        </dl>

        <section className="mt-5">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Route className="size-3.5 text-muted-foreground" />
            Ce que vit votre acheteur
          </h4>
          <ol className="mt-2 flex flex-col gap-1.5">
            {f.parcours.map((etape, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{i + 1}.</span>
                <span>{etape}</span>
              </li>
            ))}
          </ol>
        </section>

        {f.identifiants.length > 0 && (
          <section className="mt-5">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <KeyRound className="size-3.5 text-muted-foreground" />
              Les identifiants à récupérer
            </h4>
            {/* Le nom de NOTRE champ en face du nom que lui donne le
                fournisseur : c'est là que se perdent la plupart des gens. */}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Notre champ</th>
                    <th className="py-1.5 pr-4 font-medium">Son nom chez {f.nom}</th>
                    <th className="py-1.5 font-medium">Où le trouver</th>
                  </tr>
                </thead>
                <tbody>
                  {f.identifiants.map((i) => (
                    <tr key={i.champ} className="border-t border-border align-top">
                      <td className="py-2 pr-4 font-medium">{i.champ}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{i.chezLeFournisseur}</td>
                      <td className="py-2 text-muted-foreground">{i.ou}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-5">
          <h4 className="text-sm font-semibold">Marche à suivre</h4>
          <ol className="mt-2 flex flex-col gap-1.5">
            {f.etapes.map((etape, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="font-semibold tabular-nums text-primary">{i + 1}.</span>
                <span>{etape}</span>
              </li>
            ))}
          </ol>
        </section>

        {f.configurable && (
          <section className="mt-5">
            <h4 className="text-sm font-semibold">URL de notification à déclarer</h4>
            <code className="mt-2 block break-all rounded-lg border border-border bg-secondary/40 p-3 font-mono text-xs">
              {urlWebhook(String(f.id), apiBase)}
            </code>
          </section>
        )}

        {f.aSavoir && f.aSavoir.length > 0 && (
          <section className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              Bon à savoir
            </h4>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs text-amber-800 dark:text-amber-300">
              {f.aSavoir.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-4">
          {f.liens.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {l.libelle}
              <ExternalLink className="size-3.5" />
            </a>
          ))}
        </div>
      </div>
    </Card>
  );
}
