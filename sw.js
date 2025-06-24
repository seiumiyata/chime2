/**
 * Service Worker for チャイム通知PWA
 * iPad mini 2 (iOS 12.5.x) 対応
 */

'use strict';

const CACHE_NAME = 'chime-notification-v1.0.0';
const CACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './assets/icons/192x192.png',
    './assets/icons/512x512.png'
];

// キャッシュ可能なリソースタイプ
const CACHEABLE_EXTENSIONS = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.json'];

/**
 * エラーハンドリング付きのキャッシュ操作
 */
async function safeCache(cacheName, request, response) {
    try {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
        return true;
    } catch (error) {
        console.error('Cache error:', error);
        return false;
    }
}

/**
 * リソースがキャッシュ可能かチェック
 */
function isCacheable(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        
        // 拡張子チェック
        const hasValidExtension = CACHEABLE_EXTENSIONS.some(ext => 
            pathname.endsWith(ext)
        ) || pathname === '/' || pathname.endsWith('/');
        
        // 同一オリジンチェック
        const isSameOrigin = urlObj.origin === self.location.origin;
        
        return hasValidExtension && isSameOrigin;
    } catch (error) {
        return false;
    }
}

/**
 * Service Worker インストール
 */
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_NAME);
                console.log('Caching initial resources...');
                
                // 重要なリソースを先にキャッシュ
                await cache.addAll(CACHE_URLS);
                
                console.log('Service Worker installed successfully');
                
                // 即座にアクティベート
                self.skipWaiting();
            } catch (error) {
                console.error('Service Worker install failed:', error);
                throw error;
            }
        })()
    );
});

/**
 * Service Worker アクティベート
 */
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        (async () => {
            try {
                // 古いキャッシュの削除
                const cacheNames = await caches.keys();
                const deletePromises = cacheNames
                    .filter(cacheName => 
                        cacheName.startsWith('chime-notification-') && 
                        cacheName !== CACHE_NAME
                    )
                    .map(cacheName => {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    });
                
                await Promise.all(deletePromises);
                
                // すべてのクライアントを制御
                await self.clients.claim();
                
                console.log('Service Worker activated successfully');
            } catch (error) {
                console.error('Service Worker activation failed:', error);
            }
        })()
    );
});

/**
 * フェッチイベント処理
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = request.url;
    
    // GET リクエストのみ処理
    if (request.method !== 'GET') {
        return;
    }
    
    // キャッシュ可能なリソースのみ処理
    if (!isCacheable(url)) {
        return;
    }
    
    event.respondWith(
        (async () => {
            try {
                // キャッシュファーストストラテジー
                const cachedResponse = await caches.match(request, {
                    cacheName: CACHE_NAME
                });
                
                if (cachedResponse) {
                    console.log('Serving from cache:', url);
                    
                    // バックグラウンドでキャッシュを更新（重要でないリソースのみ）
                    if (!CACHE_URLS.includes(url) && navigator.onLine) {
                        updateCacheInBackground(request);
                    }
                    
                    return cachedResponse;
                }
                
                // キャッシュにない場合はネットワークから取得
                console.log('Fetching from network:', url);
                const networkResponse = await fetch(request);
                
                // レスポンスが正常な場合のみキャッシュ
                if (networkResponse.ok) {
                    await safeCache(CACHE_NAME, request, networkResponse);
                }
                
                return networkResponse;
                
            } catch (error) {
                console.error('Fetch error:', error);
                
                // オフライン時はキャッシュから取得を再試行
                const cachedResponse = await caches.match(request);
                if (cachedResponse) {
                    console.log('Serving cached fallback:', url);
                    return cachedResponse;
                }
                
                // フォールバック応答
                if (request.destination === 'document') {
                    const fallbackResponse = await caches.match('./index.html');
                    if (fallbackResponse) {
                        return fallbackResponse;
                    }
                }
                
                // 最終的なエラーレスポンス
                return new Response('オフラインです', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }
        })()
    );
});

/**
 * バックグラウンドキャッシュ更新
 */
async function updateCacheInBackground(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            await safeCache(CACHE_NAME, request, response);
            console.log('Background cache updated:', request.url);
        }
    } catch (error) {
        console.warn('Background cache update failed:', request.url, error);
    }
}

/**
 * メッセージハンドリング
 */
self.addEventListener('message', (event) => {
    const { data } = event;
    
    switch (data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            event.ports[0].postMessage({
                version: CACHE_NAME
            });
            break;
            
        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME).then(() => {
                event.ports[0].postMessage({
                    success: true
                });
            }).catch((error) => {
                event.ports[0].postMessage({
                    success: false,
                    error: error.message
                });
            });
            break;
            
        default:
            console.warn('Unknown message type:', data.type);
    }
});

/**
 * エラーハンドリング
 */
self.addEventListener('error', (event) => {
    console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker unhandled rejection:', event.reason);
});

/**
 * 定期的なキャッシュクリーンアップ
 */
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'cache-cleanup') {
        event.waitUntil(cleanupOldCaches());
    }
});

async function cleanupOldCaches() {
    try {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name => 
            name.startsWith('chime-notification-') && 
            name !== CACHE_NAME
        );
        
        await Promise.all(oldCaches.map(name => caches.delete(name)));
        console.log('Cleaned up old caches:', oldCaches);
    } catch (error) {
        console.error('Cache cleanup failed:', error);
    }
}

console.log('Service Worker loaded successfully');
