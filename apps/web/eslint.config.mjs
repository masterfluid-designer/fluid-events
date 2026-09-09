import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Configuration ESLint du front (réparée le 2026-09-09).
 *
 * `eslint-config-next` est encore publié au format « eslintrc » : ses fichiers
 * exportent un objet `{ extends: [...] }`, pas un tableau de configurations
 * plates. Ce fichier les importait pourtant comme s'ils l'étaient, et ESLint
 * échouait au chargement — donc `pnpm lint` n'a jamais rien vérifié sur le
 * front depuis la mise en place du monorepo. Ce n'est pas la montée de Next
 * 15.5 qui l'a cassé : la version précédente livrait exactement les mêmes
 * fichiers.
 *
 * `FlatCompat` fait le pont : il traduit un `extends` hérité en configuration
 * plate. C'est le chemin recommandé tant que Next n'aura pas publié la sienne.
 */
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = defineConfig([
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
