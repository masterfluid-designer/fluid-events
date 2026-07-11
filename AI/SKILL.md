# SKILL.md — Fluid Events

> Ce fichier est le point d'entrée pour toute IA (Copilot, Claude Code, ChatGPT, Cursor…) qui va travailler sur ce dépôt. Il doit être lu **avant** de générer du code. Il répond à la question : *"qu'est-ce que je dois savoir sur ce projet pour produire du code cohérent ?"*
>
> Pour le reste du contexte, voir aussi : `RULES.md` (règles à respecter), `ARCHITECTURE.md` (organisation technique), `BUSINESS.md` (règles métier), `ROADMAP.md` (priorités).

---

## 1. Contexte produit en une phrase

Fluid Events est un SaaS de billetterie et gestion d'événements destiné à des organisateurs africains, permettant de créer un événement, vendre des billets, encaisser des paiements locaux (mobile money / providers type Kkiapay, CinetPay, FedaPay), générer des QR codes de contrôle d'accès, et scanner les entrées via une PWA mobile — sans compétence technique côté organisateur.

## 2. Stack technique

| Couche | Techno | Détail |
|---|---|---|
| Frontend | Next.js 15 | App Router, Tailwind v4, shadcn/ui, React Query |
| Backend | NestJS | Modules, Guards, DTO + class-validator |
| ORM / DB | Prisma + PostgreSQL | Migrations versionnées |
| Queue | Redis + BullMQ | Jobs asynchrones (PDF, email, WhatsApp) |
| Storage | S3-compatible (RustFS en dev, Supabase Storage en prod) | |
| Email | SMTP (Mailpit en dev, Resend en prod) | |
| Monorepo | Turborepo + pnpm workspaces | `apps/web`, `apps/api` |
| Auth | Google OAuth (client/manager) + login scanner dédié (JWT événementiel) | |

Détails complets → `ARCHITECTURE.md`.

## 3. Comment le backend est organisé

Chaque domaine métier est un **module NestJS** avec le pattern suivant :

```
<domaine>/
├── <domaine>.module.ts
├── <domaine>.controller.ts
├── <domaine>.service.ts
└── dto/
```

Avant de créer un nouveau module ou une nouvelle route, vérifie s'il existe déjà un service utilitaire réutilisable (voir tableau section 4) — plusieurs briques logiques ont été codées **avant** leurs controllers, dans une logique "services purs d'abord, endpoints ensuite".

## 4. Services déjà prêts à réutiliser

Ne réinvente pas ces briques, elles existent déjà et encodent des règles de sécurité/métier importantes :

| Service | Rôle | Fichier |
|---|---|---|
| `StockService` | Décrément atomique du stock de billets (`$transaction`) | `payments/stock.service.ts` |
| `WebhookIdempotencyService` | Empêche le double traitement d'un webhook paiement | `payments/webhook-idempotency.service.ts` |
| `ClientProfileService` | Enrichissement du profil client après paiement | `payments/client-profile.service.ts` |
| `TicketDesignService` | Génération QR, `buildHtml` sanitisé, `verifyQr` | `ticket-design/ticket-design.service.ts` |
| `PhoneService` | Validation/normalisation E.164, extraction du provider mobile money | `notifications/phone.service.ts` |
| `AuditService` | Écriture des logs d'audit (`AuditLog`) | `common/audit.service.ts` |
| `CryptoService` | Chiffrement AES-256-GCM (clés providers paiement) | `common/crypto.service.ts` |
| `ScanDecision` | Fonction pure de décision scan (valide / déjà scanné / expiré) | `scanner/scan-decision.ts` |
| `BlocksSchema` (Zod) | Validation des blocs du Event Builder | `builder/blocks.schema.ts` |
| `BuilderConcurrency` | Logique de contrôle de concurrence optimiste (`lastKnownUpdatedAt`) | `builder/builder.concurrency.ts` |

Quand tu codes un controller pour un de ces domaines, ton rôle est principalement de **brancher** ces services existants derrière des Guards, pas de réécrire leur logique.

## 5. Conventions de code à respecter

- Toute route protégée : `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` explicite.
- Toute entrée utilisateur passe par un DTO avec `class-validator`, ou par un schéma Zod pour le contenu libre (blocs builder).
- Toute opération touchant au stock, à une commande ou à un paiement est encapsulée dans un `$transaction` Prisma.
- Les réponses HTTP suivent le format d'erreur standard décrit dans `api.md` / `ARCHITECTURE.md` (`statusCode`, `message`, `error`, `timestamp`, `path`).
- Jamais de logique de sécurité côté Next.js middleware — c'est de l'UX uniquement, la sécurité vit dans les Guards NestJS.

## 6. Légende des statuts utilisés dans la documentation

- ✅ Fonctionnel / codé
- 🟡 Module créé mais vide, ou dépendances prêtes, à implémenter
- ❌ Pas commencé
- 🔴🟡🟢 (priorité) Haute / Moyenne / Basse

## 7. Où chercher quoi

| Besoin | Fichier |
|---|---|
| Règle de sécurité, convention obligatoire | `RULES.md` |
| Diagrammes, flux de données, infra, dossiers | `ARCHITECTURE.md` |
| Comportement métier (billets, paiement, QR, commissions…) | `BUSINESS.md` |
| Ce qui est prévu, dans quel ordre | `ROADMAP.md` |
| Détail des endpoints REST | `api.md` (à conserver comme référence API) |

## 8. Glossaire rapide

- **Event** : un événement, créé et possédé par un unique `Manager` (contrainte V1 : 1 manager = 1 event).
- **Ticket** (type de billet) : catégorie de billet avec prix/stock (ex : VIP, Standard).
- **Order / OrderItem** : commande d'achat, contient un ou plusieurs billets.
- **Scanner** : compte dédié (login séparé) qui scanne les QR codes à l'entrée.
- **Manager** : organisateur, propriétaire d'un événement.
- **Intent** (`intentKey`) : jeton `timestamp:secret` utilisé pour sécuriser le tunnel d'achat avant paiement.
