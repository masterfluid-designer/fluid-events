'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Camera, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Landing du scanner — vérifie l'auth et redirige vers /scanner/scan si connecté.
 * Inclut l'enregistrement du service worker pour la PWA.
 */
export default function ScannerLanding() {
  useEffect(() => {
    // Enregistrement du Service Worker (PWA, CDC §10.2)
    if (
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* échec silencieux — la PWA reste fonctionnelle sans SW */
      });
    }
  }, []);

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-950 px-4 py-12 text-white">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-500">
            <Camera className="size-7" />
          </div>
          <CardTitle className="text-2xl">EventScan</CardTitle>
          <CardDescription className="text-slate-400">
            Contrôle d'accès aux événements
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" size="lg" asChild>
            <Link href="/auth/login">
              Se connecter <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="text-center text-xs text-slate-500">
            Compte scanner fourni par votre organisateur.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
