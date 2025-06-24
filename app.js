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
    SEARCH_DEBOUNCE: 300
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

// ==========================================================================
// Utility Functions
// ==========================================================================

function safeExecute(fn, errorMessage = MESSAGES.ERRORS.UNKNOWN_ERROR) {
    try {
        return fn();
    } catch (error) {
        console.error(errorMessage, error);
        ErrorHandler.show(errorMessage);
        return null;
    }
}

async function safeExecuteAsync(fn, errorMessage = MESSAGES.ERRORS.UNKNOWN_ERROR) {
    try {
        return await fn();
    } catch (error) {
        console.error(errorMessage, error);
        ErrorHandler.show(errorMessage);
        return null;
    }
}

function safeGetElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.warn(`Element not found: ${selector}`);
    }
    return element;
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
    ErrorHandler.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    ErrorHandler.show(MESSAGES.ERRORS.UNKNOWN_ERROR);
});

// グローバル関数
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
        this.storage = new StorageManager();
        this.audio = new AudioManager();
        this.network = new NetworkManager();
        this.ui = new UIManager();
        this.screenManager = new ScreenManager();
        this.paginationManager = new PaginationManager();
        
        this.editingItem = null;
        this.sessionTimeout = null;
        this.searchDebounceTimers = {};
        
        this.init();
    }

    async init() {
        try {
            this.ui.showLoading(true);
            
            this.applyTheme();
            this.setupEventListeners();
            this.loadCurrentScreenData();
            this.network.updateOnlineStatus();
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
