# API Endpoints — Fluid Events

## Authentication

### POST /api/auth/google
Authentification via Google OAuth

**Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "CLIENT"
  }
}
```

### GET /api/auth/me
Récupérer le profil utilisateur courant (JwtAuthGuard)

## Events

### GET /api/events
Lister tous les événements

### POST /api/events
Créer un événement (Manager, JwtAuthGuard, RolesGuard)

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

### GET /api/events/:id
Récupérer un événement

### GET /api/events/:slug/public
Récupérer la page publique d'un événement (SSR, pas d'auth)

## Tickets

### POST /api/tickets/purchase
Acheter des tickets

**Body:**
```json
{
  "eventId": "uuid",
  "ticketTypeId": "uuid",
  "quantity": 2,
  "attendeeInfo": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+256701234567"
    }
  ]
}
```

**Response:**
```json
{
  "orderId": "uuid",
  "intentKey": "timestamp:secret",
  "paymentUrl": "https://provider.com/checkout"
}
```

### GET /api/tickets/:id
Récupérer les détails d'un ticket (Client ou Scanner)

## Payments

### POST /api/payments/init
Initialiser un paiement

**Body:**
```json
{
  "orderId": "uuid",
  "provider": "KKIAPAY",
  "amount": 50000,
  "currency": "XOF"
}
```

**Response:**
```json
{
  "paymentId": "uuid",
  "redirectUrl": "https://kkiapay.com/pay?..."
}
```

### POST /api/payments/webhook/:provider
Recevoir les webhooks des providers (idempotence)

## Scanner

### POST /api/scan/validate
Valider un scan QR (Anti double-scan atomique)

**Body:**
```json
{
  "qrCodeSignature": "hs256_signature",
  "payload": "encrypted_json"
}
```

**Response:**
```json
{
  "success": true,
  "ticketName": "VIP",
  "name": "John Doe",
  "scannedAt": "2026-08-15T10:30:00Z"
}
```

⚠️ Note: **Pas d'email/phone** dans la réponse (données sensibles)

## Event Builder

### PUT /api/builder/:eventId/blocks
Mettre à jour les blocs du builder

**Body:**
```json
{
  "blocks": [
    {
      "type": "hero",
      "position": 0,
      "content": { "title": "...", "image": "..." }
    }
  ],
  "lastKnownUpdatedAt": "2026-08-14T15:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "updatedAt": "2026-08-14T15:31:00Z"
}
```

⚠️ **409 Conflict** si `lastKnownUpdatedAt` ne match pas (concurrence optimiste)

## Dashboard

### GET /api/dashboard/manager/:eventId
Dashboard manager (ventes, scans, revenus)

### GET /api/dashboard/client
Dashboard client (mes tickets, historique, factures)

### GET /api/dashboard/admin
Dashboard super admin (événements, utilisateurs, analytics)

## Errors

### Standard Response Format

```json
{
  "statusCode": 400,
  "message": "Erreur détaillée",
  "error": "Bad Request",
  "timestamp": "2026-08-14T15:30:00Z",
  "path": "/api/tickets/purchase"
}
```

### Common Status Codes

- **200**: Success
- **201**: Created
- **400**: Bad Request (validation error)
- **401**: Unauthorized (missing token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **409**: Conflict (concurrence builder)
- **429**: Too Many Requests (rate limit)
- **500**: Internal Server Error

## Rate Limiting

- **General**: 100 req/s per IP
- **API**: 50 req/s per IP
- **Auth**: 5 attempts/minute per email

## Webhooks

Tous les webhooks sont idempotents via `@unique(paymentId, externalId)`.

Structure:
```json
{
  "externalId": "provider_webhook_id",
  "event": "payment.completed",
  "timestamp": "2026-08-14T15:30:00Z",
  "data": { "orderId": "uuid", "amount": 50000 }
}
```

Response attendue: **200 OK**

Retry: **3 fois** avec backoff exponentiel
