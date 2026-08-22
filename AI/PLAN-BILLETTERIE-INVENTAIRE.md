# PLAN-BILLETTERIE-INVENTAIRE.md — Billets pré-générés et assignés

> **Plan d'action, 2026-08-22.** Demande : générer les billets à la création de
> l'événement, d'après la prévision de places, puis les **assigner** à
> l'acheteur — au lieu de les fabriquer au moment de la vente.
>
> Rien n'est implémenté. Ce document sert à décider, et garde les alternatives
> écartées avec leur motif.

---

## 1. Ce que fait le modèle actuel

| Ce qui existe | Rôle |
|---|---|
| `Ticket` | Un **type** de place : nom, prix, `stock`, `stockSold` |
| `OrderItem` | Une **place vendue** : créée à l'achat, un QR par ligne |

Le QR est un JWT signé, produit **après** confirmation du paiement par un
worker BullMQ, en même temps que le PDF. Le stock est un compteur décrémenté
atomiquement (`updateMany` avec garde).

Le scanner refuse déjà un billet dont la commande n'est pas `PAID` — c'est
important pour la suite.

## 2. Ce que le modèle proposé change

À la création d'un type de billet à 500 places, on écrit **500 lignes**
immédiatement, chacune numérotée et porteuse de son QR. L'achat ne crée plus
rien : il **assigne** N billets libres à une commande.

```prisma
model TicketUnit {
  id        String   @id @default(cuid())
  ticketId  String              // le type
  numero    Int                 // 1..N, stable et affichable
  statut    LIBRE | RESERVE | VENDU | ANNULE
  orderItemId String?  @unique  // l'acheteur, une fois assigné
  qrCode    String              // pré-généré
  @@unique([ticketId, numero])
  @@index([ticketId, statut])
}
```

## 3. Ce que ça apporte réellement

**La numérotation.** « Billet n° 42 sur 500 » devient une donnée, pas un
calcul. C'est ce qu'attendent les places assises et les billets nominatifs, et
c'est aujourd'hui impossible.

**L'inventaire.** Combien de places libres, réservées, vendues, scannées —
lisible d'une requête, sans dériver d'un compteur. Un écart entre `stock`,
`stockSold` et le nombre réel d'`OrderItem` ne peut plus exister : il n'y a
plus qu'une source.

**La sur-vente devient structurellement impossible.** On ne peut pas assigner
un billet qui n'existe pas. Aujourd'hui, c'est la rigueur du décrément atomique
qui l'empêche — elle tient, mais elle repose sur du code, pas sur le schéma.

**Le billet est prêt avant la vente.** Plus d'attente entre le paiement et le
QR. La file BullMQ ne sert plus qu'au PDF.

## 4. Ce que ça coûte, et qu'il faut regarder en face

**Le volume.** Un festival à 10 000 places écrit 10 000 lignes et 10 000 JWT à
la création. C'est supportable en base, moins à la génération : il faut la
faire en tâche de fond, avec un état « inventaire en préparation » visible par
l'organisateur.

**Changer le stock devient une opération, plus une valeur.** Passer de 500 à
600 crée 100 billets. Passer de 500 à 300 en supprime 200 — mais lesquels ? Et
si 400 sont déjà vendus, la baisse est **impossible**, alors qu'aujourd'hui
elle n'est qu'un nombre qu'on corrige. Il faudra le refuser explicitement, avec
le compte des places déjà vendues.

**L'assignation doit être atomique.** Deux acheteurs simultanés ne doivent pas
recevoir le même billet. C'est un `SELECT … FOR UPDATE SKIP LOCKED` — sûr, mais
c'est un mécanisme de plus à tenir, là où le décrément actuel tient en une
requête.

**La migration.** Les événements existants ont des `OrderItem` sans
`TicketUnit`. Il faut fabriquer l'inventaire rétroactivement : un billet vendu
par `OrderItem` existant, plus les places libres restantes.

### ⚠️ Le point de sécurité à ne pas manquer

Un QR pré-généré est un **JWT valide qui existe avant toute vente**. S'il fuit
— capture d'écran d'un écran d'administration, dump de base, export mal
protégé — il désigne un billet réel.

Ce qui nous sauve aujourd'hui : le scanner vérifie `order.status === 'PAID'`
avant d'accepter. Un billet `LIBRE` n'a pas de commande, donc pas de commande
payée, donc il est refusé. **Cette vérification devient le seul rempart** : il
faudra un test qui la garde explicitement, et refuser tout billet dont le
statut n'est pas `VENDU`, en plus du statut de la commande.

## 5. L'alternative plus légère, à considérer avant de tout refondre

Presque tout le gain visible — la numérotation — s'obtient sans inventaire
pré-généré : un compteur par type, et un `numero` attribué à l'`OrderItem` au
moment de l'achat.

| | Pré-génération complète | Numéro à l'achat |
|---|---|---|
| Numérotation stable | ✅ | ✅ |
| Inventaire visible | ✅ | ⚠️ dérivé, comme aujourd'hui |
| Sur-vente impossible par le schéma | ✅ | ❌ (garde par code, comme aujourd'hui) |
| QR prêt avant la vente | ✅ | ❌ |
| Places numérotées / plan de salle | ✅ | ❌ |
| Coût d'implémentation | 4 lots | 1 lot |
| Risque sur la production | élevé | faible |

**Ma recommandation : la pré-génération vaut le coup si et seulement si tu vises
les places assises ou les billets nominatifs.** Si le besoin est « voir mon
inventaire et numéroter les billets », la seconde colonne l'obtient pour un
quart du travail, sans toucher au tunnel d'achat qui fonctionne.

## 6. Plan si la pré-génération est retenue

**Lot A — l'inventaire, sans rien brancher.** Modèle `TicketUnit`, génération
en tâche de fond à la création d'un type, état « en préparation », et refus
documenté d'une baisse de stock sous le nombre vendu. Rien ne le consomme
encore : la billetterie continue comme avant.

**Lot B — l'assignation.** L'achat prend N billets `LIBRE` en
`FOR UPDATE SKIP LOCKED`, les passe `RESERVE`, puis `VENDU` à la confirmation —
et `LIBRE` à nouveau si le paiement échoue. Le décrément de `stockSold`
disparaît au profit d'un comptage. C'est le lot risqué : il touche le chemin de
l'argent.

**Lot C — le scan.** Refuser tout billet dont le statut n'est pas `VENDU`, en
plus du contrôle de commande payée. Tests dédiés sur le billet jamais vendu.

**Lot D — la migration et l'affichage.** Inventaire rétroactif pour les
événements existants, numéro sur le billet et sur la page publique, tableau
d'inventaire côté organisateur.

**Ordre imposé par le risque** : A ne casse rien, B casse tout s'il est faux, C
protège B, D finit. Chaque lot part seul en production.

## 7. Ce qu'il faut trancher avant de commencer

1. **Places assises ou pas ?** C'est la question qui décide entre les deux
   colonnes du §5.
2. **Que faire d'un billet vendu puis remboursé ?** Il redevient `LIBRE`, ou il
   reste `ANNULE` et le stock diminue d'autant ?
3. **Le numéro est-il visible de l'acheteur ?** S'il l'est, il devient une
   promesse : le n° 1 vaudra plus que le n° 400 aux yeux de certains.
4. **Quelle limite haute ?** Générer 100 000 billets pour un événement mal
   saisi doit être refusé, pas subi.
