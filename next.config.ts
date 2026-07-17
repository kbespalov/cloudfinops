import type {NextConfig} from 'next';

const EMPTY_MODULE = './src/lib/empty-module.js';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // @gravity-ui/aikit renders markdown via @diplodoc/transform, which imports
  // Node built-ins (fs) and the `css` package (source-map-support → fs). None
  // run in the browser, so stub them out of the client bundle.
  turbopack: {
    resolveAlias: {
      fs: EMPTY_MODULE,
      'source-map-support': EMPTY_MODULE,
    },
  },
  webpack: (config, {isServer}) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
