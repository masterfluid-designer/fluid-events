import Link from 'next/link';
import { Ticket, Smartphone, CreditCard, Palette, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Landing page — Présentation de la plateforme.
 * Publique (pas d'auth), mobile-first, orientée organisateurs africains.
 */
export default function LandingPage() {
  return (
    <main className="min-h-svh bg-background">
      {/* Header */}
      <header className="container mx-auto flex items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Ticket className="size-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Eventio</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/auth/login">Connexion</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/scanner">Scanner</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-16 text-center md:py-24">
        <Badge variant="secondary" className="mb-4">
          🌍 Pensé pour l'Afrique — Mobile Money inclus
        </Badge>
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight md:text-6xl">
          Organisez vos événements.
          <br />
          <span className="text-primary">Vendez. Contrôlez l'accès.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-muted-foreground">
          La plateforme tout-en-un pour créer des événements, vendre des billets
          en ligne et scanner les entrées — sans compétence technique.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/auth/login">
              Démarrer maintenant <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/e/concert-2026">Voir une démo</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            icon={<CreditCard className="size-5" />}
            title="Paiement local"
            description="Kkiapay, CinetPay, FedaPay — Mobile Money et cartes d'Afrique."
          />
          <FeatureCard
            icon={<Smartphone className="size-5" />}
            title="Scanner PWA"
            description="Transformez votre téléphone en lecteur de billets QR. Installation en 1 clic."
          />
          <FeatureCard
            icon={<Palette className="size-5" />}
            title="No-code Builder"
            description="Composez la page de votre événement par glisser-déposer. Aucune ligne de code."
          />
          <FeatureCard
            icon={<Ticket className="size-5" />}
            title="Billetterie complète"
            description="Types de billets, stock sécurisé, QR signés, design personnalisable."
          />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto grid gap-8 px-4 py-12 text-center md:grid-cols-3">
          <Stat value="< 500ms" label="Temps de validation QR" />
          <Stat value="99.5%" label="Disponibilité garantie" />
          <Stat value="24/7" label="WhatsApp & email" />
        </div>
      </section>

      {/* CTA final */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-balance text-3xl font-bold md:text-4xl">
          Prêt à lancer votre événement ?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          Rejoignez les organisateurs qui font confiance à Eventio.
        </p>
        <Button size="lg" className="mt-8" asChild>
          <Link href="/auth/login">
            Créer un compte <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Eventio — SaaS Événementiel & Billetterie
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 p-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-3xl font-bold text-primary md:text-4xl">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
