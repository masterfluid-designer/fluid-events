/** @type {import('next').NextConfig} */

const nextConfig = {
  /*
   * Un build de vérification ne doit pas écraser le .next du serveur de dev :
   * celui-ci sert ses morceaux de code depuis ce dossier, et se met à réclamer
   * des fichiers que le build a remplacés — le serveur tombe alors sans que
   * rien dans le code source ait changé. NEXT_DIST_DIR permet de builder à
   * côté, sans interrompre personne.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['shadcn-ui'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
};

export default nextConfig;
