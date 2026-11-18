declare module 'next-pwa';

declare module 'next-pwa/cache' {
  const entries: import('workbox-build').RuntimeCaching[];
  export default entries;
}
