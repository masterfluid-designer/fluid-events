# RULES.md — Règles obligatoires (IA & développeurs)

> Ces règles sont non négociables. Toute génération de code (humaine ou IA) qui les enfreint doit être corrigée avant merge. Si une règle semble bloquer une fonctionnalité demandée, il faut lever le doute avec l'équipe plutôt que de la contourner silencieusement.

---

## 1. Règle d'or : la sécurité vit dans NestJS, jamais ailleurs

- Row Level Security (RLS) Supabase est **désactivé volontairement** (bypass via `service_role_key`).
- Conséquence directe : **chaque route** qui touche à une ressource appartenant à quelqu'un (event, ticket, commande…) DOIT faire un contrôle d'`ownership` explicite dans le service NestJS (ex : `event.managerId === user.id`), sans exception.
- Le middleware Next.js ne fait que de l'UX (redirection si pas connecté, etc.) — il ne remplace **jamais** un Guard NestJS.
- Toute nouvelle route protégée doit déclarer explicitement `JwtAuthGuard` + `RolesGuard` + `@Roles(...)`.

## 2. Atomicité obligatoire sur stock / paiement / scan

- Décrément de stock, création de commande, création de billets/QR codes, marquage "scanné" : toujours dans un `$transaction` Prisma atomique.
- Interdiction de faire un `findFirst` puis un `update` séparé sur une donnée sensible à la concurrence (stock, `isScanned`) sans lock transactionnel — c'est la porte ouverte à la survente ou au double scan.

## 3. Idempotence des webhooks

- Tout webhook paiement doit être idempotent, garanti par une contrainte unique en base (identifiant provider + identifiant transaction externe).
- Un webhook déjà traité doit renvoyer `200 OK` sans ré-exécuter les effets de bord (pas de double création de tickets, pas de double email).
- Retry attendu côté provider : 3 tentatives, backoff exponentiel — le endpoint doit rester rapide et sans effet de bord dupliqué à chaque retry.

## 4. QR code & scanner

- Signature HS256 obligatoire sur tout QR code émis.
- La réponse de `/api/scan/validate` ne doit **jamais** contenir d'email ou de téléphone — uniquement les données strictement nécessaires à l'agent scanner (nom, type de billet, heure de scan).
- Anti double-scan : le passage à `SCANNED` doit être un verrou atomique (transaction), pas une simple vérification applicative avant écriture.
- Expiration : un QR n'est plus valide après `event.endDate + 24h`.
- Cible de performance : réponse < 500ms sur `/api/scan/validate` — éviter les appels réseau superflus (email, jobs synchrones) dans ce chemin critique.

## 5. Concurrence optimiste sur le Builder

- Toute sauvegarde de blocs (`PUT /api/builder/:eventId/blocks`) doit vérifier `lastKnownUpdatedAt` contre la valeur en base.
- En cas de mismatch → `409 Conflict`, jamais d'écrasement silencieux du travail d'un autre éditeur.

## 6. Validation des entrées

- Contenu structuré typé (DTO de controller) → `class-validator` + `ValidationPipe` global.
- Contenu libre / dynamique (blocs du builder) → schéma Zod dédié (`blocks.schema.ts`), jamais de `any` non validé stocké en base.
- Toute URL d'image (design billet, blocs builder) doit passer par une whitelist de domaines autorisés.

## 7. Format API & rate limiting

- Toute erreur renvoyée respecte le format standard : `statusCode`, `message`, `error`, `timestamp`, `path`.
- Rate limits à respecter/faire respecter :
  - Général : 100 req/s par IP
  - API : 50 req/s par IP
  - Auth : 5 tentatives/minute par email
- Ne pas contourner ces limites pour "faciliter les tests" en code de production.

## 8. Contrainte produit V1 : 1 Manager = 1 Event

- Ne pas introduire de logique multi-événements par manager tant que ce n'est pas explicitement demandé dans `ROADMAP.md`.
- Ne pas sur-architecturer pour du multi-tenant qui n'est pas dans le périmètre V1.

## 9. Secrets & environnement

- Aucun secret réel ne doit être commité (`.env` reste local/CI, jamais dans le dépôt public).
- Les valeurs placeholders documentées dans `ARCHITECTURE.md`/`cahier-des-charges.md` sont pour le dev local uniquement, jamais réutilisées en prod.
- Les clés de configuration provider paiement (`PaymentProviderConfig`) sont stockées chiffrées (AES-256-GCM via `CryptoService`) — ne jamais les logger en clair.

## 10. Tests

- Toute logique critique nouvellement ajoutée (stock, paiement, webhook, scan) doit être accompagnée de tests (unitaires au minimum sur les fonctions de décision pures type `ScanDecision`).
- Ne pas merger de logique de transaction financière sans test couvrant le cas de concurrence (double achat simultané, double webhook).

## 11. Incohérences connues entre documents — à trancher avant de coder dessus

Ces points diffèrent selon les documents fournis ; à vérifier dans le code réel / schema.prisma avant de s'appuyer dessus dans un nouveau développement :

- **Port backend** : `:4000` (`architecture.md`) vs `:3001` (`cahier-des-charges.md` + `.env`). → à priori `3001` fait foi (confirmé par `.env`), `architecture.md` semble daté.
- **Clé d'idempotence webhook** : `@unique(paymentId, externalId)` (`api.md`/`architecture.md`) vs `@unique([provider, transactionId])` (schéma Prisma décrit dans `cahier-des-charges.md`). → vérifier `schema.prisma` pour la vérité terrain, puis mettre à jour `api.md` en conséquence.

## 12. Ce qu'il ne faut jamais faire

- Ne jamais désactiver un Guard "temporairement pour tester" dans du code qui part en review/merge.
- Ne jamais faire confiance à une donnée envoyée par le client PWA scanner sans revalider la signature HS256 côté serveur.
- Ne jamais renvoyer de données personnelles (email/téléphone) dans une réponse consommée par un rôle qui n'y a pas droit (ex : Scanner).
- Ne jamais faire d'écriture stock/commande hors transaction.
- Ne jamais introduire une dépendance à MinIO (déprécié) — rester sur l'abstraction S3-compatible (RustFS/Supabase Storage).

## 13. Piège `JwtService.sign()` — `signOptions` du module toujours fusionné

`AuthModule` configure `JwtModule.registerAsync()` **sans** `signOptions.expiresIn`
par défaut, et c'est volontaire. `JwtService.sign(payload, options?)` (voir
`@nestjs/jwt`) fusionne TOUJOURS `this.options.signOptions` avec les options
passées à l'appel — même quand l'appelant ne passe aucune option. Si le module
avait un `expiresIn` par défaut, tout payload embarquant déjà son propre `exp`
(cas de `AuthService.generateClientToken`/`generateScannerToken`, durée de
session événementielle calculée dynamiquement) ferait planter `jsonwebtoken`
("Bad options.expiresIn option the payload already has an exp property").
Passer `{ expiresIn: undefined }` à l'appel NE corrige PAS le problème : le
spread `{...defaults, ...options}` conserve la clé `expiresIn` avec une valeur
`undefined`, ce que `jsonwebtoken` rejette aussi ("expiresIn should be a
number of seconds or string representing a timespan").
→ Toute nouvelle route qui appelle `jwtService.sign()` avec un payload portant
déjà `exp` doit soit garder ce module sans `signOptions.expiresIn` par défaut,
soit utiliser un module JWT séparé configuré sans ce défaut.
