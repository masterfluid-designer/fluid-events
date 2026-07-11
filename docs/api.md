# API Endpoints — Fluid Events

Ce document décrit uniquement les routes **effectivement implémentées** dans
`apps/api/src`. Pour la conception complète prévue (tickets, paiements,
scanner, builder, dashboards), voir [cahier-des-charges.md](./cahier-des-charges.md)
— ces modules ne sont **pas encore développés** (aucun controller au moment
de la rédaction).

## ✅ Implémenté

### Authentication (`AuthController`, préfixe `/api/auth`)

#### GET /api/auth/google
Déclenche le flow OAuth Google (redirection, pas de body). Accepte un query
param optionnel `?eventSlug=` propagé via `state`.

#### GET /api/auth/google/callback
Callback OAuth Google. Pose des cookies httpOnly (`access_token`,
`refresh_token`) puis redirige vers `${FRONTEND_URL}/auth/callback`.

#### POST /api/auth/login/scanner
Connexion email/password réservée aux comptes scanner.

**Body:**
```json
{ "email": "scanner@example.com", "password": "..." }
```

#### POST /api/auth/refresh
Rafraîchit la paire access/refresh token.

**Body:**
```json
{ "refreshToken": "..." }
```

#### POST /api/auth/logout
Efface les cookies d'authentification (`access_token`, `refresh_token`).

### Events (`EventsController`, préfixe `/api/events`)

#### POST /api/events
Créer un événement.

**Body:**
```json
{
  "title": "Conférence Tech 2026",
  "description": "...",
  "slug": "tech-conf-2026",
  "startDate": "2026-08-15T09:00:00Z",
  "endDate": "2026-08-15T18:00:00Z",
  "totalCapacity": 500,
  "image": "url-supabase-storage"
}
```

⚠️ Cette route n'a actuellement **aucun guard d'authentification** dans le
code (`events.controller.ts`) — à sécuriser avant mise en production.

#### GET /api/events/public/:slug
Récupérer la page publique d'un événement par son slug (route publique,
`@Public()`). Note : le slug est bien après `public/`, pas avant.

#### GET /api/events/:id
Récupérer un événement par id.

#### GET /api/events
Lister tous les événements.

## 🚧 Prévu, pas encore implémenté

Ces routes existent dans le cahier des charges mais n'ont **aucun controller
NestJS correspondant** dans `apps/api/src` pour l'instant :

- `POST /api/tickets/purchase`, `GET /api/tickets/:id`
- `POST /api/payments/init`, `POST /api/payments/webhook/:provider`
- `POST /api/scan/validate`
- `PUT /api/builder/:eventId/blocks`
- `GET /api/dashboard/manager/:eventId`, `GET /api/dashboard/client`, `GET /api/dashboard/admin`

Ne pas les appeler depuis le frontend tant qu'ils ne sont pas livrés.

## Errors

### Standard Response Format (NestJS par défaut)

```json
{
  "statusCode": 400,
  "message": "Erreur détaillée",
  "error": "Bad Request"
}
```

### Common Status Codes

- **200**: Success
- **201**: Created
- **400**: Bad Request (validation error)
- **401**: Unauthorized (missing token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **429**: Too Many Requests (rate limit — `ThrottlerModule`)
- **500**: Internal Server Error
