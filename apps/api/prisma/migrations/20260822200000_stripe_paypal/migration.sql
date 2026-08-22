-- Stripe et PayPal (2026-08-22)
--
-- Google Pay et Apple Pay n'apparaissent PAS ici : ce sont des portefeuilles
-- qui presentent une carte, pas des encaisseurs. Stripe Checkout les affiche
-- de lui-meme selon le navigateur du visiteur, sans configuration.
ALTER TYPE "PaymentProviderType" ADD VALUE 'STRIPE';
ALTER TYPE "PaymentProviderType" ADD VALUE 'PAYPAL';
