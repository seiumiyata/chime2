/**
 * Service Worker for チャイム通知PWA - 大きなボタンUI版
 * iPad mini 2 (iOS 12.5.x) 完全対応
 * オフライン機能・キャッシュ管理・バックグラウンド同期
 */

'use strict';

// ==========================================================================
// Configuration
// ==========================================================================

const CACHE_NAME = 'chime-notification-v2.0.0';
const CACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './assets/icons/192x192.png',
    './assets/icons/512x512.png'
];

// キャッシュ戦略設定
const CACHE_STRATEGIES = {
    CACHE_FIRST: 'cache-first',
    NETWORK_FIRST: 'network-first',
    STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// リソースタイプ別キャッシュ戦略
const RESOURCE_STRATEGIES = {
    // 静的リソース：キャッシュファースト
    '\\.html$': CACHE_STRATEGIES.CACHE_FIRST,
    '\\.css$': CACHE_STRATEGIES.CACHE_FIRST,
    '\\.js$': CACHE_STRATEGIES.CACHE_FIRST,
    '\\.json$': CACHE_STRATEGIES.CACHE_FIRST,
    '\\.(png|jpg|jpeg|gif|svg|ico)$': CACHE_STRATEGIES.CACHE_FIRST,
    '\\.(woff|woff2|ttf|eot)$': CACHE_STRATEGIES.CACHE_FIRST,
    
    // 音声ファイル：ネットワークファースト
    '\\.(mp3|wav|m4a|aac)$': CACHE_STRATEGIES.NETWORK_FIRST
};

// キャッシュ可能なリソースタイプ
const CACHEABLE_EXTENSIONS = [
    '.html', '.css', '.js', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
    '.mp3', '.wav', '.m4a', '.aac'
];

// 除外するURL
const EXCLUDED_URLS = [
    /\/admin\//,
    /\/api\//,
    /chrome-extension/,
    /moz-extension/
];

// ==========================================================================
// Utility Functions
// ==========================================================================

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
        
        // 除外URLのチェック
        if (EXCLUDED_URLS.some(pattern => pattern.test(url))) {
            return false;
        }
        
        // 同一オリジンチェック
        if (urlObj.origin !== self.location.origin) {
            return false;
        }
        
        const pathname = urlObj.pathname.toLowerCase();
        
        // 拡張子チェック
        const hasValidExtension = CACHEABLE_EXTENSIONS.some(ext => 
            pathname.endsWith(ext)
        ) || pathname === '/' || pathname.endsWith('/');
        
        return hasValidExtension;
    } catch (error) {
        console.error('URL validation error:', error);
        return false;
    }
}

/**
 * キャッシュ戦略の決定
 */
function getCacheStrategy(url) {
    for (const [pattern, strategy] of Object.entries(RESOURCE_STRATEGIES)) {
        if (new RegExp(pattern, 'i').test(url)) {
            return strategy;
        }
    }
    return CACHE_STRATEGIES.CACHE_FIRST; // デフォルト
}

/**
 * ネットワークタイムアウト付きフェッチ
 */
async function fetchWithTimeout(request, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(request, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * キャッシュファースト戦略
 */
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // バックグラウンドでキャッシュを更新
            updateCacheInBackground(request);
            return cachedResponse;
        }
        
        const networkResponse = await fetchWithTimeout(request);
        if (networkResponse.ok) {
            await safeCache(CACHE_NAME, request, networkResponse);
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

/**
 * ネットワークファースト戦略
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetchWithTimeout(request);
        if (networkResponse.ok) {
            await safeCache(CACHE_NAME, request, networkResponse);
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

/**
 * Stale While Revalidate戦略
 */
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);
    
    const networkPromise = fetchWithTimeout(request).then(response => {
        if (response.ok) {
            safeCache(CACHE_NAME, request, response);
        }
        return response;
    }).catch(error => {
        console.warn('Network update failed:', error);
    });
    
    return cachedResponse || networkPromise;
}

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

// ==========================================================================
// Service Worker Events
// ==========================================================================

/**
 * Service Worker インストール
 */
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        (async () => {
            try {
                // 重要なリソースを先にキャッシュ
                const cache = await caches.open(CACHE_NAME);
                console.log('Caching essential resources...');
                
                // 並列でキャッシュ
                await Promise.allSettled(
                    CACHE_URLS.map(async url => {
                        try {
                            await cache.add(url);
                            console.log(`Cached: ${url}`);
                        } catch (error) {
                            console.warn(`Failed to cache: ${url}`, error);
                        }
                    })
                );
                
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
                
                // クライアントに更新通知
                const clients = await self.clients.matchAll();
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_ACTIVATED',
                        cacheName: CACHE_NAME
                    });
                });
                
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
                const strategy = getCacheStrategy(url);
                
                switch (strategy) {
                    case CACHE_STRATEGIES.NETWORK_FIRST:
                        return await networkFirst(request);
                    case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
                        return await staleWhileRevalidate(request);
                    case CACHE_STRATEGIES.CACHE_FIRST:
                    default:
                        return await cacheFirst(request);
                }
                
            } catch (error) {
                console.error('Fetch error:', error);
                
                // 最終的なフォールバック
                if (request.destination === 'document') {
                    const fallbackResponse = await caches.match('./index.html');
                    if (fallbackResponse) {
                        return fallbackResponse;
                    }
                }
                
                // エラーレスポンス
                return new Response(`
                    <!DOCTYPE html>
                    <html lang="ja">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>オフライン</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                                display: flex;
                                flex-direction: column;
                                justify-content: center;
                                align-items: center;
                                min-height: 100vh;
                                margin: 0;
                                background: #f5f5f5;
                                color: #333;
                                text-align: center;
                            }
                            .icon { font-size: 4rem; margin-bottom: 1rem; }
                            .title { font-size: 1.5rem; margin-bottom: 0.5rem; font-weight: 600; }
                            .message { color: #666; margin-bottom: 2rem; }
                            .retry-btn {
                                padding: 0.75rem 1.5rem;
                                background: #1976d2;
                                color: white;
                                border: none;
                                border-radius: 0.5rem;
                                font-size: 1rem;
                                cursor: pointer;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="icon">📱</div>
                        <h1 class="title">オフラインです</h1>
                        <p class="message">インターネット接続を確認してください</p>
                        <button class="retry-btn" onclick="location.reload()">再試行</button>
                    </body>
                    </html>
                `, {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-cache'
                    }
                });
            }
        })()
    );
});

/**
 * メッセージハンドリング
 */
self.addEventListener('message', (event) => {
    const { data } = event;
    const client = event.source;
    
    switch (data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            client.postMessage({
                type: 'VERSION_RESPONSE',
                version: CACHE_NAME,
                timestamp: Date.now()
            });
            break;
            
        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME).then(success => {
                client.postMessage({
                    type: 'CACHE_CLEARED',
                    success,
                    timestamp: Date.now()
                });
            }).catch(error => {
                client.postMessage({
                    type: 'CACHE_CLEARED',
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
            });
            break;
            
        case 'FORCE_UPDATE':
            // 強制アップデート
            caches.delete(CACHE_NAME).then(() => {
                return caches.open(CACHE_NAME);
            }).then(cache => {
                return cache.addAll(CACHE_URLS);
            }).then(() => {
                client.postMessage({
                    type: 'UPDATE_COMPLETE',
                    timestamp: Date.now()
                });
            }).catch(error => {
                client.postMessage({
                    type: 'UPDATE_FAILED',
                    error: error.message,
                    timestamp: Date.now()
                });
            });
            break;
            
        case 'PING':
            client.postMessage({
                type: 'PONG',
                timestamp: Date.now()
            });
            break;
            
        default:
            console.warn('Unknown message type:', data.type);
    }
});

/**
 * バックグラウンド同期
 */
self.addEventListener('sync', (event) => {
    switch (event.tag) {
        case 'background-sync':
            event.waitUntil(doBackgroundSync());
            break;
        case 'cache-cleanup':
            event.waitUntil(cleanupOldCaches());
            break;
    }
});

/**
 * プッシュ通知（将来の拡張用）
 */
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    try {
        const data = event.data.json();
        const options = {
            body: data.body || 'チャイム通知が届きました',
            icon: './assets/icons/192x192.png',
            badge: './assets/icons/192x192.png',
            tag: 'chime-notification',
            renotify: true,
            requireInteraction: true,
            actions: [
                {
                    action: 'open',
                    title: '開く'
                },
                {
                    action: 'dismiss',
                    title: '閉じる'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'チャイム通知', options)
        );
    } catch (error) {
        console.error('Push notification error:', error);
    }
});

/**
 * 通知クリック処理
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(clientList => {
                // 既存のウィンドウがあれば前面に
                for (const client of clientList) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // 新しいウィンドウを開く
                if (clients.openWindow) {
                    return clients.openWindow('./index.html');
                }
            })
        );
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

// ==========================================================================
// Background Tasks
// ==========================================================================

/**
 * バックグラウンド同期処理
 */
async function doBackgroundSync() {
    try {
        console.log('Performing background sync...');
        
        // キャッシュの健全性チェック
        const cache = await caches.open(CACHE_NAME);
        const cachedRequests = await cache.keys();
        
        console.log(`Cache contains ${cachedRequests.length} items`);
        
        // 必要に応じて追加の同期処理を実装
        
    } catch (error) {
        console.error('Background sync failed:', error);
    }
}

/**
 * 古いキャッシュのクリーンアップ
 */
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

/**
 * 定期的なヘルスチェック
 */
async function performHealthCheck() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedUrls = await cache.keys();
        
        // 重要なリソースがキャッシュされているかチェック
        const missingUrls = CACHE_URLS.filter(url => 
            !cachedUrls.some(request => request.url.endsWith(url))
        );
        
        if (missingUrls.length > 0) {
            console.warn('Missing cached resources:', missingUrls);
            // 必要に応じて再キャッシュ
            await Promise.allSettled(
                missingUrls.map(url => cache.add(url))
            );
        }
        
    } catch (error) {
        console.error('Health check failed:', error);
    }
}

// 定期的なヘルスチェックの実行（開発時のみ）
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    setInterval(performHealthCheck, 5 * 60 * 1000); // 5分毎
}

console.log('Service Worker loaded successfully - Version:', CACHE_NAME);
