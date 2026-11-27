const rotaRuntimeCaches = new Set([
  'start-url', 'apis', 'others', 'next-data', 'next-image', 'cross-origin',
  'google-fonts-webfonts', 'google-fonts-stylesheets',
  'static-font-assets', 'static-image-assets', 'static-audio-assets', 'static-video-assets',
  'static-js-assets', 'static-style-assets', 'static-data-assets',
]);

async function removeRotaCaches() {
  const rootPrecache = 'workbox-precache-v2-' + self.location.origin + '/';
  const names = await caches.keys();
  await Promise.all(names.filter(name=>rotaRuntimeCaches.has(name) || name===rootPrecache).map(name=>caches.delete(name)));
}
