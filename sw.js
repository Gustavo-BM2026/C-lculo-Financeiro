/**
 * Service Worker Oficial do PWA: Gastei & Agora?
 * Versão do Cache: gastei-agora-v4
 * 
 * Regras de Segurança:
 * - Network-Only para Supabase (*.supabase.co) para preservar integridade de Auth e RLS
 * - Network-First com Cache Fallback para scripts e páginas locais
 * - Stale-While-Revalidate para Google Fonts e CDNs
 * - Fallback inteligente para offline.html quando sem conexão
 */

const CACHE_NAME = 'gastei-agora-v4';

// Recursos essenciais para pré-cache imediato
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './supabaseConfig.js',
    './offline.html',
    './manifest.webmanifest',
    './icons/favicon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pré-cacheando recursos essenciais da aplicação...');
            return cache.addAll(PRECACHE_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Removendo cache legado:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Apenas intercepta requisições HTTP/HTTPS GET
    if (request.method !== 'GET') {
        return;
    }

    // 2. ISOLAMENTO TOTAL DO SUPABASE (NETWORK-ONLY)
    // Chamadas de autenticação, banco de dados e tokens nunca devem ser cacheadas
    if (url.origin.includes('supabase.co') || url.pathname.includes('/auth/v1/')) {
        return; // Deixa o navegador executar o fetch nativo diretamente
    }

    // 3. NAVEGAÇÃO DE PÁGINAS (HTML)
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    // Atualiza o cache do index.html em segundo plano
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    // Em caso de falha de rede, tenta servir o index ou o fallback offline
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    const offlinePage = await caches.match('./offline.html');
                    return offlinePage || new Response('Offline', { status: 503, statusText: 'Offline' });
                })
        );
        return;
    }

    // 4. CDNs ESTÁTICOS (Google Fonts, jsdelivr supabase-js) - Stale-While-Revalidate
    if (url.origin.includes('fonts.googleapis.com') || 
        url.origin.includes('fonts.gstatic.com') || 
        url.origin.includes('cdn.jsdelivr.net')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                }).catch(() => cached);

                return cached || fetchPromise;
            })
        );
        return;
    }

    // 5. ASSETS LOCAIS (CSS, JS, Imagens, Ícones) - Network-First com Fallback de Cache
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(request);
            })
    );
});

// Interceptação de clique na notificação nativa
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Se houver uma aba/janela já aberta, foca nela
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // Se não houver, abre uma nova janela do app
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});

