'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useScannerStore } from '@/store/scannerStore';
import { ScanResult } from '@saas-events/types';

/**
 * Scanner PWA — Caméra QR (CDC §10.3).
 *
 * ⚠️ useRef (pas useState) pour isScanningRef : pas de re-render → guard fiable.
 * Composant client-only (html5-qrcode nécessite window / getUserMedia).
 */
export default function ScannerScanPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const { validateQr, lastScanResult, error } = useScannerStore();

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          if (isScanningRef.current) return;
          isScanningRef.current = true;
          try {
            await validateQr(decodedText);
          } finally {
            setTimeout(() => {
              isScanningRef.current = false;
            }, 2000);
          }
        },
        () => {
          /* scan error — silently ignored */
        },
      )
      .catch((err) => {
        console.error('Erreur caméra :', err);
      });

    return () => {
      scanner
        .stop()
        .catch(() => {
          /* cleanup — silently ignored */
        });
    };
  }, []); // Pas de dépendances → caméra ne redémarre pas

  return (
    <main className="flex min-h-svh flex-col items-center bg-slate-950 px-4 py-8 text-white">
      <h1 className="mb-4 text-xl font-bold">Scanner QR</h1>
      <p className="mb-6 text-sm text-slate-400">
        Pointez la caméra vers le QR code du billet
      </p>

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-slate-900">
        <div id="qr-reader" className="w-full" />

        {lastScanResult && (
          <ScanFeedback result={lastScanResult} />
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      <p className="mt-6 text-xs text-slate-600">
        EventScan PWA — Contrôle d'accès
      </p>
    </main>
  );
}

function ScanFeedback({ result }: { result: { result: ScanResult; attendee?: { name: string; ticketName: string } } }) {
  const isValid = result.result === ScanResult.VALID;

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center rounded-2xl ${
        isValid ? 'bg-green-500/80' : 'bg-red-500/80'
      }`}
    >
      <div className="text-center text-white">
        <div className="mb-2 text-4xl">{isValid ? '✅' : '❌'}</div>
        {isValid ? (
          <>
            <p className="text-lg font-bold">{result.attendee?.name}</p>
            <p className="text-sm opacity-90">{result.attendee?.ticketName}</p>
          </>
        ) : (
          <p className="text-lg font-bold">
            {result.result === ScanResult.EXPIRED
              ? 'QR expiré'
              : result.result === ScanResult.ALREADY_USED
                ? 'Déjà utilisé'
                : result.result === ScanResult.EVENT_MISMATCH
                  ? 'Mauvais événement'
                  : 'QR invalide'}
          </p>
        )}
      </div>
    </div>
  );
}
