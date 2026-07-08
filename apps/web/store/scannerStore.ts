'use client';

import { create } from 'zustand';
import { ScanResult } from '@saas-events/types';
import { apiPost } from '@/lib/api';

/**
 * Attendu du scanner : { result, attendee?: { name, ticketName } }.
 * ⚠️ email/phone ne sont jamais présents (minimisation données, CDC §2.2).
 */
export interface ScanValidationResult {
  result: ScanResult;
  attendee?: { name: string; ticketName: string; scannedAt: string };
}

export interface ScannerStore {
  lastScanResult: ScanValidationResult | null;
  isValidating: boolean;
  error: string | null;
  // Historique local des scans de session
  history: ScanValidationResult[];

  /** Appelle POST /api/scan/validate avec le token QR décodé. */
  validateQr: (qrToken: string) => Promise<ScanValidationResult>;
  /** Réinitialise l'affichage du dernier résultat. */
  clearLastResult: () => void;
}

export const useScannerStore = create<ScannerStore>((set) => ({
  lastScanResult: null,
  isValidating: false,
  error: null,
  history: [],

  validateQr: async (qrToken: string) => {
    set({ isValidating: true, error: null });
    try {
      const result = await apiPost<ScanValidationResult>('/api/scan/validate', {
        qrToken,
      });
      set((state) => ({
        lastScanResult: result,
        isValidating: false,
        history: [result, ...state.history].slice(0, 50), // garde 50 derniers
      }));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de scan';
      const fallback: ScanValidationResult = { result: ScanResult.INVALID };
      set((state) => ({
        lastScanResult: fallback,
        isValidating: false,
        error: message,
        history: [fallback, ...state.history].slice(0, 50),
      }));
      return fallback;
    }
  },

  clearLastResult: () => set({ lastScanResult: null, error: null }),
}));
