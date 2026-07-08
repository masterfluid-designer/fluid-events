'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LogOut,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useScannerStore } from '@/store/scannerStore';
import { ScanResult } from '@saas-events/types';

/**
 * Page Scanner PWA — Contrôle d'accès événement (CDC §10.3).
 *
 * ⚠️ VERROU ANTI-DOUBLE-SCAN : `isScanningRef` est un useRef (PAS useState).
 * Raison : un useRef ne déclenche pas de re-render, donc le guard reste
 * atomiquement fiable (JS single-threaded). Un useState serait réinitialisé
 * à chaque render et pourrait rater un scan en rafale.
 *
 * Cooldown de 2s après chaque scan pour éviter les doubles lectures physiques.
 */
export default function ScannerPage() {
  const router = useRouter();
  const scannerRef = useRef<any>(null);
  const isScanningRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const { validateQr, lastScanResult, isValidating, history, clearLastResult } =
    useScannerStore();

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        // Import dynamique : html5-qrcode est lourd et navigateur-only
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted) return;

        const scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText: string) => {
            // ─── VERROU useRef — anti double-scan fiable (CDC §2.2) ────────
            if (isScanningRef.current) return;
            isScanningRef.current = true;
            try {
              await validateQr(decodedText);
            } finally {
              // Cooldown 2s avant de réautoriser un scan
              setTimeout(() => {
                isScanningRef.current = false;
              }, 2000);
            }
          },
          () => {
            /* erreurs de décode ponctuelles ignorées */
          },
        );
        if (mounted) setCameraReady(true);
      } catch (err) {
        if (mounted) {
          setCameraError(
            err instanceof Error
              ? err.message
              : 'Caméra inaccessible. Autorisez l\'accès.',
          );
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      const scanner = scannerRef.current;
      if (scanner) {
        scanner.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // caméra ne redémarre pas — pas de dépendances

  function handleLogout() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
    fetch(`${apiBase}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).finally(() => router.push('/auth/login'));
  }

  const validCount = history.filter((h) => h.result === ScanResult.VALID).length;

  return (
    <main className="min-h-svh bg-slate-950 text-white">
      <div className="mx-auto flex min-h-svh max-w-md flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-500">
              <Camera className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold">EventScan</h1>
              <p className="text-xs text-slate-400">Contrôle d'accès</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-slate-400 hover:text-white"
          >
            <LogOut className="size-4" />
          </Button>
        </header>

        {/* Zone caméra + overlay feedback */}
        <div className="relative mx-4 flex-1">
          <div
            id="qr-reader"
            className="w-full overflow-hidden rounded-2xl bg-slate-900"
            style={{ aspectRatio: '1 / 1' }}
          />

          {/* Erreur caméra */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-slate-900/95 p-6 text-center">
              <AlertTriangle className="mb-3 size-10 text-amber-400" />
              <p className="mb-4 text-sm text-slate-300">{cameraError}</p>
              <Button onClick={() => location.reload()} size="sm">
                Réessayer
              </Button>
            </div>
          )}

          {/* Statut caméra */}
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/80">
              <div className="animate-pulse text-sm text-slate-400">
                Activation caméra...
              </div>
            </div>
          )}

          {/* Feedback dernier scan */}
          {lastScanResult && (
            <ScanFeedback
              result={lastScanResult.result}
              attendee={lastScanResult.attendee}
              onDismiss={clearLastResult}
            />
          )}

          {/* Loader validation */}
          {isValidating && (
            <div className="absolute right-3 top-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-black/50">
                <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            </div>
          )}
        </div>

        {/* Stats session */}
        <div className="p-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-300">
                <Activity className="size-4 text-indigo-400" />
                Session en cours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-slate-800/50 p-3">
                  <div className="text-2xl font-bold text-emerald-400">
                    {validCount}
                  </div>
                  <div className="text-xs text-slate-400">Validés</div>
                </div>
                <div className="rounded-lg bg-slate-800/50 p-3">
                  <div className="text-2xl font-bold text-slate-200">
                    {history.length}
                  </div>
                  <div className="text-xs text-slate-400">Total scannés</div>
                </div>
              </div>

              {history.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs text-slate-500">Derniers scans</div>
                  {history.slice(0, 3).map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md bg-slate-800/30 px-2 py-1.5 text-xs"
                    >
                      <span className="text-slate-300">
                        {h.attendee?.name ?? '—'}
                      </span>
                      <ScanResultBadge result={h.result} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

/** Overlay plein écran vert/rouge pendant 2s après un scan. */
function ScanFeedback({
  result,
  attendee,
  onDismiss,
}: {
  result: ScanResult;
  attendee?: { name: string; ticketName: string };
  onDismiss: () => void;
}) {
  const isValid = result === ScanResult.VALID;
  useEffect(() => {
    const t = setTimeout(onDismiss, 2000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <button
      onClick={onDismiss}
      className={`absolute inset-0 flex items-center justify-center rounded-2xl transition-colors ${
        isValid ? 'bg-emerald-500/90' : 'bg-red-500/90'
      }`}
    >
      <div className="text-center text-white">
        <div className="mb-2 text-5xl">
          {isValid ? (
            <CheckCircle2 className="mx-auto size-16" />
          ) : (
            <XCircle className="mx-auto size-16" />
          )}
        </div>
        {isValid && attendee ? (
          <>
            <p className="text-xl font-bold">{attendee.name}</p>
            <p className="text-sm opacity-90">{attendee.ticketName}</p>
          </>
        ) : (
          <p className="text-lg font-bold">
            {getScanErrorMessage(result)}
          </p>
        )}
      </div>
    </button>
  );
}

function ScanResultBadge({ result }: { result: ScanResult }) {
  const map: Record<ScanResult, { variant: any; label: string }> = {
    [ScanResult.VALID]: { variant: 'success', label: '✓ Valide' },
    [ScanResult.ALREADY_USED]: {
      variant: 'warning',
      label: 'Déjà utilisé',
    },
    [ScanResult.EXPIRED]: { variant: 'destructive', label: 'Expiré' },
    [ScanResult.INVALID]: { variant: 'destructive', label: 'Invalide' },
    [ScanResult.EVENT_MISMATCH]: {
      variant: 'destructive',
      label: 'Mauvais event',
    },
  };
  const { variant, label } = map[result];
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}
    </Badge>
  );
}

function getScanErrorMessage(result: ScanResult): string {
  switch (result) {
    case ScanResult.ALREADY_USED:
      return 'Billet déjà scanné';
    case ScanResult.EXPIRED:
      return 'Billet expiré';
    case ScanResult.EVENT_MISMATCH:
      return 'Mauvais événement';
    case ScanResult.INVALID:
    default:
      return 'QR invalide';
  }
}
