'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Ticket, Mail, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Page de connexion — 2 flux distincts (CDC §7) :
 *  - Clients & Managers : Google OAuth (bouton principal)
 *  - Scanners : login email/password (JWT dédié, exp = endDate + 1h)
 *
 * Le paramètre ?redirect= est propagé au backend lors de l'OAuth pour
 * revenir sur la page d'origine après authentification.
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const [scannerMode, setScannerMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleGoogleLogin() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
    const params = new URLSearchParams({ redirect: redirectTo });
    window.location.href = `${apiBase}/api/auth/google?${params.toString()}`;
  }

  async function handleScannerLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/auth/scanner/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Connexion échouée');
      }
      window.location.href = '/scanner/scan';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ticket className="size-6" />
          </div>
          <CardTitle className="text-2xl">Connexion</CardTitle>
          <CardDescription>
            {scannerMode
              ? 'Accès scanner — contrôle d\'accès événement'
              : 'Connectez-vous pour acheter ou gérer vos événements'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <ShieldAlert className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!scannerMode ? (
            <>
              <Button
                variant="outline"
                className="w-full"
                size="lg"
                onClick={handleGoogleLogin}
              >
                <Mail className="size-4" />
                Continuer avec Google
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                En continuant, vous acceptez d'être authentifié via Google OAuth.
              </p>
            </>
          ) : (
            <form onSubmit={handleScannerLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email scanner</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="scanner@event.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setScannerMode((v) => !v);
              setError(null);
            }}
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {scannerMode
              ? '← Connexion organisateur / client'
              : 'Vous êtes scanner ? Connexion dédiée →'}
          </button>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Retour à l'accueil
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
