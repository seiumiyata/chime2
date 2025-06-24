// グローバル変数
let currentScreen = 'company';
let screenHistory = [];
let selectedData = {
    company: null,
    department: null,
    member: null
};
let searchResults = {
    companies: [],
    departments: [],
    members: []
};
let currentPage = {
    companies: 1,
    departments: 1,
    members: 1
};
let itemsPerPage = 8;
let isAdminAuthenticated = false;
let adminPassword = 'admin123';

// ローカルストレージキー
const STORAGE_KEY = 'chime-notification-data';
const THEME_KEY = 'chime-notification-theme';
const WEBHOOK_KEY = 'teams-webhook-url';

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    try {
        loadData();
        applyTheme();
        showScreen('company');
        updateProgress();
        
        // Service Worker登録
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('SW registered'))
                .catch(err => console.warn('SW registration failed'));
        }
        
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('main-screen').classList.remove('hidden');
        }, 1000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('アプリの初期化に失敗しました');
    }
}

// データ管理
function getDefaultData() {
    return {
        companies: [
            { id: '1', name: 'サンプル会社A' },
            { id: '2', name: 'サンプル会社B' },
            { id: '3', name: 'テスト株式会社' }
        ],
        departments: [
            { id: '1', name: '営業部', companyId: '1' },
            { id: '2', name: '開発部', companyId: '1' },
            { id: '3', name: '総務部', companyId: '2' },
            { id: '4', name: 'マーケティング部', companyId: '2' }
        ],
        members: [
            { id: '1', name: '田中太郎', departmentId: '1' },
            { id: '2', name: '佐藤花子', departmentId: '1' },
            { id: '3', name: '鈴木一郎', departmentId: '2' },
            { id: '4', name: '高橋美咲', departmentId: '3' }
        ]
    };
}

function loadData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            window.appData = JSON.parse(stored);
        } else {
            window.appData = getDefaultData();
            saveData();
        }
    } catch (error) {
        console.error('Data loading error:', error);
        window.appData = getDefaultData();
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(window.appData));
        return true;
    } catch (error) {
        console.error('Data saving error:', error);
        showError('データの保存に失敗しました');
        return false;
    }
}

// 画面管理
function showScreen(screenName) {
    // 前の画面を履歴に追加
    if (currentScreen !== screenName) {
        screenHistory.push(currentScreen);
    }
    
    // 全画面を非表示
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // 対象画面を表示
    document.getElementById(screenName + '-screen').classList.add('active');
    currentScreen = screenName;
    
    // ヘッダー更新
    updateHeader();
    updateProgress();
    
    // データ読み込み
    loadScreenData(screenName);
}

function goBack() {
    if (screenHistory.length > 0) {
        const previousScreen = screenHistory.pop();
        
        // 選択データをリセット
        if (currentScreen === 'department') {
            selectedData.company = null;
        } else if (currentScreen === 'member') {
            selectedData.department = null;
        }
        
        showScreen(previousScreen);
    }
}

function updateHeader() {
    const titles = {
        company: 'チャイム通知システム',
        department: '部署選択',
        member: '担当者選択'
    };
    
    document.getElementById('screen-title').textContent = titles[currentScreen];
    
    const backBtn = document.getElementById('back-btn');
    if (screenHistory.length > 0) {
        backBtn.classList.remove('hidden');
    } else {
        backBtn.classList.add('hidden');
    }
}

function updateProgress() {
    const progress = {
        company: 33.33,
        department: 66.66,
        member: 100
    };
    
    document.getElementById('progress').style.width = progress[currentScreen] + '%';
}

// データ読み込み
function loadScreenData(screenName) {
    switch (screenName) {
        case 'company':
            loadCompanies();
            break;
        case 'department':
            loadDepartments();
            break;
        case 'member':
            loadMembers();
            break;
    }
}

function loadCompanies() {
    const companies = window.appData.companies;
    searchResults.companies = companies;
    renderGrid('company', companies);
}

function loadDepartments() {
    if (!selectedData.company) return;
    
    const departments = window.appData.departments.filter(d => 
        d.companyId === selectedData.company.id
    );
    searchResults.departments = departments;
    renderGrid('department', departments);
    
    // ブレッドクラム更新
    document.getElementById('selected-company').textContent = selectedData.company.name;
}

function loadMembers() {
    if (!selectedData.department) return;
    
    const members = window.appData.members.filter(m => 
        m.departmentId === selectedData.department.id
    );
    searchResults.members = members;
    renderGrid('member', members);
    
    // ブレッドクラム更新
    document.getElementById('selected-company2').textContent = selectedData.company.name;
    document.getElementById('selected-department').textContent = selectedData.department.name;
}

// グリッド描画
function renderGrid(type, items) {
    const gridId = type + '-grid';
    const paginationId = type + '-pagination';
    const grid = document.getElementById(gridId);
    const pagination = document.getElementById(paginationId);
    
    if (!grid) return;
    
    // ページネーション計算
    const totalPages = Math.ceil(items.length / itemsPerPage);
    const currentPageNum = currentPage[type + 's'];
    const startIndex = (currentPageNum - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = items.slice(startIndex, endIndex);
    
    // グリッド描画
    grid.innerHTML = '';
    pageItems.forEach(item => {
        const button = document.createElement('button');
        button.textContent = item.name;
        button.onclick = () => selectItem(type, item);
        grid.appendChild(button);
    });
    
    // ページネーション描画
    if (pagination) {
        pagination.innerHTML = '';
        
        if (totalPages > 1) {
            // 前へボタン
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '‹';
            prevBtn.disabled = currentPageNum <= 1;
            prevBtn.onclick = () => changePage(type, currentPageNum - 1);
            pagination.appendChild(prevBtn);
            
            // ページ情報
            const pageInfo = document.createElement('span');
            pageInfo.textContent = `${currentPageNum} / ${totalPages}`;
            pagination.appendChild(pageInfo);
            
            // 次へボタン
            const nextBtn = document.createElement('button');
            nextBtn.textContent = '›';
            nextBtn.disabled = currentPageNum >= totalPages;
            nextBtn.onclick = () => changePage(type, currentPageNum + 1);
            pagination.appendChild(nextBtn);
        }
    }
}

function changePage(type, pageNum) {
    currentPage[type + 's'] = pageNum;
    renderGrid(type, searchResults[type + 's']);
}

// アイテム選択
function selectItem(type, item) {
    selectedData[type] = item;
    
    if (type === 'company') {
        showScreen('department');
    } else if (type === 'department') {
        showScreen('member');
    } else if (type === 'member') {
        // 担当者選択時に自動実行
        executeNotification();
    }
}

// 通知実行
async function executeNotification() {
    try {
        // チャイム音再生
        playChime();
        
        // 波形アニメーション表示
        showWaveAnimation();
        
        // Teams通知送信
        const webhookUrl = localStorage.getItem(WEBHOOK_KEY);
        if (webhookUrl) {
            await sendTeamsNotification(webhookUrl);
        }
        
        // 結果表示
        setTimeout(() => {
            hideWaveAnimation();
            showNotificationResult(true, '通知を送信しました', 'チャイム音を再生してTeams通知を送信しました');
            
            // 3秒後にリセット
            setTimeout(() => {
                resetSelection();
            }, 3000);
        }, 2000);
        
    } catch (error) {
        console.error('Notification error:', error);
        hideWaveAnimation();
        showNotificationResult(false, '通知送信に失敗しました', error.message);
    }
}

function playChime() {
    // 音声コンテキスト作成
    if (!window.audioContext) {
        window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // オシレーターでチャイム音生成
    const oscillator = window.audioContext.createOscillator();
    const gainNode = window.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(window.audioContext.destination);
    
    // 音程とボリューム設定
    oscillator.frequency.setValueAtTime(880, window.audioContext.currentTime);
    oscillator.frequency.setValueAtTime(659, window.audioContext.currentTime + 0.2);
    oscillator.frequency.setValueAtTime(523, window.audioContext.currentTime + 0.4);
    
    gainNode.gain.setValueAtTime(0, window.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, window.audioContext.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, window.audioContext.currentTime + 0.8);
    
    oscillator.start(window.audioContext.currentTime);
    oscillator.stop(window.audioContext.currentTime + 0.8);
}

async function sendTeamsNotification(webhookUrl) {
    const message = createTeamsMessage();
    
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(message)
    });
    
    if (!response.ok) {
        throw new Error('Teams通知の送信に失敗しました');
    }
}

function createTeamsMessage() {
    const { company, department, member } = selectedData;
    const timestamp = new Date().toLocaleString('ja-JP');
    
    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": "チャイム通知",
        "themeColor": "0078D4",
        "sections": [{
            "activityTitle": "🔔 チャイム通知",
            "activitySubtitle": timestamp,
            "text": `**会社**: ${company.name}\n**部署**: ${department.name}\n**担当者**: ${member.name}`,
            "markdown": true
        }]
    };
}

// UI制御
function showWaveAnimation() {
    document.getElementById('wave-animation').classList.remove('hidden');
}

function hideWaveAnimation() {
    document.getElementById('wave-animation').classList.add('hidden');
}

function showNotificationResult(success, message, detail) {
    const resultEl = document.getElementById('notification-result');
    const iconEl = document.getElementById('result-icon');
    const messageEl = document.getElementById('result-message');
    const detailEl = document.getElementById('result-detail');
    
    iconEl.textContent = success ? '✓' : '✗';
    iconEl.className = 'result-icon' + (success ? '' : ' error');
    messageEl.textContent = message;
    detailEl.textContent = detail;
    
    resultEl.classList.remove('hidden');
    
    setTimeout(() => {
        resultEl.classList.add('hidden');
    }, 4000);
}

function resetSelection() {
    selectedData = { company: null, department: null, member: null };
    screenHistory = [];
    currentPage = { companies: 1, departments: 1, members: 1 };
    showScreen('company');
}

// 検索機能
function searchCompanies() {
    const query = document.getElementById('company-search').value.toLowerCase();
    const filtered = window.appData.companies.filter(c => 
        c.name.toLowerCase().includes(query)
    );
    searchResults.companies = filtered;
    currentPage.companies = 1;
    renderGrid('company', filtered);
}

function searchDepartments() {
    const query = document.getElementById('department-search').value.toLowerCase();
    const filtered = window.appData.departments
        .filter(d => d.companyId === selectedData.company.id)
        .filter(d => d.name.toLowerCase().includes(query));
    searchResults.departments = filtered;
    currentPage.departments = 1;
    renderGrid('department', filtered);
}

function searchMembers() {
    const query = document.getElementById('member-search').value.toLowerCase();
    const filtered = window.appData.members
        .filter(m => m.departmentId === selectedData.department.id)
        .filter(m => m.name.toLowerCase().includes(query));
    searchResults.members = filtered;
    currentPage.members = 1;
    renderGrid('member', filtered);
}

// テーマ切替
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark');
    
    if (isDark) {
        body.classList.remove('dark');
        localStorage.setItem(THEME_KEY, 'light');
        document.getElementById('theme-btn').textContent = '🌙';
    } else {
        body.classList.add('dark');
        localStorage.setItem(THEME_KEY, 'dark');
        document.getElementById('theme-btn').textContent = '☀️';
    }
}

function applyTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        document.getElementById('theme-btn').textContent = '☀️';
    }
}

// 管理者機能
function toggleAdmin() {
    const adminScreen = document.getElementById('admin-screen');
    
    if (adminScreen.classList.contains('hidden')) {
        adminScreen.classList.remove('hidden');
        if (isAdminAuthenticated) {
            showAdminPanel();
        } else {
            showAuthPanel();
        }
    } else {
        adminScreen.classList.add('hidden');
    }
}

function showAuthPanel() {
    document.getElementById('auth-panel').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
}

function showAdminPanel() {
    document.getElementById('auth-panel').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    loadAdminData();
}

function handleAuthEnter(event) {
    if (event.key === 'Enter') {
        adminLogin();
    }
}

function adminLogin() {
    const password = document.getElementById('admin-password').value;
    
    if (password === adminPassword) {
        isAdminAuthenticated = true;
        document.getElementById('admin-password').value = '';
        showAdminPanel();
    } else {
        showError('パスワードが間違っています');
        document.getElementById('admin-password').value = '';
    }
}

function adminLogout() {
    isAdminAuthenticated = false;
    toggleAdmin();
}

function showAdminTab(tabName) {
    // タブボタンの状態更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // タブパネルの表示切替
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // データ読み込み
    loadAdminData();
}

function loadAdminData() {
    loadCompaniesList();
    loadDepartmentsList();
    loadMembersList();
    updateAdminSelects();
    loadWebhookUrl();
}

function loadCompaniesList() {
    const list = document.getElementById('companies-list');
    list.innerHTML = '';
    
    window.appData.companies.forEach(company => {
        const item = createItemCard(company.name, '', () => deleteCompany(company.id));
        list.appendChild(item);
    });
}

function loadDepartmentsList() {
    const list = document.getElementById('departments-list');
    list.innerHTML = '';
    
    window.appData.departments.forEach(dept => {
        const company = window.appData.companies.find(c => c.id === dept.companyId);
        const detail = company ? `会社: ${company.name}` : '';
        const item = createItemCard(dept.name, detail, () => deleteDepartment(dept.id));
        list.appendChild(item);
    });
}

function loadMembersList() {
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    
    window.appData.members.forEach(member => {
        const dept = window.appData.departments.find(d => d.id === member.departmentId);
        const company = dept ? window.appData.companies.find(c => c.id === dept.companyId) : null;
        const detail = company && dept ? `${company.name} - ${dept.name}` : '';
        const item = createItemCard(member.name, detail, () => deleteMember(member.id));
        list.appendChild(item);
    });
}

function createItemCard(name, detail, onDelete) {
    const card = document.createElement('div');
    card.className = 'item-card';
    
    card.innerHTML = `
        <div class="item-info">
            <h4>${name}</h4>
            ${detail ? `<p>${detail}</p>` : ''}
        </div>
        <div class="item-actions">
            <button class="btn-danger" onclick="event.target.onclick = null; arguments[0]();">削除</button>
        </div>
    `;
    
    // 削除ボタンにイベント設定
    const deleteBtn = card.querySelector('.btn-danger');
    deleteBtn.onclick = onDelete;
    
    return card;
}

function updateAdminSelects() {
    // 部署用会社選択
    const deptSelect = document.getElementById('department-company-select');
    deptSelect.innerHTML = '<option value="">会社を選択</option>';
    window.appData.companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = company.name;
        deptSelect.appendChild(option);
    });
    
    // 担当者用部署選択
    const memberSelect = document.getElementById('member-department-select');
    memberSelect.innerHTML = '<option value="">部署を選択</option>';
    window.appData.departments.forEach(dept => {
        const company = window.appData.companies.find(c => c.id === dept.companyId);
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = company ? `${company.name} - ${dept.name}` : dept.name;
        memberSelect.appendChild(option);
    });
}

// 追加フォーム制御
function showAddForm(type) {
    document.getElementById(type + '-form').classList.remove('hidden');
}

function hideAddForm(type) {
    document.getElementById(type + '-form').classList.add('hidden');
    
    // フォームをリセット
    const form = document.getElementById(type + '-form');
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => input.value = '');
}

// データ追加
function saveCompany() {
    const name = document.getElementById('company-name').value.trim();
    if (!name) {
        showError('会社名を入力してください');
        return;
    }
    
    const newCompany = {
        id: Date.now().toString(),
        name: name
    };
    
    window.appData.companies.push(newCompany);
    if (saveData()) {
        hideAddForm('company');
        loadAdminData();
        showError('会社を追加しました', false);
    }
}

function saveDepartment() {
    const companyId = document.getElementById('department-company-select').value;
    const name = document.getElementById('department-name').value.trim();
    
    if (!companyId) {
        showError('会社を選択してください');
        return;
    }
    if (!name) {
        showError('部署名を入力してください');
        return;
    }
    
    const newDepartment = {
        id: Date.now().toString(),
        name: name,
        companyId: companyId
    };
    
    window.appData.departments.push(newDepartment);
    if (saveData()) {
        hideAddForm('department');
        loadAdminData();
        showError('部署を追加しました', false);
    }
}

function saveMember() {
    const departmentId = document.getElementById('member-department-select').value;
    const name = document.getElementById('member-name').value.trim();
    
    if (!departmentId) {
        showError('部署を選択してください');
        return;
    }
    if (!name) {
        showError('担当者名を入力してください');
        return;
    }
    
    const newMember = {
        id: Date.now().toString(),
        name: name,
        departmentId: departmentId
    };
    
    window.appData.members.push(newMember);
    if (saveData()) {
        hideAddForm('member');
        loadAdminData();
        showError('担当者を追加しました', false);
    }
}

// データ削除
function deleteCompany(id) {
    if (confirm('この会社を削除しますか？関連する部署・担当者も削除されます。')) {
        // 関連データも削除
        window.appData.departments = window.appData.departments.filter(d => d.companyId !== id);
        window.appData.members = window.appData.members.filter(m => {
            const dept = window.appData.departments.find(d => d.id === m.departmentId);
            return dept !== undefined;
        });
        window.appData.companies = window.appData.companies.filter(c => c.id !== id);
        
        if (saveData()) {
            loadAdminData();
            showError('会社を削除しました', false);
        }
    }
}

function deleteDepartment(id) {
    if (confirm('この部署を削除しますか？関連する担当者も削除されます。')) {
        window.appData.members = window.appData.members.filter(m => m.departmentId !== id);
        window.appData.departments = window.appData.departments.filter(d => d.id !== id);
        
        if (saveData()) {
            loadAdminData();
            showError('部署を削除しました', false);
        }
    }
}

function deleteMember(id) {
    if (confirm('この担当者を削除しますか？')) {
        window.appData.members = window.appData.members.filter(m => m.id !== id);
        
        if (saveData()) {
            loadAdminData();
            showError('担当者を削除しました', false);
        }
    }
}

// Webhook設定
function loadWebhookUrl() {
    const webhookUrl = localStorage.getItem(WEBHOOK_KEY);
    if (webhookUrl) {
        document.getElementById('webhook-url').value = webhookUrl;
    }
}

function saveWebhook() {
    const url = document.getElementById('webhook-url').value.trim();
    if (url && !url.startsWith('https://')) {
        showError('有効なWebhook URLを入力してください');
        return;
    }
    
    localStorage.setItem(WEBHOOK_KEY, url);
    showError('Webhook URLを保存しました', false);
}

// エラー表示
function showError(message, isError = true) {
    const toast = document.getElementById('error-toast');
    const messageEl = document.querySelector('.error-message');
    
    messageEl.textContent = message;
    toast.style.background = isError ? '#f44336' : '#4caf50';
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function hideError() {
    document.getElementById('error-toast').classList.add('hidden');
}

// ユーティリティ
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 5);
}

console.log('チャイム通知PWA - 初期化完了');
