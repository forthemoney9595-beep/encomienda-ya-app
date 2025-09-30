import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaSyDiFr0AGMK8v_dUnvTu_IhifSBfGBCNQm0',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'studio-8973437171-6b185.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'studio-8973437171-6b185',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'studio-8973437171-6b185.appspot.com',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1091869412431',
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:1091869412431:web:e25c7cebb7b151423f2e3a',
  },
};

export default nextConfig;
