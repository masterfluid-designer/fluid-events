import { readdirSync } from "fs";
import { join } from "path";

export interface PaymentLogo {
  name: string;
  src: string;
}

const FOLDER = "images/payment-logos";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Logos des moyens de paiement affichés sur la landing (décision produit
 * 2026-07-22) : ce sont des assets de marque fixes qui vivent dans le dépôt
 * (`public/images/payment-logos/`), pas du contenu généré par l'admin — on
 * boucle simplement sur le contenu réel du dossier au lieu d'une liste à
 * synchroniser en base ou sur un bucket S3. Lecture système de fichiers,
 * donc réservé aux Server Components (jamais importé depuis un fichier
 * "use client").
 */
export function getPaymentLogos(): PaymentLogo[] {
  const dir = join(process.cwd(), "public", FOLDER);
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }

  return files
    .filter((file) => IMAGE_EXTENSIONS.has(extname(file)))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({
      name: filenameToLabel(file),
      src: `/${FOLDER}/${file}`,
    }));
}

function extname(file: string): string {
  const i = file.lastIndexOf(".");
  return i === -1 ? "" : file.slice(i).toLowerCase();
}

/** "kkiapay-logo.png" -> "Kkiapay", "Orange-Money-logo.png" -> "Orange Money". */
function filenameToLabel(file: string): string {
  const withoutExt = file.slice(0, file.lastIndexOf("."));
  const words = withoutExt.replace(/-logo$/i, "").replace(/[-_]/g, " ").trim().split(/\s+/);
  return words.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
