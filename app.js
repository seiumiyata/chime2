/**
 * チャイム通知PWA - 大きなボタンUI版
 * iPad mini 2 (iOS 12.5.x) 完全対応
 * エラーハンドリング・検索・ページネーション機能搭載
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
    WAVE_DURATION: 2500,
    NOTIFICATION_DURATION: 4000,
    ERROR_DURATION: 5000,
    ITEMS_PER_PAGE: 8, // 2列 × 4行
    SEARCH_DEBOUNCE: 300,
    INIT_TIMEOUT: 15000 // 初期化タイムアウト
};

const SCREENS = {
    COMPANY: 'company',
    DEPARTMENT: 'department',
    MEMBER: 'member',
    NOTIFICATION: 'notification'
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
        UNKNOWN_ERROR: '予期しないエラーが発生しました',
        NO_DATA: 'データがありません',
        USER_INTERACTION_REQUIRED: '音声再生にはユーザー操作が必要です'
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
        LOGOUT: 'ログアウトしますか？',
        RESET_SELECTION: '選択をリセットして最初からやり直しますか？'
    }
};

// デバッグ情報
window.DEBUG_INFO = {
    domLoaded: false,
    appCreated: false,
    initCompleted: false,
    serviceWorkerRegistered: false,
    errors: []
};

// ==========================================================================
// Utility Functions
// ==========================================================================

function safeExecute(fn, errorMessage = MESSAGES.ERRORS.UNKNOWN_ERROR) {
    try {
        return fn();
    } catch (error) {
        console.error(errorMessage, error);
        window.DEBUG_INFO.errors.push({ message: errorMessage, error: error.message });
        ErrorHandler.show(errorMessage);
        return null;
    }
}

async function safeExecuteAsync(fn, errorMessage = MESSAGES.ERRORS.UNKNOWN_ERROR) {
    try {
        return await fn();
    } catch (error) {
        console.error(errorMessage, error);
        window.DEBUG_INFO.errors.push({ message: errorMessage, error: error.message });
        ErrorHandler.show(errorMessage);
        return null;
    }
}

function safeGetElement(selector) {
    try {
        const element = document.querySelector(selector);
        if (!element) {
            console.warn(`Element not found: ${selector}`);
        }
        return element;
    } catch (error) {
        console.error(`Error getting element ${selector}:`, error);
        return null;
    }
}

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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateText(text, maxLength = 50) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

// グローバル関数
function hideError() {
    ErrorHandler.hide();
}

// デバッグ用関数
window.checkDebugInfo = () => {
    console.table(window.DEBUG_INFO);
    const loadingScreen = document.querySelector('#loading-screen');
    console.log('Loading screen visible:', loadingScreen && !loadingScreen.classList.contains('hidden'));
};

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
    window.DEBUG_INFO.errors.push({ type: 'global', error: event.error.message });
    ErrorHandler.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    window.DEBUG_INFO.errors.push({ type: 'unhandled-rejection', error: event.reason });
    ErrorHandler.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
});

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
            return this.migrateData(parsed);
        } catch (error) {
            console.error('Data parse error:', error);
            throw error;
        }
    }
    
    migrateData(data) {
        if (!data.version) {
            data.version = '1.0.0';
        }
        
        if (!Array.isArray(data.companies)) data.companies = [];
        if (!Array.isArray(data.departments)) data.departments = [];
        if (!Array.isArray(data.members)) data.members = [];
        if (!Array.isArray(data.chimes)) data.chimes = [];
        if (!Array.isArray(data.channels)) data.channels = [];
        
        if (!data.chimes.find(c => c.id === 'default-chime')) {
            data.chimes.unshift({
                id: 'default-chime',
                name: '標準チャイム',
                file: null
            });
        }
        
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
    
    searchItems(collection, query, searchFields = ['name']) {
        const items = this.getItems(collection);
        if (!query) return items;
        
        const normalizedQuery = query.toLowerCase().trim();
        return items.filter(item => {
            return searchFields.some(field => {
                const value = item[field];
                return value && value.toLowerCase().includes(normalizedQuery);
            });
        });
    }
    
    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
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
    
    hashPassword(password) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
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
            ErrorHandler.show(MESSAGES.ERRORS.USER_INTERACTION_REQUIRED);
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
            
            const frequencies = [880, 659, 523, 659, 880];
            const duration = 0.2;
            const currentTime = this.audioContext.currentTime;
            
            frequencies.forEach((freq, index) => {
                const startTime = currentTime + (index * duration);
                oscillator.frequency.setValueAtTime(freq, startTime);
            });
            
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
        if (!file) return { valid: false, error: 'ファイルが選択されていません' };
        
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
            <span class="status-text">${this.isOnline ? 'オンライン' : 'オフライン'}</span>
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
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
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
// Screen Manager
// ==========================================================================

class ScreenManager {
    constructor() {
        this.currentScreen = SCREENS.COMPANY;
        this.history = [];
        this.selections = {
            company: null,
            department: null,
            member: null,
            chime: null
        };
        this.searchQueries = {
            company: '',
            department: '',
            member: ''
        };
        this.pagination = {
            company: { currentPage: 1 },
            department: { currentPage: 1 },
            member: { currentPage: 1 },
            chime: { currentPage: 1 }
        };
    }

    showScreen(screenName, addToHistory = true) {
        if (addToHistory && this.currentScreen !== screenName) {
            this.history.push(this.currentScreen);
        }

        document.querySelectorAll('.selection-screen').forEach(screen => {
            screen.classList.remove('active');
        });

        const targetScreen = safeGetElement(`#${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenName;
            this.updateHeader();
            this.updateProgressBar();
        }
    }

    goBack() {
        if (this.history.length > 0) {
            const previousScreen = this.history.pop();
            this.showScreen(previousScreen, false);
            
            switch (this.currentScreen) {
                case SCREENS.COMPANY:
                    this.selections.company = null;
                    this.selections.department = null;
                    this.selections.member = null;
                    this.selections.chime = null;
                    break;
                case SCREENS.DEPARTMENT:
                    this.selections.department = null;
                    this.selections.member = null;
                    this.selections.chime = null;
                    break;
                case SCREENS.MEMBER:
                    this.selections.member = null;
                    this.selections.chime = null;
                    break;
                case SCREENS.NOTIFICATION:
                    this.selections.chime = null;
                    break;
            }
        }
    }

    updateHeader() {
        const backBtn = safeGetElement('#back-btn');
        const screenTitle = safeGetElement('#screen-title');
        
        if (backBtn) {
            backBtn.classList.toggle('hidden', this.history.length === 0);
        }

        if (screenTitle) {
            const titles = {
                [SCREENS.COMPANY]: 'チャイム通知システム',
                [SCREENS.DEPARTMENT]: '部署選択',
                [SCREENS.MEMBER]: '担当者選択',
                [SCREENS.NOTIFICATION]: '通知送信'
            };
            screenTitle.textContent = titles[this.currentScreen] || 'チャイム通知システム';
        }
    }

    updateProgressBar() {
        const steps = [SCREENS.COMPANY, SCREENS.DEPARTMENT, SCREENS.MEMBER, SCREENS.NOTIFICATION];
        const currentIndex = steps.indexOf(this.currentScreen);
        const progressPercent = ((currentIndex + 1) / steps.length) * 100;
        
        const progressFill = safeGetElement('#progress-fill');
        if (progressFill) {
            progressFill.style.width = `${progressPercent}%`;
        }
        
        steps.forEach((step, index) => {
            const stepEl = safeGetElement(`#step-${step}`);
            if (stepEl) {
                stepEl.classList.remove('active', 'completed');
                
                if (index < currentIndex) {
                    stepEl.classList.add('completed');
                } else if (index === currentIndex) {
                    stepEl.classList.add('active');
                }
            }
        });
    }

    resetSelections() {
        this.selections = {
            company: null,
            department: null,
            member: null,
            chime: null
        };
        this.searchQueries = {
            company: '',
            department: '',
            member: ''
        };
        this.pagination = {
            company: { currentPage: 1 },
            department: { currentPage: 1 },
            member: { currentPage: 1 },
            chime: { currentPage: 1 }
        };
        this.history = [];
        this.showScreen(SCREENS.COMPANY, false);
    }
}

// ==========================================================================
// Pagination Manager
// ==========================================================================

class PaginationManager {
    createPagination(containerId, items, currentPage, onPageChange) {
        const container = safeGetElement(`#${containerId}`);
        if (!container) return;

        const totalPages = Math.ceil(items.length / CONFIG.ITEMS_PER_PAGE);
        
        if (totalPages <= 1) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        container.innerHTML = `
            <button class="page-btn prev-btn" ${currentPage <= 1 ? 'disabled' : ''}>
                ‹
            </button>
            <span class="page-info">${currentPage} / ${totalPages}</span>
            <button class="page-btn next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>
                ›
            </button>
        `;

        const prevBtn = container.querySelector('.prev-btn');
        const nextBtn = container.querySelector('.next-btn');

        if (prevBtn && !prevBtn.disabled) {
            prevBtn.addEventListener('click', () => {
                onPageChange(currentPage - 1);
            });
        }

        if (nextBtn && !nextBtn.disabled) {
            nextBtn.addEventListener('click', () => {
                onPageChange(currentPage + 1);
            });
        }
    }

    getPageItems(items, currentPage) {
        const startIndex = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
        const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
        return items.slice(startIndex, endIndex);
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
        
        yesBtn.replaceWith(yesBtn.cloneNode(true));
        noBtn.replaceWith(noBtn.cloneNode(true));
        
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
    
    showNotificationResult(success, isOnline, message = '', detail = '') {
        const resultEl = safeGetElement('#notification-result');
        const iconEl = safeGetElement('#notification-result .result-icon');
        const messageEl = safeGetElement('#notification-result .result-message');
        const detailEl = safeGetElement('#notification-result .result-detail');
        
        if (!resultEl || !iconEl || !messageEl) return;
        
        let icon, className, text, detailText;
        
        if (success && isOnline) {
            icon = '✓';
            className = 'success';
            text = message || MESSAGES.SUCCESS.NOTIFICATION_SENT;
            detailText = detail || 'Teamsチャネルに送信完了';
        } else if (success && !isOnline) {
            icon = '⚠';
            className = 'warning';
            text = message || MESSAGES.SUCCESS.NOTIFICATION_OFFLINE;
            detailText = detail || 'オフラインのため通知は送信されませんでした';
        } else {
            icon = '✗';
            className = 'error';
            text = message || MESSAGES.ERRORS.TEAMS_SEND_ERROR;
            detailText = detail || 'もう一度お試しください';
        }
        
        iconEl.textContent = icon;
        iconEl.className = `result-icon ${className}`;
        messageEl.textContent = text;
        
        if (detailEl) {
            detailEl.textContent = detailText;
        }
        
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
            
            const theme = document.getElementById('app').classList.contains('theme-dark') ? 'dark' : 'light';
            const strokeColor = theme === 'dark' ? '#60a5fa' : '#1d4ed8';
            
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            ctx.shadowColor = strokeColor;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            
            for (let x = 0; x < width; x++) {
                const amplitude = 25 * Math.exp(-time * 0.4);
                const frequency = 0.02;
                const y = centerY + Math.sin((x * frequency) + time * 8) * amplitude;
                
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            time += 0.05;
            if (time < 2.5) {
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
        
        const themeIcons = document.querySelectorAll('.theme-icon');
        themeIcons.forEach(icon => {
            icon.parentElement.setAttribute('title', 
                theme === 'light' ? 'ダークテーマに切替' : 'ライトテーマに切替'
            );
        });
    }
    
    setButtonLoading(buttonId, loading) {
        const button = safeGetElement(buttonId);
        if (!button) return;
        
        const content = button.querySelector('.button-content');
        const loader = button.querySelector('.button-loader');
        
        if (content && loader) {
            content.classList.toggle('hidden', loading);
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
        try {
            this.storage = new StorageManager();
            this.audio = new AudioManager();
            this.network = new NetworkManager();
            this.ui = new UIManager();
            this.screenManager = new ScreenManager();
            this.paginationManager = new PaginationManager();
            
            this.editingItem = null;
            this.sessionTimeout = null;
            this.searchDebounceTimers = {};
            
            window.DEBUG_INFO.appCreated = true;
            this.init();
        } catch (error) {
            console.error('App constructor error:', error);
            window.DEBUG_INFO.errors.push({ type: 'constructor', error: error.message });
            throw error;
        }
    }

    async init() {
        try {
            this.ui.showLoading(true);
            
            // 段階的初期化
            await this.initializeStepByStep();
            
            window.DEBUG_INFO.initCompleted = true;
            
            setTimeout(() => {
                this.ui.showLoading(false);
                this.ui.showScreen('main');
            }, 500);
            
        } catch (error) {
            console.error('App initialization error:', error);
            window.DEBUG_INFO.errors.push({ type: 'init', error: error.message });
            
            setTimeout(() => {
                this.ui.showLoading(false);
                this.ui.showScreen('main');
                ErrorHandler.show('初期化中にエラーが発生しましたが、アプリは使用可能です');
            }, 1000);
        }
    }

    async initializeStepByStep() {
        const steps = [
            () => this.applyTheme(),
            () => this.setupEventListeners(),
            () => this.loadCurrentScreenData(),
            () => this.network.updateOnlineStatus(),
            () => this.checkAdminSession()
        ];

        for (const step of steps) {
            try {
                await step();
                // iPad mini 2対応：各ステップ間で少し待機
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                console.error('Init step error:', error);
                window.DEBUG_INFO.errors.push({ type: 'init-step', error: error.message });
            }
        }
    }
    
    setupEventListeners() {
        // ユーザー操作検知
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

        // 戻るボタン
        const backBtn = safeGetElement('#back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.screenManager.goBack();
                this.loadCurrentScreenData();
            });
        }

        // 通知・リセットボタン
        const notifyBtn = safeGetElement('#notify-btn');
        if (notifyBtn) {
            notifyBtn.addEventListener('click', (e) => {
                this.handleNotification(e);
            });
        }

        const resetBtn = safeGetElement('#reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.ui.showModal('確認', MESSAGES.CONFIRM.RESET_SELECTION, () => {
                    this.screenManager.resetSelections();
                    this.loadCurrentScreenData();
                });
            });
        }

        // 検索機能
        this.setupSearchEventListeners();

        // 管理者機能
        this.setupAdminEventListeners();

        // リップルエフェクト
        this.setupRippleEffects();
    }

    setupSearchEventListeners() {
        const searchInputs = ['company', 'department', 'member'];
        
        searchInputs.forEach(type => {
            const searchInput = safeGetElement(`#${type}-search`);
            if (searchInput) {
                searchInput.addEventListener('input', debounce((e) => {
                    this.screenManager.searchQueries[type] = e.target.value;
                    this.screenManager.pagination[type].currentPage = 1;
                    this.loadCurrentScreenData();
                }, CONFIG.SEARCH_DEBOUNCE));
            }
        });
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
                this.switchAdminTab(e.target.closest('.nav-tab').dataset.tab);
            });
        });
        
        this.setupDataManagementEventListeners();
    }
    
        setupDataManagementEventListeners() {
        const collections = ['company', 'department', 'member', 'chime', 'channel'];
        
        collections.forEach(collection => {
            const addBtn = safeGetElement(`#add-${collection}-btn`);
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this.showAddForm(collection);
                });
            }
            
            const saveBtn = safeGetElement(`#save-${collection}`);
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    this.saveItem(collection);
                });
            }
            
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
        this.screenManager.resetSelections();
        this.loadCurrentScreenData();
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
        
        if (authScreen) authScreen.classList.remove('hidden');
        if (adminContent) adminContent.classList.add('hidden');
    }

    showAdminContent() {
        const authScreen = safeGetElement('#auth-screen');
        const adminContent = safeGetElement('#admin-content');
        
        if (authScreen) authScreen.classList.add('hidden');
        if (adminContent) adminContent.classList.remove('hidden');
        
        this.loadAdminData();
    }

    // 現在画面データ読み込み
    loadCurrentScreenData() {
        switch (this.screenManager.currentScreen) {
            case SCREENS.COMPANY:
                this.loadCompanyScreen();
                break;
            case SCREENS.DEPARTMENT:
                this.loadDepartmentScreen();
                break;
            case SCREENS.MEMBER:
                this.loadMemberScreen();
                break;
            case SCREENS.NOTIFICATION:
                this.loadNotificationScreen();
                break;
        }
    }

    // 会社画面読み込み
    loadCompanyScreen() {
        const query = this.screenManager.searchQueries.company;
        const companies = query ? 
            this.storage.searchItems('companies', query) :
            this.storage.getItems('companies');
        
        const currentPage = this.screenManager.pagination.company.currentPage;
        
        this.renderButtonGrid('company', companies, currentPage, (company) => {
            this.screenManager.selections.company = company;
            this.screenManager.showScreen(SCREENS.DEPARTMENT);
            this.loadDepartmentScreen();
        });
    }

    // 部署画面読み込み
    loadDepartmentScreen() {
        const selectedCompany = this.screenManager.selections.company;
        if (!selectedCompany) return;

        const companyNameEl = safeGetElement('#selected-company-name');
        if (companyNameEl) {
            companyNameEl.textContent = selectedCompany.name;
        }

        const query = this.screenManager.searchQueries.department;
        let departments = this.storage.getItems('departments', 
            d => d.companyId === selectedCompany.id
        );
        
        if (query) {
            departments = departments.filter(d => 
                d.name.toLowerCase().includes(query.toLowerCase())
            );
        }
        
        const currentPage = this.screenManager.pagination.department.currentPage;
        
        this.renderButtonGrid('department', departments, currentPage, (department) => {
            this.screenManager.selections.department = department;
            this.screenManager.showScreen(SCREENS.MEMBER);
            this.loadMemberScreen();
        });
    }

    // 担当者画面読み込み
    loadMemberScreen() {
        const selectedCompany = this.screenManager.selections.company;
        const selectedDepartment = this.screenManager.selections.department;
        if (!selectedCompany || !selectedDepartment) return;

        const companyNameEl = safeGetElement('#member-selected-company');
        const deptNameEl = safeGetElement('#member-selected-department');
        
        if (companyNameEl) companyNameEl.textContent = selectedCompany.name;
        if (deptNameEl) deptNameEl.textContent = selectedDepartment.name;

        const query = this.screenManager.searchQueries.member;
        let members = this.storage.getItems('members', 
            m => m.departmentId === selectedDepartment.id
        );
        
        if (query) {
            members = members.filter(m => 
                m.name.toLowerCase().includes(query.toLowerCase())
            );
        }
        
        const currentPage = this.screenManager.pagination.member.currentPage;
        
        this.renderButtonGrid('member', members, currentPage, (member) => {
            this.screenManager.selections.member = member;
            this.screenManager.showScreen(SCREENS.NOTIFICATION);
            this.loadNotificationScreen();
        });
    }

    // 通知画面読み込み
    loadNotificationScreen() {
        this.updateSelectionSummary();
        
        const chimes = this.storage.getItems('chimes');
        const currentPage = this.screenManager.pagination.chime.currentPage;
        
        this.renderChimeGrid(chimes, currentPage, (chime) => {
            this.screenManager.selections.chime = chime;
            this.validateNotificationForm();
            this.updateSelectionSummary();
        });

        this.preloadAudioFiles(chimes);
    }

    // 選択内容サマリー更新
    updateSelectionSummary() {
        const { company, department, member, chime } = this.screenManager.selections;

        const companyEl = safeGetElement('#final-company-name');
        const departmentEl = safeGetElement('#final-department-name');
        const memberEl = safeGetElement('#final-member-name');
        const chimeEl = safeGetElement('#final-chime-name');

        if (companyEl) companyEl.textContent = company?.name || '-';
        if (departmentEl) departmentEl.textContent = department?.name || '-';
        if (memberEl) memberEl.textContent = member?.name || '-';
        if (chimeEl) chimeEl.textContent = chime?.name || '未選択';
    }

    // ボタングリッドレンダリング
    renderButtonGrid(type, items, currentPage, onItemSelect) {
        const gridId = `${type}-grid`;
        const paginationId = `${type}-pagination`;
        const grid = safeGetElement(`#${gridId}`);
        
        if (!grid) return;

        const pageItems = this.paginationManager.getPageItems(items, currentPage);
        
        grid.innerHTML = pageItems.map(item => `
            <button class="selection-button ripple-button" data-id="${item.id}">
                ${escapeHtml(item.name)}
            </button>
        `).join('');

        grid.querySelectorAll('.selection-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const itemId = e.target.dataset.id;
                const selectedItem = items.find(item => item.id === itemId);
                if (selectedItem) {
                    button.classList.add('loading');
                    
                    setTimeout(() => {
                        onItemSelect(selectedItem);
                        button.classList.remove('loading');
                    }, 300);
                }
            });
        });

        this.paginationManager.createPagination(
            paginationId, 
            items, 
            currentPage, 
            (newPage) => {
                this.screenManager.pagination[type].currentPage = newPage;
                this.renderButtonGrid(type, items, newPage, onItemSelect);
            }
        );
    }

    // チャイムグリッドレンダリング
    renderChimeGrid(chimes, currentPage, onChimeSelect) {
        const grid = safeGetElement('#chime-grid');
        if (!grid) return;

        const pageItems = this.paginationManager.getPageItems(chimes, currentPage);
        
        grid.innerHTML = pageItems.map(chime => `
            <button class="selection-button chime-button ripple-button" data-id="${chime.id}">
                🔔 ${escapeHtml(chime.name)}
            </button>
        `).join('');

        grid.querySelectorAll('.chime-button').forEach(button => {
            button.addEventListener('click', (e) => {
                grid.querySelectorAll('.chime-button').forEach(btn => {
                    btn.classList.remove('selected');
                });

                button.classList.add('selected');

                const chimeId = e.target.dataset.id;
                const selectedChime = chimes.find(chime => chime.id === chimeId);
                if (selectedChime) {
                    onChimeSelect(selectedChime);

                    this.audio.playChime(chimeId).catch(error => {
                        console.warn('Preview play failed:', error);
                    });
                }
            });
        });

        this.paginationManager.createPagination(
            'chime-pagination',
            chimes,
            currentPage,
            (newPage) => {
                this.screenManager.pagination.chime.currentPage = newPage;
                this.renderChimeGrid(chimes, newPage, onChimeSelect);
            }
        );
    }

    // 音声ファイルプリロード
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

    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64.split(',')[1]);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // 通知フォーム検証
    validateNotificationForm() {
        const { company, department, member, chime } = this.screenManager.selections;
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

            const selectedChime = this.screenManager.selections.chime;
            if (selectedChime) {
                const playSuccess = await this.audio.playChime(selectedChime.id);
                if (playSuccess) {
                    this.ui.showWaveAnimation();
                }
            }

            let sendSuccess = true;
            if (this.network.isOnline) {
                sendSuccess = await this.sendTeamsNotification();
            }

            this.ui.showNotificationResult(true, this.network.isOnline && sendSuccess);

            setTimeout(() => {
                this.screenManager.resetSelections();
                this.loadCurrentScreenData();
            }, 2000);

        } catch (error) {
            console.error('Notification error:', error);
            this.ui.showNotificationResult(false, this.network.isOnline, error.message);
        } finally {
            setTimeout(() => {
                this.ui.setButtonLoading('#notify-btn', false);
            }, 1000);
        }
    }

    // Teams通知送信
    async sendTeamsNotification() {
        const { company, department, member } = this.screenManager.selections;
        const channels = this.storage.getItems('channels');
        
        if (channels.length === 0) {
            throw new Error('Teamsチャネルが設定されていません');
        }

        const message = this.buildNotificationMessage();
        
        try {
            const promises = channels.map(channel => 
                this.network.sendToTeams(channel.webhook, message)
            );
            
            await Promise.all(promises);
            return true;
        } catch (error) {
            throw new Error(`Teams送信エラー: ${error.message}`);
        }
    }

    buildNotificationMessage() {
        const { company, department, member } = this.screenManager.selections;
        
        return `**【チャイム通知】**\n` +
               `🏢 **会社**: ${company?.name || '不明'}\n` +
               `🏬 **部署**: ${department?.name || '不明'}\n` +
               `👤 **担当者**: ${member?.name || '不明'}\n` +
               `📅 **送信時刻**: ${new Date().toLocaleString('ja-JP')}`;
    }

    // 管理者認証
    handleAdminLogin() {
        const passwordInput = safeGetElement('#admin-password');
        if (!passwordInput) return;

        const password = passwordInput.value.trim();
        if (!password) {
            ErrorHandler.show('パスワードを入力してください');
            return;
        }

        if (this.storage.verifyPassword(password)) {
            this.ui.isAdminAuthenticated = true;
            this.showAdminContent();
            this.startAdminSession();
            passwordInput.value = '';
        } else {
            ErrorHandler.show(MESSAGES.ERRORS.AUTH_FAILED);
            passwordInput.value = '';
        }
    }

    handleAdminLogout() {
        this.ui.isAdminAuthenticated = false;
        this.clearAdminSession();
        this.showMainScreen();
    }

    startAdminSession() {
        const sessionData = {
            timestamp: Date.now(),
            expires: Date.now() + CONFIG.SESSION_TIMEOUT
        };
        
        try {
            localStorage.setItem(CONFIG.ADMIN_SESSION_KEY, JSON.stringify(sessionData));
        } catch (error) {
            console.warn('Session storage failed:', error);
        }

        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
        }
        
        this.sessionTimeout = setTimeout(() => {
            this.handleAdminLogout();
            ErrorHandler.show('セッションがタイムアウトしました');
        }, CONFIG.SESSION_TIMEOUT);
    }

    clearAdminSession() {
        try {
            localStorage.removeItem(CONFIG.ADMIN_SESSION_KEY);
        } catch (error) {
            console.warn('Session clear failed:', error);
        }
        
        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
            this.sessionTimeout = null;
        }
    }

    checkAdminSession() {
        try {
            const sessionData = localStorage.getItem(CONFIG.ADMIN_SESSION_KEY);
            if (!sessionData) return;

            const session = JSON.parse(sessionData);
            if (session.expires > Date.now()) {
                this.ui.isAdminAuthenticated = true;
                this.startAdminSession();
            } else {
                this.clearAdminSession();
            }
        } catch (error) {
            console.warn('Session check failed:', error);
            this.clearAdminSession();
        }
    }

    // 管理者タブ切替
    switchAdminTab(tabName) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
            panel.classList.add('hidden');
        });

        const activeTab = safeGetElement(`[data-tab="${tabName}"]`);
        const activePanel = safeGetElement(`#${tabName}-tab`);
        
        if (activeTab) activeTab.classList.add('active');
        if (activePanel) {
            activePanel.classList.add('active');
            activePanel.classList.remove('hidden');
        }

        this.ui.currentTab = tabName;
        this.loadTabData(tabName);
    }

    // 管理者データ読み込み
    loadAdminData() {
        this.loadTabData(this.ui.currentTab);
        this.populateSelectsForForms();
        this.loadCurrentScreenData();
    }

    loadTabData(tabName) {
        switch (tabName) {
            case 'companies':
                this.loadCompanyList();
                break;
            case 'departments':
                this.loadDepartmentList();
                break;
            case 'members':
                this.loadMemberList();
                break;
            case 'chimes':
                this.loadChimeList();
                break;
            case 'channels':
                this.loadChannelList();
                break;
        }
    }

    loadCompanyList() {
        const companies = this.storage.getItems('companies');
        const listEl = safeGetElement('#companies-list');
        
        if (!listEl) return;

        listEl.innerHTML = companies.map(company => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${escapeHtml(company.name)}</div>
                    <div class="item-detail">ID: ${company.id}</div>
                </div>
                <div class="item-actions">
                    <button class="delete-button" onclick="app.deleteItem('companies', '${company.id}')">
                        🗑️ 削除
                    </button>
                </div>
            </div>
        `).join('');
    }

    loadDepartmentList() {
        const departments = this.storage.getItems('departments');
        const companies = this.storage.getItems('companies');
        const listEl = safeGetElement('#departments-list');
        
        if (!listEl) return;

        listEl.innerHTML = departments.map(dept => {
            const company = companies.find(c => c.id === dept.companyId);
            return `
                <div class="item-card">
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(dept.name)}</div>
                        <div class="item-detail">会社: ${company ? escapeHtml(company.name) : '不明'}</div>
                    </div>
                    <div class="item-actions">
                        <button class="delete-button" onclick="app.deleteItem('departments', '${dept.id}')">
                            🗑️ 削除
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    loadMemberList() {
        const members = this.storage.getItems('members');
        const departments = this.storage.getItems('departments');
        const companies = this.storage.getItems('companies');
        const listEl = safeGetElement('#members-list');
        
        if (!listEl) return;

        listEl.innerHTML = members.map(member => {
            const dept = departments.find(d => d.id === member.departmentId);
            const company = dept ? companies.find(c => c.id === dept.companyId) : null;
            return `
                <div class="item-card">
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(member.name)}</div>
                        <div class="item-detail">
                            ${company ? escapeHtml(company.name) : '不明'} - ${dept ? escapeHtml(dept.name) : '不明'}
                        </div>
                    </div>
                    <div class="item-actions">
                        <button class="delete-button" onclick="app.deleteItem('members', '${member.id}')">
                            🗑️ 削除
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    loadChimeList() {
        const chimes = this.storage.getItems('chimes');
        const listEl = safeGetElement('#chimes-list');
        
        if (!listEl) return;

        listEl.innerHTML = chimes.map(chime => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${escapeHtml(chime.name)}</div>
                    <div class="item-detail">
                        ${chime.id === 'default-chime' ? '標準チャイム' : 'カスタム音声'}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="play-button" onclick="app.playChimePreview('${chime.id}')">
                        ▶️ 再生
                    </button>
                    ${chime.id !== 'default-chime' ? `
                        <button class="delete-button" onclick="app.deleteItem('chimes', '${chime.id}')">
                            🗑️ 削除
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    loadChannelList() {
        const channels = this.storage.getItems('channels');
        const listEl = safeGetElement('#channels-list');
        
        if (!listEl) return;

        listEl.innerHTML = channels.map(channel => `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${escapeHtml(channel.name)}</div>
                    <div class="item-detail">${truncateText(channel.webhook, 50)}</div>
                </div>
                <div class="item-actions">
                    <button class="delete-button" onclick="app.deleteItem('channels', '${channel.id}')">
                        🗑️ 削除
                    </button>
                </div>
            </div>
        `).join('');
    }

    // フォーム用セレクト要素の設定
    populateSelectsForForms() {
        // 部署フォーム用会社選択
        const deptCompanySelect = safeGetElement('#department-company');
        if (deptCompanySelect) {
            const companies = this.storage.getItems('companies');
            deptCompanySelect.innerHTML = '<option value="">会社を選択してください</option>' +
                companies.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        }

        // 担当者フォーム用部署選択
        const memberDeptSelect = safeGetElement('#member-department');
        if (memberDeptSelect) {
            const departments = this.storage.getItems('departments');
            const companies = this.storage.getItems('companies');
            memberDeptSelect.innerHTML = '<option value="">部署を選択してください</option>' +
                departments.map(d => {
                    const company = companies.find(c => c.id === d.companyId);
                    return `<option value="${d.id}">${company ? escapeHtml(company.name) + ' - ' : ''}${escapeHtml(d.name)}</option>`;
                }).join('');
        }
    }

    // フォーム表示/非表示
    showAddForm(collection) {
        const form = safeGetElement(`#${collection}-form`);
        if (form) {
            form.classList.remove('hidden');
            
            // フォームリセット
            const inputs = form.querySelectorAll('input, select');
            inputs.forEach(input => {
                if (input.type !== 'file') {
                    input.value = '';
                }
            });
        }
    }

    hideAddForm(collection) {
        const form = safeGetElement(`#${collection}-form`);
        if (form) {
            form.classList.add('hidden');
        }
        this.editingItem = null;
    }

    // アイテム保存
    async saveItem(collection) {
        const nameInput = safeGetElement(`#${collection}-name`);
        if (!nameInput) return;

        const name = nameInput.value.trim();
        if (!name) {
            ErrorHandler.show('名前を入力してください');
            return;
        }

        let itemData = { name };

        // コレクション別の追加データ
        switch (collection) {
            case 'department':
                const companySelect = safeGetElement('#department-company');
                if (!companySelect || !companySelect.value) {
                    ErrorHandler.show('会社を選択してください');
                    return;
                }
                itemData.companyId = companySelect.value;
                break;

            case 'member':
                const deptSelect = safeGetElement('#member-department');
                if (!deptSelect || !deptSelect.value) {
                    ErrorHandler.show('部署を選択してください');
                    return;
                }
                itemData.departmentId = deptSelect.value;
                break;

            case 'chime':
                const fileInput = safeGetElement('#chime-file');
                if (fileInput && fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const validation = this.audio.validateAudioFile(file);
                    if (!validation.valid) {
                        ErrorHandler.show(validation.error);
                        return;
                    }
                    
                    try {
                        itemData.file = await this.fileToBase64(file);
                    } catch (error) {
                        ErrorHandler.show('ファイルの読み込みに失敗しました');
                        return;
                    }
                }
                break;

            case 'channel':
                const webhookInput = safeGetElement('#channel-webhook');
                if (!webhookInput || !webhookInput.value.trim()) {
                    ErrorHandler.show('Webhook URLを入力してください');
                    return;
                }
                if (!validateInput(webhookInput.value.trim(), 'url')) {
                    ErrorHandler.show(MESSAGES.ERRORS.INVALID_WEBHOOK);
                    return;
                }
                itemData.webhook = webhookInput.value.trim();
                break;
        }

        // 保存実行
        const id = this.storage.addItem(collection + 's', itemData);
        if (id) {
            this.hideAddForm(collection);
            this.loadTabData(this.ui.currentTab);
            this.populateSelectsForForms();
            this.loadCurrentScreenData();
            
            // 音声ファイルの場合はプリロード
            if (collection === 'chime' && itemData.file) {
                try {
                    const arrayBuffer = this.base64ToArrayBuffer(itemData.file);
                    await this.audio.loadAudioFile(id, arrayBuffer);
                } catch (error) {
                    console.warn('Audio preload failed:', error);
                }
            }
        } else {
            ErrorHandler.show('保存に失敗しました');
        }
    }

    // アイテム削除
    deleteItem(collection, id) {
        this.ui.showModal('確認', MESSAGES.CONFIRM.DELETE_ITEM, () => {
            if (this.storage.deleteItem(collection, id)) {
                this.loadTabData(this.ui.currentTab);
                this.populateSelectsForForms();
                this.loadCurrentScreenData();
            } else {
                ErrorHandler.show('削除に失敗しました');
            }
        });
    }

    // チャイムプレビュー再生
    async playChimePreview(chimeId) {
        try {
            await this.audio.playChime(chimeId);
        } catch (error) {
            ErrorHandler.show('音声の再生に失敗しました');
        }
    }

    // ファイルをBase64に変換
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
}

// ==========================================================================
// App Initialization
// ==========================================================================

// DOMContentLoaded後の初期化
document.addEventListener('DOMContentLoaded', () => {
    window.DEBUG_INFO.domLoaded = true;
    console.log('DEBUG: DOM loaded');

    // 強制タイムアウト設定
    const initTimeout = setTimeout(() => {
        const loadingScreen = document.querySelector('#loading-screen');
        if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
            console.warn('Force hiding loading screen due to timeout');
            loadingScreen.classList.add('hidden');
            
            const mainScreen = document.querySelector('#main-screen');
            if (mainScreen) {
                mainScreen.classList.remove('hidden');
            }
            
            setTimeout(() => {
                if (typeof ErrorHandler !== 'undefined' && ErrorHandler.show) {
                    ErrorHandler.show('初期化に時間がかかりましたが、アプリは使用可能です');
                }
            }, 500);
        }
    }, CONFIG.INIT_TIMEOUT);
    
    // アプリ初期化
    try {
        window.app = new ChimeNotificationApp();
        clearTimeout(initTimeout);
    } catch (error) {
        console.error('App instantiation failed:', error);
        window.DEBUG_INFO.errors.push({ type: 'instantiation', error: error.message });
        
        const loadingScreen = document.querySelector('#loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
        
        if (typeof ErrorHandler !== 'undefined' && ErrorHandler.show) {
            ErrorHandler.show('アプリの起動に失敗しました。ページを再読み込みしてください。');
        }
        
        clearTimeout(initTimeout);
    }
});

// Service Worker登録
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registrationPromise = navigator.serviceWorker.register('./sw.js');
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Service Worker registration timeout')), 5000)
            );
            
            const registration = await Promise.race([registrationPromise, timeoutPromise]);
            console.log('Service Worker registered successfully:', registration);
            window.DEBUG_INFO.serviceWorkerRegistered = true;
            
            // キャッシュクリア機能
            window.clearServiceWorkerCache = async () => {
                if (navigator.serviceWorker.controller) {
                    return new Promise((resolve, reject) => {
                        const messageChannel = new MessageChannel();
                        messageChannel.port1.onmessage = (event) => {
                            if (event.data && event.data.type === 'CACHE_CLEARED') {
                                if (event.data.success) {
                                    resolve(true);
                                } else {
                                    reject(new Error(event.data.error || 'キャッシュクリア失敗'));
                                }
                            }
                        };
                        
                        navigator.serviceWorker.controller.postMessage({
                            action: 'CLEAR_CACHE'
                        }, [messageChannel.port2]);
                        
                        setTimeout(() => reject(new Error('キャッシュクリアタイムアウト')), 3000);
                    });
                } else {
                    throw new Error('Service Workerが有効ではありません');
                }
            };
            
        } catch (error) {
            console.error('Service Worker registration error:', error);
            window.DEBUG_INFO.errors.push({ type: 'service-worker', error: error.message });
            
            if (typeof ErrorHandler !== 'undefined' && ErrorHandler.show) {
                ErrorHandler.show('Service Workerの登録に失敗しましたが、アプリは使用できます');
            }
        }
    });
}

// グローバル関数でアプリメソッドを公開
window.deleteItem = (collection, id) => {
    if (window.app) {
        window.app.deleteItem(collection, id);
    }
};

window.playChimePreview = (chimeId) => {
    if (window.app) {
        window.app.playChimePreview(chimeId);
    }
};

console.log('Chime Notification App - Loaded successfully');
