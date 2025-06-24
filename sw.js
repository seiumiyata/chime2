/**
 * Service Worker for チャイム通知PWA
 * 完全動作版 - オフライン対応・キャッシュ管理
 */

'use strict';

const CACHE_NAME = 'chime-notification-v1.0.0';
const CACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// インストール時の処理
self.addEventListener('install', function(event) {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Cache opened');
        
        // 基本ファイルをキャッシュ
        return cache.addAll(CACHE_URLS);
      })
      .then(function() {
        console.log('Service Worker: All files cached');
        
        // アイコンファイルも個別にキャッシュ（エラーを無視）
        return caches.open(CACHE_NAME);
      })
      .then(function(cache) {
        const iconUrls = [
          './assets/icons/192x192.png',
          './assets/icons/512x512.png'
        ];
        
        // アイコンファイルは失敗してもOK
        return Promise.allSettled(
          iconUrls.map(url => 
            fetch(url)
              .then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch(error => {
                console.warn('Failed to cache icon:', url, error);
              })
          )
        );
      })
      .then(function() {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch(function(error) {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

// アクティベート時の処理
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        // 古いキャッシュを削除
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheName.startsWith('chime-notification-') && cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(function() {
        console.log('Service Worker: Old caches cleaned');
        return self.clients.claim();
      })
      .then(function() {
        console.log('Service Worker: Activation complete');
        
        // 全クライアントに通知
        return self.clients.matchAll();
      })
      .then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({
            type: 'SW_ACTIVATED',
            cacheName: CACHE_NAME
          });
        });
      })
      .catch(function(error) {
        console.error('Service Worker: Activation failed', error);
      })
  );
});

// フェッチ時の処理
self.addEventListener('fetch', function(event) {
  // GET リクエストのみ処理
  if (event.request.method !== 'GET') {
    return;
  }
  
  // 同一オリジンのリクエストのみ処理
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        // キャッシュがあれば返す
        if (cachedResponse) {
          console.log('Service Worker: Serving from cache:', event.request.url);
          return cachedResponse;
        }
        
        // キャッシュがなければネットワークから取得
        console.log('Service Worker: Fetching from network:', event.request.url);
        
        return fetch(event.request)
          .then(function(response) {
            // レスポンスが有効でない場合はそのまま返す
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // レスポンスをクローンしてキャッシュに保存
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
                console.log('Service Worker: Cached:', event.request.url);
              })
              .catch(function(error) {
                console.warn('Service Worker: Failed to cache:', event.request.url, error);
              });
            
            return response;
          })
          .catch(function(error) {
            console.error('Service Worker: Fetch failed:', event.request.url, error);
            
            // ネットワークエラー時のフォールバック
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
            
            // その他のリソースの場合はエラーを返す
            return new Response('オフラインです', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: {
                'Content-Type': 'text/plain; charset=utf-8'
              }
            });
          });
      })
  );
});

// メッセージハンドリング
self.addEventListener('message', function(event) {
  const data = event.data;
  const client = event.source;
  
  if (!data || !client) {
    return;
  }
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      client.postMessage({
        type: 'VERSION_RESPONSE',
        version: CACHE_NAME,
        timestamp: new Date().toISOString()
      });
      break;
      
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME)
        .then(function(success) {
          client.postMessage({
            type: 'CACHE_CLEARED',
            success: success,
            timestamp: new Date().toISOString()
          });
        })
        .catch(function(error) {
          client.postMessage({
            type: 'CACHE_CLEARED',
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
      break;
      
    case 'PING':
      client.postMessage({
        type: 'PONG',
        timestamp: new Date().toISOString()
      });
      break;
      
    default:
      console.warn('Service Worker: Unknown message type:', data.type);
  }
});

// エラーハンドリング
self.addEventListener('error', function(event) {
  console.error('Service Worker: Error occurred:', event.error);
});

self.addEventListener('unhandledrejection', function(event) {
  console.error('Service Worker: Unhandled promise rejection:', event.reason);
});

// プッシュ通知（将来の拡張用）
self.addEventListener('push', function(event) {
  if (!event.data) {
    return;
  }
  
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
      self.registration.showNotification(
        data.title || 'チャイム通知',
        options
      )
    );
  } catch (error) {
    console.error('Service Worker: Push notification error:', error);
  }
});

// 通知クリック処理
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      })
      .then(function(clientList) {
        // 既存のウィンドウがあれば前面に
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
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

// バックグラウンド同期（将来の拡張用）
self.addEventListener('sync', function(event) {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // バックグラウンド同期処理
      console.log('Service Worker: Background sync triggered')
    );
  }
});

console.log('Service Worker: Script loaded - Version:', CACHE_NAME);
