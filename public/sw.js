// public/sw.js

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  self.clients.claim();
});

// Chrome richiede obbligatoriamente un listener "fetch" per far scattare il prompt di installazione,
// anche se lo lasciamo vuoto e passiamo la richiesta normalmente.
self.addEventListener('fetch', (event) => {
  return;
});