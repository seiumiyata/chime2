/**
 * チャイム通知PWA - メインアプリケーション
 * iPad mini 2 (iOS 12.5.x) 対応
 * 完全なエラーハンドリング実装
 */

'use strict';

// ==========================================================================
// Constants & Configuration
// ==========================================================================

const CONFIG = {
    STORAGE_KEY: 'chime-notification-data',
    THEME_KEY: 'chime-notification-theme',
    ADMIN_SESSION_KEY: 'chime-admin-session',
    DEFAULT_ADMIN_PASSWORD: 'admin123',
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30分
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    SUPPORTED_AUDIO_TYPES: ['audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac'],
    ANIMATION_DURATION: 300,
    WAVE_DURATION: 2000,
    NOTIFICATION_DURATION: 3000,
    ERROR_DURATION: 5000
};

const MESSAGES = {
    ERRORS: {
        STORAGE_FULL: 'ストレージ容量が不足しています',
        NETWORK_ERROR: 'ネットワークエラーが発生しました',
        AUDIO_ERROR: '音声の再生に失敗しました',
        FILE_TOO_LARGE: 'ファイルサイズが大きすぎます（10MB以下にしてください）',
        INVALID_FILE_TYPE: 'サポートされていないファイル形式です',
        INVALID_WEBHOOK: '無効なWebhook URLです',
        TEAMS_SEND_ERROR: 'Teams通知の送信に失敗しました',
        AUTH_FAILED: '認証に失敗しました',
        VALIDATION_ERROR: '入力内容を確認してください',
        UNKNOWN_ERROR: '予期しないエラーが発生しました'
    },
    SUCCESS: {
        NOTIFICATION_SENT: '通知を送信しました',
        NOTIFICATION_OFFLINE: 'チャイム音を再生しました（オフライン）',
        DATA_SAVED: 'データを保存しました',
        DATA_DELETED: 'データを削除しました',
        LOGIN_SUCCESS: 'ログインしました'
    },
    CONFIRM: {
        DELETE_ITEM: 'このデータを削除しますか？',
        LOGOUT: 'ログアウトしますか？'
    }
};

// ==========================================================================
// Utility Functions
// ==========================================================================

/**
 * エラーハンドリング付きのtry-catch wrapper
 */
function safeExecute(fn, errorMessage = MESSAGES.ERRORS.UNKNOWN_ERROR) {
    try {
        return fn();
    } catch (error) {
        console.error(errorMessage, error);
        ErrorHandler.show(errorMessage);
        return null;
    }
}

/**
 * Promise版のsafeExecute
 */
async function safeExecuteAsync(fn, errorMessage = MESSAGES.ERRORS.UNKNOWN_ERROR) {
    try {
        return await fn();
    } catch (error) {
        console.error(errorMessage, error);
        ErrorHandler.show(errorMessage);
        return null;
    }
}

/**
 * DOM要素の安全な取得
 */
function safeGetElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.warn(`Element not found: ${selector}`);
    }
    return element;
}

/**
 * 値の検証
 */
function validateInput(value, type = 'text', options = {}) {
    if (typeof value !== 'string') return false;
    
    value = value.trim();
    if (!value && !options.allowEmpty) return false;
    
    switch (type) {
        case 'url':
            try {
                new URL(value);
                return value.startsWith('https://') || value.startsWith('http://');
            } catch {
                return false;
            }
        case 'text':
            return value.length >= (options.minLength || 1) && 
                   value.length <= (options.maxLength || 100);
        default:
            return true;
    }
}

/**
 * ファイルサイズのフォーマット
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * デバウンス関数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==========================================================================
// Error Handler
// ==========================================================================

class ErrorHandler {
    static show(message, duration = CONFIG.ERROR_DURATION) {
        const toast = safeGetElement('#error-toast');
        const messageEl = safeGetElement('#error-toast .error-message');
        
        if (!toast || !messageEl) return;
        
        messageEl.textContent = message;
        toast.classList.remove('hidden');
        
        // 自動非表示
        setTimeout(() => {
            this.hide();
        }, duration);
    }
    
    static hide() {
        const toast = safeGetElement('#error-toast');
        if (toast) {
            toast.classList.add('hidden');
        }
    }
    
    static handleStorageError(error) {
        console.error('Storage error:', error);
        if (error.name === 'QuotaExceededError') {
            this.show(MESSAGES.ERRORS.STORAGE_FULL);
        } else {
            this.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
        }
    }
    
    static handleNetworkError(error) {
        console.error('Network error:', error);
        this.show(MESSAGES.ERRORS.NETWORK_ERROR);
    }
    
    static handleAudioError(error) {
        console.error('Audio error:', error);
        this.show(MESSAGES.ERRORS.AUDIO_ERROR);
    }
}

// グローバルエラーハンドラー
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    ErrorHandler.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    ErrorHandler.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
});

// グローバル関数（HTML内から呼び出し用）
function hideError() {
    ErrorHandler.hide();
}

// ==========================================================================
// Storage Manager
// ==========================================================================

class StorageManager {
    constructor() {
        this.data = null;
        this.init();
    }
    
    init() {
        try {
            this.data = this.loadData();
        } catch (error) {
            ErrorHandler.handleStorageError(error);
            this.data = this.getDefaultData();
        }
    }
    
    getDefaultData() {
        return {
            companies: [],
            departments: [],
            members: [],
            chimes: [{
                id: 'default-chime',
                name: '標準チャイム',
                file: null
            }],
            channels: [],
            adminPassword: this.hashPassword(CONFIG.DEFAULT_ADMIN_PASSWORD),
            version: '1.0.0'
        };
    }
    
    loadData() {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!stored) {
            const defaultData = this.getDefaultData();
            this.saveData(defaultData);
            return defaultData;
        }
        
        try {
            const parsed = JSON.parse(stored);
            // マイグレーション処理
            return this.migrateData(parsed);
        } catch (error) {
            console.error('Data parse error:', error);
            throw error;
        }
    }
    
    migrateData(data) {
        // 必要に応じてデータ構造の移行を行う
        if (!data.version) {
            data.version = '1.0.0';
        }
        
        // 必須フィールドの確認
        if (!Array.isArray(data.companies)) data.companies = [];
        if (!Array.isArray(data.departments)) data.departments = [];
        if (!Array.isArray(data.members)) data.members = [];
        if (!Array.isArray(data.chimes)) data.chimes = [];
        if (!Array.isArray(data.channels)) data.channels = [];
        
        // デフォルトチャイムの確認
        if (!data.chimes.find(c => c.id === 'default-chime')) {
            data.chimes.unshift({
                id: 'default-chime',
                name: '標準チャイム',
                file: null
            });
        }
        
        // 管理者パスワードの確認
        if (!data.adminPassword) {
            data.adminPassword = this.hashPassword(CONFIG.DEFAULT_ADMIN_PASSWORD);
        }
        
        return data;
    }
    
    saveData(data = this.data) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
            this.data = data;
            return true;
        } catch (error) {
            ErrorHandler.handleStorageError(error);
            return false;
        }
    }
    
    // CRUD Operations
    addItem(collection, item) {
        if (!this.data[collection] || !Array.isArray(this.data[collection])) {
            return null;
        }
        
        const id = this.generateId();
        const newItem = { id, ...item, createdAt: new Date().toISOString() };
        
        this.data[collection].push(newItem);
        
        if (this.saveData()) {
            return id;
        }
        return null;
    }
    
    updateItem(collection, id, updates) {
        if (!this.data[collection] || !Array.isArray(this.data[collection])) {
            return false;
        }
        
        const index = this.data[collection].findIndex(item => item.id === id);
        if (index === -1) return false;
        
        this.data[collection][index] = {
            ...this.data[collection][index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        return this.saveData();
    }
    
    deleteItem(collection, id) {
        if (!this.data[collection] || !Array.isArray(this.data[collection])) {
            return false;
        }
        
        const initialLength = this.data[collection].length;
        this.data[collection] = this.data[collection].filter(item => item.id !== id);
        
        // 関連データの削除
        this.cleanupRelatedData(collection, id);
        
        return this.data[collection].length < initialLength && this.saveData();
    }
    
    cleanupRelatedData(collection, id) {
        switch (collection) {
            case 'companies':
                this.data.departments = this.data.departments.filter(d => d.companyId !== id);
                this.data.members = this.data.members.filter(m => {
                    const dept = this.data.departments.find(d => d.id === m.departmentId);
                    return dept && dept.companyId !== id;
                });
                break;
            case 'departments':
                this.data.members = this.data.members.filter(m => m.departmentId !== id);
                break;
        }
    }
    
    getItems(collection, filter = null) {
        if (!this.data[collection] || !Array.isArray(this.data[collection])) {
            return [];
        }
        
        let items = [...this.data[collection]];
        
        if (filter && typeof filter === 'function') {
            items = items.filter(filter);
        }
        
        return items;
    }
    
    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Theme Management
    getTheme() {
        return localStorage.getItem(CONFIG.THEME_KEY) || 'light';
    }
    
    saveTheme(theme) {
        try {
            localStorage.setItem(CONFIG.THEME_KEY, theme);
            return true;
        } catch (error) {
            ErrorHandler.handleStorageError(error);
            return false;
        }
    }
    
    // Password Management
    hashPassword(password) {
        // 簡易ハッシュ化（実運用では適切なハッシュ化を実装）
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return hash.toString();
    }
    
    verifyPassword(password) {
        return this.hashPassword(password) === this.data.adminPassword;
    }
    
    updatePassword(newPassword) {
        this.data.adminPassword = this.hashPassword(newPassword);
        return this.saveData();
    }
}

// ==========================================================================
// Audio Manager
// ==========================================================================

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = new Map();
        this.isInitialized = false;
        this.isUserInteracted = false;
    }
    
    async initialize() {
        if (this.isInitialized) return true;
        
        try {
            // iOS 12.5.x対応
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                throw new Error('AudioContext not supported');
            }
            
            this.audioContext = new AudioContext();
            this.isInitialized = true;
            return true;
        } catch (error) {
            ErrorHandler.handleAudioError(error);
            return false;
        }
    }
    
    async resumeContext() {
        if (!this.audioContext) return false;
        
        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            return true;
        } catch (error) {
            ErrorHandler.handleAudioError(error);
            return false;
        }
    }
    
    async loadAudioFile(id, arrayBuffer) {
        if (!await this.initialize()) return false;
        
        try {
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice());
            this.audioBuffers.set(id, audioBuffer);
            return true;
        } catch (error) {
            ErrorHandler.handleAudioError(error);
            return false;
        }
    }
    
    async playChime(id) {
        if (!this.isUserInteracted) {
            ErrorHandler.show('音声再生にはユーザー操作が必要です');
            return false;
        }
        
        if (!await this.initialize()) return false;
        if (!await this.resumeContext()) return false;
        
        try {
            if (id === 'default-chime') {
                return await this.playDefaultChime();
            }
            
            const audioBuffer = this.audioBuffers.get(id);
            if (!audioBuffer) {
                throw new Error('Audio buffer not found');
            }
            
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = audioBuffer;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // フェードイン効果
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.7, this.audioContext.currentTime + 0.1);
            
            source.start();
            return true;
        } catch (error) {
            ErrorHandler.handleAudioError(error);
            return false;
        }
    }
    
    async playDefaultChime() {
        if (!await this.initialize()) return false;
        if (!await this.resumeContext()) return false;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // チャイム音のパターン
            const frequencies = [880, 659, 523, 659, 880];
            const duration = 0.2;
            const currentTime = this.audioContext.currentTime;
            
            frequencies.forEach((freq, index) => {
                const startTime = currentTime + (index * duration);
                oscillator.frequency.setValueAtTime(freq, startTime);
            });
            
            // エンベロープ
            gainNode.gain.setValueAtTime(0, currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, currentTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + (frequencies.length * duration));
            
            oscillator.start(currentTime);
            oscillator.stop(currentTime + (frequencies.length * duration));
            
            return true;
        } catch (error) {
            ErrorHandler.handleAudioError(error);
            return false;
        }
    }
    
    setUserInteracted() {
        this.isUserInteracted = true;
    }
    
    validateAudioFile(file) {
        if (!file) return { valid: false, error: '選択されたファイルがありません' };
        
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            return { 
                valid: false, 
                error: `${MESSAGES.ERRORS.FILE_TOO_LARGE} (${formatFileSize(file.size)})` 
            };
        }
        
        if (!CONFIG.SUPPORTED_AUDIO_TYPES.includes(file.type)) {
            return { 
                valid: false, 
                error: `${MESSAGES.ERRORS.INVALID_FILE_TYPE} (${file.type})` 
            };
        }
        
        return { valid: true };
    }
}

// ==========================================================================
// Network Manager
// ==========================================================================

class NetworkManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateOnlineStatus();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateOnlineStatus();
        });
    }
    
    updateOnlineStatus() {
        const statusEl = safeGetElement('#online-status');
        if (!statusEl) return;
        
        statusEl.className = `status-indicator ${this.isOnline ? 'online' : 'offline'}`;
        statusEl.innerHTML = `
            <span class="status-dot"></span>
            ${this.isOnline ? 'オンライン' : 'オフライン'}
        `;
    }
    
    async sendToTeams(webhookUrl, message) {
        if (!this.isOnline) {
            throw new Error('オフラインです');
        }
        
        if (!validateInput(webhookUrl, 'url')) {
            throw new Error(MESSAGES.ERRORS.INVALID_WEBHOOK);
        }
        
        const payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "summary": "チャイム通知",
            "themeColor": "0078D4",
            "sections": [{
                "activityTitle": "🔔 チャイム通知",
                "activitySubtitle": new Date().toLocaleString('ja-JP', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                }),
                "text": message,
                "markdown": true
            }]
        };
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト
        
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('リクエストがタイムアウトしました');
            }
            throw error;
        }
    }
}

// ==========================================================================
// UI Manager
// ==========================================================================

class UIManager {
    constructor() {
        this.currentScreen = 'main';
        this.currentTab = 'companies';
        this.isAdminAuthenticated = false;
        this.animations = new Map();
    }
    
    showScreen(screenName) {
        const screens = ['main', 'admin'];
        screens.forEach(screen => {
            const el = safeGetElement(`#${screen}-screen`);
            if (el) {
                el.classList.toggle('hidden', screen !== screenName);
            }
        });
        this.currentScreen = screenName;
    }
    
    showLoading(show = true) {
        const loadingEl = safeGetElement('#loading-screen');
        if (loadingEl) {
            loadingEl.classList.toggle('hidden', !show);
        }
    }
    
    showModal(title, message, confirmCallback = null) {
        const modal = safeGetElement('#confirm-dialog');
        const titleEl = safeGetElement('#confirm-title');
        const messageEl = safeGetElement('#confirm-message');
        const yesBtn = safeGetElement('#confirm-yes');
        const noBtn = safeGetElement('#confirm-no');
        
        if (!modal || !titleEl || !messageEl || !yesBtn || !noBtn) return;
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.remove('hidden');
        
        // イベントリスナーをクリア
        yesBtn.replaceWith(yesBtn.cloneNode(true));
        noBtn.replaceWith(noBtn.cloneNode(true));
        
        // 新しいイベントリスナーを追加
        const newYesBtn = safeGetElement('#confirm-yes');
        const newNoBtn = safeGetElement('#confirm-no');
        
        if (newYesBtn) {
            newYesBtn.addEventListener('click', () => {
                this.hideModal();
                if (confirmCallback) confirmCallback();
            });
        }
        
        if (newNoBtn) {
            newNoBtn.addEventListener('click', () => {
                this.hideModal();
            });
        }
    }
    
    hideModal() {
        const modal = safeGetElement('#confirm-dialog');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    createRippleEffect(event) {
        const button = event.currentTarget;
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        const ripple = document.createElement('span');
        ripple.classList.add('ripple-effect');
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        
        button.appendChild(ripple);
        
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }
    
    animateElement(element, animationClass, duration = CONFIG.ANIMATION_DURATION) {
        if (!element) return Promise.resolve();
        
        return new Promise((resolve) => {
            element.classList.add(animationClass);
            
            const animationId = setTimeout(() => {
                element.classList.remove(animationClass);
                resolve();
            }, duration);
            
            this.animations.set(element, animationId);
        });
    }
    
    showNotificationResult(success, isOnline, message = '') {
        const resultEl = safeGetElement('#notification-result');
        const iconEl = safeGetElement('#notification-result .result-icon');
        const messageEl = safeGetElement('#notification-result .result-message');
        
        if (!resultEl || !iconEl || !messageEl) return;
        
        let icon, className, text;
        
        if (success && isOnline) {
            icon = '✓';
            className = 'success';
            text = message || MESSAGES.SUCCESS.NOTIFICATION_SENT;
        } else if (success && !isOnline) {
            icon = '⚠';
            className = 'warning';
            text = message || MESSAGES.SUCCESS.NOTIFICATION_OFFLINE;
        } else {
            icon = '✗';
            className = 'error';
            text = message || MESSAGES.ERRORS.TEAMS_SEND_ERROR;
        }
        
        iconEl.textContent = icon;
        iconEl.className = `result-icon ${className}`;
        messageEl.textContent = text;
        
        resultEl.classList.remove('hidden');
        
        setTimeout(() => {
            resultEl.classList.add('hidden');
        }, CONFIG.NOTIFICATION_DURATION);
    }
    
    showWaveAnimation() {
        const container = safeGetElement('#wave-container');
        const canvas = safeGetElement('#wave-canvas');
        
        if (!container || !canvas) return;
        
        container.classList.remove('hidden');
        this.animateWave(canvas);
        
        setTimeout(() => {
            container.classList.add('hidden');
        }, CONFIG.WAVE_DURATION);
    }
    
    animateWave(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const width = rect.width;
        const height = rect.height;
        const centerY = height / 2;
        let time = 0;
        
        const animate = () => {
            ctx.clearRect(0, 0, width, height);
            
            // 波形の色を現在のテーマに合わせる
            const theme = document.getElementById('app').classList.contains('theme-dark') ? 'dark' : 'light';
            const strokeColor = theme === 'dark' ? '#64b5f6' : '#1976d2';
            
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let x = 0; x < width; x++) {
                const amplitude = 30 * Math.exp(-time * 0.5);
                const frequency = 0.02;
                const y = centerY + Math.sin((x * frequency) + time * 10) * amplitude;
                
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            time += 0.05;
            if (time < 2) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }
    
    updateTheme(theme) {
        const app = safeGetElement('#app');
        if (app) {
            app.className = `theme-${theme}`;
        }
        
        // テーマアイコンの更新
        const themeIcons = document.querySelectorAll('.theme-icon');
        themeIcons.forEach(icon => {
            // CSSで制御されるので、クラスの更新のみ
            icon.parentElement.setAttribute('title', 
                theme === 'light' ? 'ダークテーマに切替' : 'ライトテーマに切替'
            );
        });
    }
    
    populateSelect(selectId, items, valueKey = 'id', textKey = 'name', placeholder = '選択してください') {
        const select = safeGetElement(selectId);
        if (!select) return;
        
        select.innerHTML = `<option value="">${placeholder}</option>`;
        
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueKey];
            option.textContent = item[textKey];
            select.appendChild(option);
        });
    }
    
    clearSelect(selectId, placeholder = '選択してください') {
        const select = safeGetElement(selectId);
        if (!select) return;
        
        select.innerHTML = `<option value="">${placeholder}</option>`;
        select.disabled = true;
    }
    
    setSelectDisabled(selectId, disabled) {
        const select = safeGetElement(selectId);
        if (select) {
            select.disabled = disabled;
        }
    }
    
    setButtonLoading(buttonId, loading) {
        const button = safeGetElement(buttonId);
        if (!button) return;
        
        const text = button.querySelector('.button-text');
        const loader = button.querySelector('.button-loader');
        
        if (text && loader) {
            text.classList.toggle('hidden', loading);
            loader.classList.toggle('hidden', !loading);
        }
        
        button.disabled = loading;
    }
}

// ==========================================================================
// Main Application
// ==========================================================================

class ChimeNotificationApp {
    constructor() {
        this.storage = new StorageManager();
        this.audio = new AudioManager();
        this.network = new NetworkManager();
        this.ui = new UIManager();
        
        this.editingItem = null;
        this.sessionTimeout = null;
        
        this.init();
    }
    
    async init() {
        try {
            this.ui.showLoading(true);
            
            // テーマの適用
            this.applyTheme();
            
            // イベントリスナーの設定
            this.setupEventListeners();
            
            // データの読み込み
            this.loadInitialData();
            
            // オンライン状態の更新
            this.network.updateOnlineStatus();
            
            // 管理者セッションの確認
            this.checkAdminSession();
            
            this.ui.showLoading(false);
            this.ui.showScreen('main');
        } catch (error) {
            console.error('App initialization error:', error);
            ErrorHandler.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
            this.ui.showLoading(false);
        }
    }
    
    setupEventListeners() {
        // ユーザー操作の検知（音声再生用）
        document.addEventListener('click', () => {
            this.audio.setUserInteracted();
        }, { once: true });
        
        // テーマ切替
        const themeToggle = safeGetElement('#theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        const adminThemeToggle = safeGetElement('#admin-theme-toggle');
        if (adminThemeToggle) {
            adminThemeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        // 画面切替
        const adminToggle = safeGetElement('#admin-toggle');
        if (adminToggle) {
            adminToggle.addEventListener('click', () => this.showAdminScreen());
        }
        
        const backToMain = safeGetElement('#back-to-main');
        if (backToMain) {
            backToMain.addEventListener('click', () => this.showMainScreen());
        }
        
        // フォーム要素
        this.setupFormEventListeners();
        
        // 管理者機能
        this.setupAdminEventListeners();
        
        // リップルエフェクト
        this.setupRippleEffects();
    }
    
    setupFormEventListeners() {
        // 会社選択
        const companySelect = safeGetElement('#company-select');
        if (companySelect) {
            companySelect.addEventListener('change', (e) => {
                this.onCompanyChange(e.target.value);
            });
        }
        
        // 部署選択
        const departmentSelect = safeGetElement('#department-select');
        if (departmentSelect) {
            departmentSelect.addEventListener('change', (e) => {
                this.onDepartmentChange(e.target.value);
            });
        }
        
        // 担当者・チャイム音選択
        ['#member-select', '#chime-select'].forEach(selector => {
            const element = safeGetElement(selector);
            if (element) {
                element.addEventListener('change', () => {
                    this.validateNotificationForm();
                });
            }
        });
        
        // 通知ボタン
        const notifyBtn = safeGetElement('#notify-btn');
        if (notifyBtn) {
            notifyBtn.addEventListener('click', (e) => {
                this.handleNotification(e);
            });
        }
    }
    
    setupAdminEventListeners() {
        // 認証
        const authBtn = safeGetElement('#auth-btn');
        const passwordInput = safeGetElement('#admin-password');
        
        if (authBtn) {
            authBtn.addEventListener('click', () => this.handleAdminLogin());
        }
        
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleAdminLogin();
                }
            });
        }
        
        // ログアウト
        const logoutBtn = safeGetElement('#admin-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.ui.showModal('確認', MESSAGES.CONFIRM.LOGOUT, () => {
                    this.handleAdminLogout();
                });
            });
        }
        
        // タブ切替
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchAdminTab(e.target.dataset.tab);
            });
        });
        
        // データ管理ボタン
        this.setupDataManagementEventListeners();
    }
    
    setupDataManagementEventListeners() {
        const collections = ['company', 'department', 'member', 'chime', 'channel'];
        
        collections.forEach(collection => {
            // 追加ボタン
            const addBtn = safeGetElement(`#add-${collection}-btn`);
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this.showAddForm(collection);
                });
            }
            
            // 保存ボタン
            const saveBtn = safeGetElement(`#save-${collection}`);
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    this.saveItem(collection);
                });
            }
            
            // キャンセルボタン
            const cancelBtn = safeGetElement(`#cancel-${collection}`);
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    this.hideAddForm(collection);
                });
            }
        });
    }
    
    setupRippleEffects() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.ripple-button')) {
                this.ui.createRippleEffect(e);
            }
        });
    }
    
    // テーマ管理
    applyTheme() {
        const theme = this.storage.getTheme();
        this.ui.updateTheme(theme);
    }
    
    toggleTheme() {
        const currentTheme = this.storage.getTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        if (this.storage.saveTheme(newTheme)) {
            this.ui.updateTheme(newTheme);
        }
    }
    
    // 画面遷移
    showMainScreen() {
        this.ui.showScreen('main');
    }
    
    showAdminScreen() {
        this.ui.showScreen('admin');
        if (!this.ui.isAdminAuthenticated) {
            this.showAuthScreen();
        } else {
            this.showAdminContent();
        }
    }
    
    showAuthScreen() {
        const authScreen = safeGetElement('#auth-screen');
        const adminContent = safeGetElement('#admin-content');
        
        if (authScreen && adminContent) {
            authScreen.classList.remove('hidden');
            adminContent.classList.add('hidden');
        }
    }
    
    showAdminContent() {
        const authScreen = safeGetElement('#auth-screen');
        const adminContent = safeGetElement('#admin-content');
        
        if (authScreen && adminContent) {
            authScreen.classList.add('hidden');
            adminContent.classList.remove('hidden');
        }
        
        this.loadAdminData();
        this.startSessionTimeout();
    }
    
    // データ読み込み
    loadInitialData() {
        this.loadCompanies();
        this.loadChimes();
    }
    
    loadCompanies() {
        const companies = this.storage.getItems('companies');
        this.ui.populateSelect('#company-select', companies);
    }
    
    loadChimes() {
        const chimes = this.storage.getItems('chimes');
        this.ui.populateSelect('#chime-select', chimes);
        
        // 音声ファイルをプリロード
        this.preloadAudioFiles(chimes);
    }
    
    async preloadAudioFiles(chimes) {
        for (const chime of chimes) {
            if (chime.file && chime.id !== 'default-chime') {
                try {
                    const arrayBuffer = this.base64ToArrayBuffer(chime.file);
                    await this.audio.loadAudioFile(chime.id, arrayBuffer);
                } catch (error) {
                    console.warn(`Failed to preload audio: ${chime.name}`, error);
                }
            }
        }
    }
    
    // フォーム処理
    onCompanyChange(companyId) {
        this.ui.clearSelect('#department-select');
        this.ui.clearSelect('#member-select');
        
        if (companyId) {
            const departments = this.storage.getItems('departments', 
                d => d.companyId === companyId
            );
            this.ui.populateSelect('#department-select', departments);
            this.ui.setSelectDisabled('#department-select', false);
        }
        
        this.validateNotificationForm();
    }
    
    onDepartmentChange(departmentId) {
        this.ui.clearSelect('#member-select');
        
        if (departmentId) {
            const members = this.storage.getItems('members', 
                m => m.departmentId === departmentId
            );
            this.ui.populateSelect('#member-select', members);
            this.ui.setSelectDisabled('#member-select', false);
        }
        
        this.validateNotificationForm();
    }
    
    validateNotificationForm() {
        const company = safeGetElement('#company-select')?.value;
        const department = safeGetElement('#department-select')?.value;
        const member = safeGetElement('#member-select')?.value;
        const chime = safeGetElement('#chime-select')?.value;
        
        const isValid = company && department && member && chime;
        
        const notifyBtn = safeGetElement('#notify-btn');
        if (notifyBtn) {
            notifyBtn.disabled = !isValid;
        }
    }
    
    // 通知処理
    async handleNotification(event) {
        try {
            this.ui.setButtonLoading('#notify-btn', true);
            
            // チャイム音再生
            const chimeId = safeGetElement('#chime-select')?.value;
            if (chimeId) {
                const playSuccess = await this.audio.playChime(chimeId);
                if (playSuccess) {
                    this.ui.showWaveAnimation();
                }
            }
            
            // Teams通知送信（オンライン時のみ）
            let sendSuccess = true;
            if (this.network.isOnline) {
                sendSuccess = await this.sendTeamsNotification();
            }
            
            this.ui.showNotificationResult(true, this.network.isOnline && sendSuccess);
            
        } catch (error) {
            console.error('Notification error:', error);
            this.ui.showNotificationResult(false, this.network.isOnline, error.message);
        } finally {
            setTimeout(() => {
                this.ui.setButtonLoading('#notify-btn', false);
            }, 1000);
        }
    }
    
    async sendTeamsNotification() {
        const channels = this.storage.getItems('channels');
        if (channels.length === 0) {
            throw new Error('送信先チャネルが設定されていません');
        }
        
        const message = this.buildNotificationMessage();
        const promises = channels.map(channel => 
            this.network.sendToTeams(channel.webhook, message)
        );
        
        try {
            await Promise.all(promises);
            return true;
        } catch (error) {
            ErrorHandler.handleNetworkError(error);
            return false;
        }
    }
    
    buildNotificationMessage() {
        const companyId = safeGetElement('#company-select')?.value;
        const departmentId = safeGetElement('#department-select')?.value;
        const memberId = safeGetElement('#member-select')?.value;
        
        const company = this.storage.getItems('companies').find(c => c.id === companyId);
        const department = this.storage.getItems('departments').find(d => d.id === departmentId);
        const member = this.storage.getItems('members').find(m => m.id === memberId);
        
        return `**【チャイム通知】**\n` +
               `🏢 **会社**: ${company?.name || '不明'}\n` +
               `🏬 **部署**: ${department?.name || '不明'}\n` +
               `👤 **担当者**: ${member?.name || '不明'}\n` +
               `📅 **送信時刻**: ${new Date().toLocaleString('ja-JP')}`;
    }
    
    // 管理者認証
    handleAdminLogin() {
        const passwordInput = safeGetElement('#admin-password');
        const password = passwordInput?.value?.trim();
        
        if (!password) {
            ErrorHandler.show('パスワードを入力してください');
            return;
        }
        
        if (this.storage.verifyPassword(password)) {
            this.ui.isAdminAuthenticated = true;
            this.saveAdminSession();
            this.showAdminContent();
            passwordInput.value = '';
            
            // 成功メッセージを表示
            setTimeout(() => {
                this.ui.showNotificationResult(true, true, MESSAGES.SUCCESS.LOGIN_SUCCESS);
            }, 300);
        } else {
            ErrorHandler.show(MESSAGES.ERRORS.AUTH_FAILED);
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
    
    handleAdminLogout() {
        this.ui.isAdminAuthenticated = false;
        this.clearAdminSession();
        this.showAuthScreen();
        this.clearSessionTimeout();
    }
    
    saveAdminSession() {
        try {
            const session = {
                timestamp: Date.now(),
                expires: Date.now() + CONFIG.SESSION_TIMEOUT
            };
            localStorage.setItem(CONFIG.ADMIN_SESSION_KEY, JSON.stringify(session));
        } catch (error) {
            console.warn('Failed to save admin session:', error);
        }
    }
    
    checkAdminSession() {
        try {
            const stored = localStorage.getItem(CONFIG.ADMIN_SESSION_KEY);
            if (!stored) return;
            
            const session = JSON.parse(stored);
            if (Date.now() < session.expires) {
                this.ui.isAdminAuthenticated = true;
            } else {
                this.clearAdminSession();
            }
        } catch (error) {
            console.warn('Failed to check admin session:', error);
            this.clearAdminSession();
        }
    }
    
    clearAdminSession() {
        try {
            localStorage.removeItem(CONFIG.ADMIN_SESSION_KEY);
        } catch (error) {
            console.warn('Failed to clear admin session:', error);
        }
    }
    
    startSessionTimeout() {
        this.clearSessionTimeout();
        this.sessionTimeout = setTimeout(() => {
            this.handleAdminLogout();
            ErrorHandler.show('セッションがタイムアウトしました');
        }, CONFIG.SESSION_TIMEOUT);
    }
    
    clearSessionTimeout() {
        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
            this.sessionTimeout = null;
        }
    }
    
    // 管理者画面
    switchAdminTab(tabName) {
        // タブボタンの更新
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // タブパネルの更新
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });
        
        this.ui.currentTab = tabName;
        this.loadTabData(tabName);
    }
    
    loadAdminData() {
        this.loadTabData(this.ui.currentTab);
        this.populateSelectsForForms();
    }
    
    loadTabData(tabName) {
        switch (tabName) {
            case 'companies':
                this.renderCompaniesList();
                break;
            case 'departments':
                this.renderDepartmentsList();
                break;
            case 'members':
                this.renderMembersList();
                break;
            case 'chimes':
                this.renderChimesList();
                break;
            case 'channels':
                this.renderChannelsList();
                break;
        }
    }
    
    populateSelectsForForms() {
        // 部署フォーム用の会社選択
        const companies = this.storage.getItems('companies');
        this.ui.populateSelect('#department-company', companies);
        
        // 担当者フォーム用の部署選択
        const departments = this.storage.getItems('departments');
        this.ui.populateSelect('#member-department', departments.map(d => {
            const company = companies.find(c => c.id === d.companyId);
            return {
                ...d,
                name: `${company?.name || '不明'} - ${d.name}`
            };
        }));
    }
    
    // データレンダリング
    renderCompaniesList() {
        const companies = this.storage.getItems('companies');
        const listEl = safeGetElement('#companies-list');
        if (!listEl) return;
        
        listEl.innerHTML = companies.map(company => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${this.escapeHtml(company.name)}</div>
                    <div class="item-detail">ID: ${company.id}</div>
                </div>
                <div class="item-actions">
                    <button class="delete-button" onclick="app.deleteItem('companies', '${company.id}')">
                        削除
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    renderDepartmentsList() {
        const departments = this.storage.getItems('departments');
        const companies = this.storage.getItems('companies');
        const listEl = safeGetElement('#departments-list');
        if (!listEl) return;
        
        listEl.innerHTML = departments.map(dept => {
            const company = companies.find(c => c.id === dept.companyId);
            return `
                <div class="item-card">
                    <div class="item-info">
                        <div class="item-name">${this.escapeHtml(dept.name)}</div>
                        <div class="item-detail">会社: ${this.escapeHtml(company?.name || '不明')}</div>
                    </div>
                    <div class="item-actions">
                        <button class="delete-button" onclick="app.deleteItem('departments', '${dept.id}')">
                            削除
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderMembersList() {
        const members = this.storage.getItems('members');
        const departments = this.storage.getItems('departments');
        const companies = this.storage.getItems('companies');
        const listEl = safeGetElement('#members-list');
        if (!listEl) return;
        
        listEl.innerHTML = members.map(member => {
            const dept = departments.find(d => d.id === member.departmentId);
            const company = companies.find(c => c.id === dept?.companyId);
            return `
                <div class="item-card">
                    <div class="item-info">
                        <div class="item-name">${this.escapeHtml(member.name)}</div>
                        <div class="item-detail">
                            ${this.escapeHtml(company?.name || '不明')} - ${this.escapeHtml(dept?.name || '不明')}
                        </div>
                    </div>
                    <div class="item-actions">
                        <button class="delete-button" onclick="app.deleteItem('members', '${member.id}')">
                            削除
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderChimesList() {
        const chimes = this.storage.getItems('chimes');
        const listEl = safeGetElement('#chimes-list');
        if (!listEl) return;
        
        listEl.innerHTML = chimes.map(chime => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${this.escapeHtml(chime.name)}</div>
                    <div class="item-detail">
                        ${chime.id === 'default-chime' ? '内蔵チャイム' : 'アップロード済み'}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="play-button" onclick="app.playChime('${chime.id}')">
                        再生
                    </button>
                    ${chime.id !== 'default-chime' ? `
                        <button class="delete-button" onclick="app.deleteItem('chimes', '${chime.id}')">
                            削除
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
    
    renderChannelsList() {
        const channels = this.storage.getItems('channels');
        const listEl = safeGetElement('#channels-list');
        if (!listEl) return;
        
        listEl.innerHTML = channels.map(channel => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${this.escapeHtml(channel.name)}</div>
                    <div class="item-detail">${this.escapeHtml(this.truncateUrl(channel.webhook))}</div>
                </div>
                <div class="item-actions">
                    <button class="delete-button" onclick="app.deleteItem('channels', '${channel.id}')">
                        削除
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    // フォーム管理
    showAddForm(collection) {
        const form = safeGetElement(`#${collection}-form`);
        if (form) {
            form.classList.remove('hidden');
            this.ui.animateElement(form, 'fade-in');
        }
    }
    
    hideAddForm(collection) {
        const form = safeGetElement(`#${collection}-form`);
        if (form) {
            form.classList.add('hidden');
            this.clearForm(collection);
        }
    }
    
    clearForm(collection) {
        const inputs = document.querySelectorAll(`#${collection}-form input, #${collection}-form select`);
        inputs.forEach(input => {
            if (input.type === 'file') {
                input.value = '';
            } else {
                input.value = '';
            }
        });
    }
    
    // データ保存
    async saveItem(collection) {
        try {
            let data;
            
            switch (collection) {
                case 'company':
                    data = await this.saveCompany();
                    break;
                case 'department':
                    data = await this.saveDepartment();
                    break;
                case 'member':
                    data = await this.saveMember();
                    break;
                case 'chime':
                    data = await this.saveChime();
                    break;
                case 'channel':
                    data = await this.saveChannel();
                    break;
                default:
                    throw new Error('Unknown collection');
            }
            
            if (data) {
                const plural = collection === 'company' ? 'companies' : `${collection}s`;
                const id = this.storage.addItem(plural, data);
                
                if (id) {
                    this.hideAddForm(collection);
                    this.loadTabData(plural);
                    this.loadInitialData(); // メインフォームを更新
                    this.populateSelectsForForms(); // 管理フォームを更新
                    this.ui.showNotificationResult(true, true, MESSAGES.SUCCESS.DATA_SAVED);
                } else {
                    throw new Error('Failed to save data');
                }
            }
        } catch (error) {
            console.error('Save error:', error);
            ErrorHandler.show(error.message || MESSAGES.ERRORS.VALIDATION_ERROR);
        }
    }
    
    async saveCompany() {
        const nameInput = safeGetElement('#company-name');
        const name = nameInput?.value?.trim();
        
        if (!validateInput(name, 'text', { minLength: 1, maxLength: 50 })) {
            throw new Error('会社名を正しく入力してください（1-50文字）');
        }
        
        return { name };
    }
    
    async saveDepartment() {
        const companySelect = safeGetElement('#department-company');
        const nameInput = safeGetElement('#department-name');
        
        const companyId = companySelect?.value;
        const name = nameInput?.value?.trim();
        
        if (!companyId) {
            throw new Error('会社を選択してください');
        }
        
        if (!validateInput(name, 'text', { minLength: 1, maxLength: 50 })) {
            throw new Error('部署名を正しく入力してください（1-50文字）');
        }
        
        return { companyId, name };
    }
    
    async saveMember() {
        const departmentSelect = safeGetElement('#member-department');
        const nameInput = safeGetElement('#member-name');
        
        const departmentId = departmentSelect?.value;
        const name = nameInput?.value?.trim();
        
        if (!departmentId) {
            throw new Error('部署を選択してください');
        }
        
        if (!validateInput(name, 'text', { minLength: 1, maxLength: 50 })) {
            throw new Error('担当者名を正しく入力してください（1-50文字）');
        }
        
        return { departmentId, name };
    }
    
    async saveChime() {
        const nameInput = safeGetElement('#chime-name');
        const fileInput = safeGetElement('#chime-file');
        
        const name = nameInput?.value?.trim();
        const file = fileInput?.files?.[0];
        
        if (!validateInput(name, 'text', { minLength: 1, maxLength: 50 })) {
            throw new Error('チャイム音名を正しく入力してください（1-50文字）');
        }
        
        if (!file) {
            throw new Error('音声ファイルを選択してください');
        }
        
        const validation = this.audio.validateAudioFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        
        const fileData = await this.fileToBase64(file);
        
        // 音声ファイルの読み込みテスト
        const arrayBuffer = this.base64ToArrayBuffer(fileData);
        const testId = 'test_' + Date.now();
        const loadSuccess = await this.audio.loadAudioFile(testId, arrayBuffer);
        
        if (!loadSuccess) {
            throw new Error('音声ファイルの形式が正しくありません');
        }
        
        return { name, file: fileData };
    }
    
    async saveChannel() {
        const nameInput = safeGetElement('#channel-name');
        const webhookInput = safeGetElement('#channel-webhook');
        
        const name = nameInput?.value?.trim();
        const webhook = webhookInput?.value?.trim();
        
        if (!validateInput(name, 'text', { minLength: 1, maxLength: 50 })) {
            throw new Error('チャネル名を正しく入力してください（1-50文字）');
        }
        
        if (!validateInput(webhook, 'url')) {
            throw new Error('正しいWebhook URLを入力してください');
        }
        
        if (!webhook.includes('outlook.office.com') && !webhook.includes('outlook.office365.com')) {
            throw new Error('Microsoft Teams Webhook URLを入力してください');
        }
        
        return { name, webhook };
    }
    
    // データ削除
    deleteItem(collection, id) {
        this.ui.showModal('確認', MESSAGES.CONFIRM.DELETE_ITEM, () => {
            const success = this.storage.deleteItem(collection, id);
            if (success) {
                this.loadTabData(this.ui.currentTab);
                this.loadInitialData(); // メインフォームを更新
                this.populateSelectsForForms(); // 管理フォームを更新
                this.ui.showNotificationResult(true, true, MESSAGES.SUCCESS.DATA_DELETED);
            } else {
                ErrorHandler.show('削除に失敗しました');
            }
        });
    }
    
    // チャイム再生（管理画面から）
    async playChime(id) {
        try {
            const success = await this.audio.playChime(id);
            if (!success) {
                ErrorHandler.show(MESSAGES.ERRORS.AUDIO_ERROR);
            }
        } catch (error) {
            console.error('Play chime error:', error);
            ErrorHandler.show(MESSAGES.ERRORS.AUDIO_ERROR);
        }
    }
    
    // ユーティリティメソッド
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    truncateUrl(url, maxLength = 50) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    }
    
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                if (typeof result === 'string') {
                    resolve(result.split(',')[1]); // data:... プレフィックスを除去
                } else {
                    reject(new Error('Failed to read file'));
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// ==========================================================================
// PWA Service Worker Registration
// ==========================================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker registered:', registration);
            
            // 更新チェック
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 新しいバージョンが利用可能
                            if (confirm('新しいバージョンが利用可能です。更新しますか？')) {
                                window.location.reload();
                            }
                        }
                    });
                }
            });
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    });
}

// ==========================================================================
// Application Initialization
// ==========================================================================

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new ChimeNotificationApp();
});

// iOS 12.5.x 対応: ページ非表示時の処理
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // バックグラウンド時の処理
        if (app?.audio?.audioContext?.state === 'running') {
            app.audio.audioContext.suspend();
        }
    } else {
        // フォアグラウンド復帰時の処理
        if (app?.audio?.audioContext?.state === 'suspended') {
            app.audio.audioContext.resume();
        }
    }
});

// ページアンロード時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (app) {
        app.clearSessionTimeout();
    }
});
