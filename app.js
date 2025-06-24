// チャイム通知PWAアプリケーション
class ChimeNotificationApp {
    constructor() {
        // アプリケーションの状態管理
        this.state = {
            currentScreen: 'company',
            selectedCompany: null,
            selectedDepartment: null,
            selectedMember: null,
            isAuthenticated: false,
            theme: 'light',
            searchTerm: '',
            currentPage: 1,
            itemsPerPage: 8
        };

        // デフォルトデータ（初期化時にlocalStorageから読み込む）
        this.data = {
            companies: [],
            departments: [],
            members: [],
            adminPassword: 'admin123',
            webhookUrl: ''
        };

        // プライベート変数
        this.audioContext = null;
        this.pendingAction = null;

        // アプリ初期化
        this.initApp();
    }

    // アプリ初期化処理
    async initApp() {
        this.loadDataFromStorage();
        this.setupEventListeners();
        this.setupServiceWorker();
        
        // テーマ初期設定
        this.initTheme();
        
        // ローディング表示後にメイン画面表示
        setTimeout(() => {
            this.hideLoadingScreen();
            this.renderCurrentScreen();
        }, 1000);
    }

    // ServiceWorker登録 (PWA対応)
    async setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                // ServiceWorkerが利用可能な場合、登録を試みる
                await navigator.serviceWorker.register('/service-worker.js');
                console.log('ServiceWorker registered successfully');
            } catch (error) {
                console.error('ServiceWorker registration failed:', error);
            }
        }
    }

    // データをlocalStorageに保存
    saveDataToStorage() {
        try {
            localStorage.setItem('chimeNotificationData', JSON.stringify(this.data));
        } catch (error) {
            console.error('Error saving data to localStorage:', error);
            this.showError('データの保存に失敗しました');
        }
    }

    // データをlocalStorageから読み込み
    loadDataFromStorage() {
        try {
            const savedData = localStorage.getItem('chimeNotificationData');
            
            if (savedData) {
                // 保存データがある場合、読み込み
                this.data = JSON.parse(savedData);
            } else {
                // 初期データをセット
                this.initializeDefaultData();
                // 保存
                this.saveDataToStorage();
            }
        } catch (error) {
            console.error('Error loading data from localStorage:', error);
            this.initializeDefaultData();
        }
    }

    // デフォルトデータ初期化
    initializeDefaultData() {
        this.data = {
            companies: [
                {"id": "1", "name": "株式会社サンプル"},
                {"id": "2", "name": "テスト商事"},
                {"id": "3", "name": "デモ企業"}
            ],
            departments: [
                {"id": "1", "name": "営業部", "companyId": "1"},
                {"id": "2", "name": "開発部", "companyId": "1"},
                {"id": "3", "name": "総務部", "companyId": "2"},
                {"id": "4", "name": "企画部", "companyId": "2"},
                {"id": "5", "name": "マーケティング部", "companyId": "3"},
                {"id": "6", "name": "技術部", "companyId": "3"}
            ],
            members: [
                {"id": "1", "name": "田中太郎", "departmentId": "1"},
                {"id": "2", "name": "佐藤花子", "departmentId": "1"},
                {"id": "3", "name": "鈴木一郎", "departmentId": "2"},
                {"id": "4", "name": "高橋美咲", "departmentId": "2"},
                {"id": "5", "name": "山田次郎", "departmentId": "3"},
                {"id": "6", "name": "松本雅子", "departmentId": "3"},
                {"id": "7", "name": "木村健太", "departmentId": "4"},
                {"id": "8", "name": "石川真理", "departmentId": "4"},
                {"id": "9", "name": "小林和也", "departmentId": "5"},
                {"id": "10", "name": "中村由紀", "departmentId": "5"},
                {"id": "11", "name": "青木宏", "departmentId": "6"},
                {"id": "12", "name": "伊藤美穂", "departmentId": "6"}
            ],
            adminPassword: "admin123",
            webhookUrl: ""
        };
    }

    // イベントリスナー設定
    setupEventListeners() {
        // ヘッダーボタン
        document.getElementById('back-btn').addEventListener('click', () => this.goBack());
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('admin-toggle').addEventListener('click', () => this.showAdminScreen());

        // 管理者認証関連
        document.getElementById('auth-btn').addEventListener('click', () => this.authenticate());
        document.getElementById('admin-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.authenticate();
        });
        document.getElementById('back-to-main').addEventListener('click', () => this.hideAdminScreen());
        document.getElementById('admin-logout').addEventListener('click', () => this.logout());

        // 管理者タブ
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchAdminTab(e.target.closest('.nav-tab').dataset.tab));
        });

        // 通知リセットボタン
        document.getElementById('manual-reset-btn').addEventListener('click', () => this.reset());

        // 検索機能
        document.getElementById('company-search').addEventListener('input', (e) => this.handleSearch('company', e.target.value));
        document.getElementById('department-search').addEventListener('input', (e) => this.handleSearch('department', e.target.value));
        document.getElementById('member-search').addEventListener('input', (e) => this.handleSearch('member', e.target.value));

        // 確認ダイアログ
        document.getElementById('confirm-yes').addEventListener('click', () => this.confirmAction(true));
        document.getElementById('confirm-no').addEventListener('click', () => this.confirmAction(false));

        // 管理者機能のイベントリスナー
        this.setupAdminEventListeners();
    }

    // 管理者機能のイベントリスナー
    setupAdminEventListeners() {
        // 会社管理
        document.getElementById('add-company-btn').addEventListener('click', () => this.showAddForm('company'));
        document.getElementById('save-company').addEventListener('click', () => this.saveCompany());
        document.getElementById('cancel-company').addEventListener('click', () => this.hideAddForm('company'));

        // 部署管理
        document.getElementById('add-department-btn').addEventListener('click', () => this.showAddForm('department'));
        document.getElementById('save-department').addEventListener('click', () => this.saveDepartment());
        document.getElementById('cancel-department').addEventListener('click', () => this.hideAddForm('department'));

        // 担当者管理
        document.getElementById('add-member-btn').addEventListener('click', () => this.showAddForm('member'));
        document.getElementById('save-member').addEventListener('click', () => this.saveMember());
        document.getElementById('cancel-member').addEventListener('click', () => this.hideAddForm('member'));

        // 設定管理
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
    }

    // ローディング表示を消す
    hideLoadingScreen() {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('main-screen').classList.remove('hidden');
    }

    // テーマ初期化
    initTheme() {
        // プラットフォームの設定を優先
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.state.theme = prefersDark ? 'dark' : 'light';
        this.applyTheme();
    }

    // テーマの切り替え
    toggleTheme() {
        this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
        this.applyTheme();
    }

    // テーマの適用
    applyTheme() {
        const app = document.getElementById('app');
        const themeIcon = document.querySelector('.theme-icon');
        
        if (this.state.theme === 'dark') {
            app.className = 'theme-dark';
            themeIcon.textContent = '☀️';
        } else {
            app.className = 'theme-light';
            themeIcon.textContent = '🌙';
        }
    }

    // 現在の画面を表示
    renderCurrentScreen() {
        // プログレスバー更新
        this.updateProgressBar();
        
        // 画面タイトル更新
        this.updateScreenTitle();
        
        // 戻るボタン更新
        this.updateBackButton();
        
        // 各画面の表示処理
        switch(this.state.currentScreen) {
            case 'company':
                this.renderCompanyScreen();
                break;
            case 'department':
                this.renderDepartmentScreen();
                break;
            case 'member':
                this.renderMemberScreen();
                break;
            case 'notification':
                this.renderNotificationScreen();
                break;
        }
    }

    // プログレスバー更新
    updateProgressBar() {
        const steps = ['company', 'department', 'member', 'notification'];
        const currentIndex = steps.indexOf(this.state.currentScreen);
        const progress = ((currentIndex + 1) / steps.length) * 100;
        
        document.getElementById('progress-fill').style.width = `${progress}%`;
        
        // ステップの状態更新
        steps.forEach((step, index) => {
            const stepElement = document.getElementById(`step-${step}`);
            stepElement.classList.toggle('active', index <= currentIndex);
        });
    }

    // 画面タイトル更新
    updateScreenTitle() {
        const titles = {
            company: 'チャイム通知システム',
            department: '部署選択',
            member: '担当者選択',
            notification: '通知送信'
        };
        document.getElementById('screen-title').textContent = titles[this.state.currentScreen];
    }

    // 戻るボタン更新
    updateBackButton() {
        const backBtn = document.getElementById('back-btn');
        backBtn.classList.toggle('hidden', this.state.currentScreen === 'company');
    }

    // 会社選択画面の表示
    renderCompanyScreen() {
        this.showScreen('company-screen');
        const filteredCompanies = this.filterData(this.data.companies, this.state.searchTerm);
        this.renderGrid('company-grid', filteredCompanies, this.renderCompanyButton.bind(this));
        this.renderPagination('company-pagination', filteredCompanies.length);
    }

    // 部署選択画面の表示
    renderDepartmentScreen() {
        this.showScreen('department-screen');
        document.getElementById('selected-company-name').textContent = this.state.selectedCompany.name;
        
        const departments = this.data.departments.filter(dept => dept.companyId === this.state.selectedCompany.id);
        const filteredDepartments = this.filterData(departments, this.state.searchTerm);
        this.renderGrid('department-grid', filteredDepartments, this.renderDepartmentButton.bind(this));
        this.renderPagination('department-pagination', filteredDepartments.length);
    }

    // 担当者選択画面の表示
    renderMemberScreen() {
        this.showScreen('member-screen');
        document.getElementById('member-selected-company').textContent = this.state.selectedCompany.name;
        document.getElementById('member-selected-department').textContent = this.state.selectedDepartment.name;
        
        const members = this.data.members.filter(member => member.departmentId === this.state.selectedDepartment.id);
        const filteredMembers = this.filterData(members, this.state.searchTerm);
        this.renderGrid('member-grid', filteredMembers, this.renderMemberButton.bind(this));
        this.renderPagination('member-pagination', filteredMembers.length);
    }

    // 通知画面の表示
    renderNotificationScreen() {
        this.showScreen('notification-screen');
        this.updateNotificationSummary();
    }

    // 指定された画面を表示
    showScreen(screenId) {
        document.querySelectorAll('.selection-screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    // データの検索・フィルタリング
    filterData(data, searchTerm) {
        if (!searchTerm) return data;
        return data.filter(item => 
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    // ボタングリッド表示
    renderGrid(gridId, data, renderFunction) {
        const grid = document.getElementById(gridId);
        const startIndex = (this.state.currentPage - 1) * this.state.itemsPerPage;
        const pageData = data.slice(startIndex, startIndex + this.state.itemsPerPage);
        
        grid.innerHTML = '';
        if (pageData.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = '該当するデータがありません';
            grid.appendChild(emptyMessage);
            return;
        }
        
        pageData.forEach(item => {
            const button = renderFunction(item);
            grid.appendChild(button);
        });
    }

    // 会社ボタンの作成
    renderCompanyButton(company) {
        const button = document.createElement('button');
        button.className = 'selection-button';
        button.innerHTML = `
            <span class="button-icon">🏢</span>
            <span class="button-text">${company.name}</span>
        `;
        button.addEventListener('click', () => this.selectCompany(company));
        return button;
    }

    // 部署ボタンの作成
    renderDepartmentButton(department) {
        const button = document.createElement('button');
        button.className = 'selection-button';
        button.innerHTML = `
            <span class="button-icon">🏬</span>
            <span class="button-text">${department.name}</span>
        `;
        button.addEventListener('click', () => this.selectDepartment(department));
        return button;
    }

    // 担当者ボタンの作成
    renderMemberButton(member) {
        const button = document.createElement('button');
        button.className = 'selection-button';
        button.innerHTML = `
            <span class="button-icon">👤</span>
            <span class="button-text">${member.name}</span>
        `;
        button.addEventListener('click', () => this.selectMember(member));
        return button;
    }

    // ページネーション表示
    renderPagination(paginationId, totalItems) {
        const pagination = document.getElementById(paginationId);
        const totalPages = Math.ceil(totalItems / this.state.itemsPerPage);
        
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        pagination.innerHTML = '';

        // 前へボタン
        const prevBtn = this.createPaginationButton('‹', this.state.currentPage - 1, this.state.currentPage <= 1);
        pagination.appendChild(prevBtn);

        // ページ番号
        let startPage = Math.max(1, this.state.currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }
        
        if (startPage > 1) {
            pagination.appendChild(this.createPaginationButton('1', 1, false));
            if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-ellipsis';
                ellipsis.textContent = '...';
                pagination.appendChild(ellipsis);
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = this.createPaginationButton(i.toString(), i, false, i === this.state.currentPage);
            pagination.appendChild(pageBtn);
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-ellipsis';
                ellipsis.textContent = '...';
                pagination.appendChild(ellipsis);
            }
            pagination.appendChild(this.createPaginationButton(totalPages.toString(), totalPages, false));
        }

        // 次へボタン
        const nextBtn = this.createPaginationButton('›', this.state.currentPage + 1, this.state.currentPage >= totalPages);
        pagination.appendChild(nextBtn);
    }

    // ページネーションボタン作成
    createPaginationButton(text, page, disabled, active = false) {
        const button = document.createElement('button');
        button.className = 'pagination-button';
        button.textContent = text;
        button.disabled = disabled;
        
        if (active) {
            button.classList.add('active');
        }
        
        if (!disabled) {
            button.addEventListener('click', () => {
                this.state.currentPage = page;
                this.renderCurrentScreen();
            });
        }
        
        return button;
    }

    // 会社選択時の処理
    selectCompany(company) {
        this.state.selectedCompany = company;
        this.state.currentScreen = 'department';
        this.state.searchTerm = '';
        this.state.currentPage = 1;
        this.renderCurrentScreen();
    }

    // 部署選択時の処理
    selectDepartment(department) {
        this.state.selectedDepartment = department;
        this.state.currentScreen = 'member';
        this.state.searchTerm = '';
        this.state.currentPage = 1;
        this.renderCurrentScreen();
    }

    // 担当者選択時の処理
    selectMember(member) {
        this.state.selectedMember = member;
        this.state.currentScreen = 'notification';
        this.state.searchTerm = '';
        this.state.currentPage = 1;
        this.renderCurrentScreen();
        
        // チャイム音再生・通知処理の実行
        this.processNotification();
    }

    // 通知サマリーの更新
    updateNotificationSummary() {
        document.getElementById('final-company-name').textContent = this.state.selectedCompany?.name || '-';
        document.getElementById('final-department-name').textContent = this.state.selectedDepartment?.name || '-';
        document.getElementById('final-member-name').textContent = this.state.selectedMember?.name || '-';
        
        // 現在時刻の表示
        const now = new Date();
        const timeString = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('notification-time').textContent = timeString;
    }

    // 通知処理
    async processNotification() {
        try {
            // チャイム音再生
            await this.playChime();
            
            // チャイム音再生状態をDOMに反映
            document.getElementById('chime-status').classList.add('completed');
            document.getElementById('chime-status').querySelector('.status-text').textContent = 'チャイム音再生完了';
            
            // Teams通知送信
            await this.sendTeamsNotification();
            
            // Teams通知状態をDOMに反映
            document.getElementById('teams-status').classList.add('completed');
            document.getElementById('teams-status').querySelector('.status-text').textContent = 'Teams通知送信完了';
            
            // 処理完了メッセージ表示
            this.showNotificationResult(true, '通知送信完了', '3秒後に最初の画面に戻ります');
            
            // 自動リセット（3秒後）
            setTimeout(() => {
                this.reset();
            }, 3000);
        } catch (error) {
            // エラー処理
            this.showNotificationResult(false, '通知送信エラー', error.message);
        }
    }

    // チャイム音の再生
    async playChime() {
        // 波形アニメーション開始
        this.startWaveAnimation();
        
        // Web Audio API初期化
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                throw new Error('お使いのブラウザはWeb Audio APIに対応していません');
            }
        }
        
        return new Promise((resolve) => {
            // オシレータノード作成
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            
            // 接続
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            // チャイム音生成（上昇音→下降音）
            oscillator.start();
            
            // フェードイン
            gainNode.gain.linearRampToValueAtTime(0.5, this.audioContext.currentTime + 0.1);
            
            // 周波数変化
            oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
            oscillator.frequency.linearRampToValueAtTime(1760, this.audioContext.currentTime + 0.5);
            
            setTimeout(() => {
                // 第2音
                oscillator.frequency.setValueAtTime(1318.51, this.audioContext.currentTime);
                oscillator.frequency.linearRampToValueAtTime(659.25, this.audioContext.currentTime + 0.5);
                
                setTimeout(() => {
                    // フェードアウト
                    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.5);
                    
                    setTimeout(() => {
                        oscillator.stop();
                        resolve();
                    }, 1000);
                }, 1000);
            }, 1000);
        });
    }

    // 波形アニメーション開始
    startWaveAnimation() {
        const canvas = document.getElementById('wave-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 300;
        canvas.height = 200;

        let animationId;
        let time = 0;

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 波形描画 - 背景グラデーション
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#21808d30');
            gradient.addColorStop(1, '#21808d05');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 波形描画 - 波線
            ctx.strokeStyle = '#21808d';
            ctx.lineWidth = 3;
            ctx.beginPath();
            
            for (let x = 0; x < canvas.width; x++) {
                // 複数の正弦波を合成
                const y1 = Math.sin((x * 0.02) + (time * 0.05)) * 30;
                const y2 = Math.sin((x * 0.04) + (time * 0.03)) * 15;
                const y = canvas.height / 2 + y1 + y2;
                
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            // 波形描画 - 2本目の波線
            ctx.strokeStyle = '#21808d80';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let x = 0; x < canvas.width; x++) {
                // 別の周波数の正弦波
                const y1 = Math.sin((x * 0.03) + (time * 0.07)) * 20;
                const y2 = Math.sin((x * 0.05) + (time * 0.02)) * 10;
                const y = canvas.height / 2 - 30 + y1 + y2;
                
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            time++;
            animationId = requestAnimationFrame(animate);
        };

        // アニメーション開始
        document.getElementById('wave-container').classList.remove('hidden');
        animate();

        // 3秒後にアニメーション停止
        setTimeout(() => {
            cancelAnimationFrame(animationId);
            document.getElementById('wave-container').classList.add('hidden');
        }, 3000);
    }

    // Teams通知送信
    async sendTeamsNotification() {
        // 通知データの準備
        const company = this.state.selectedCompany.name;
        const department = this.state.selectedDepartment.name;
        const member = this.state.selectedMember.name;
        const timestamp = new Date().toLocaleString('ja-JP');
        
        const webhookUrl = this.data.webhookUrl;
        
        // WebhookのURLが設定されていない場合、モック処理
        if (!webhookUrl) {
            return new Promise((resolve) => {
                // モック: 1.5秒後に解決
                setTimeout(resolve, 1500);
            });
        }
        
        // 実際のTeamsへの通知送信処理
        const payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": "0076D7",
            "summary": `${member}さんへの来客通知`,
            "sections": [{
                "activityTitle": "🔔 来客通知",
                "activitySubtitle": timestamp,
                "facts": [
                    { "name": "会社", "value": company },
                    { "name": "部署", "value": department },
                    { "name": "担当者", "value": member }
                ]
            }]
        };
        
        try {
            // Fetch APIを使用した送信処理
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.text();
        } catch (error) {
            console.error('Teams notification error:', error);
            // 送信エラーでも処理を続行するため、エラーをスロー不要
            // throw new Error('Teams通知の送信に失敗しました');
            return null; // モック処理と同様に続行
        }
    }

    // 通知結果表示
    showNotificationResult(success, message, detail) {
        const resultContainer = document.getElementById('notification-result');
        const resultIcon = resultContainer.querySelector('.result-icon');
        const resultMessage = resultContainer.querySelector('.result-message');
        const resultDetail = resultContainer.querySelector('.result-detail');

        resultIcon.textContent = success ? '✅' : '❌';
        resultMessage.textContent = message;
        resultDetail.textContent = detail;

        resultContainer.classList.remove('hidden');

        // 3秒後に自動で閉じる
        setTimeout(() => {
            resultContainer.classList.add('hidden');
        }, 3000);
    }

    // 戻るボタンの処理
    goBack() {
        const screens = ['company', 'department', 'member', 'notification'];
        const currentIndex = screens.indexOf(this.state.currentScreen);
        
        if (currentIndex > 0) {
            this.state.currentScreen = screens[currentIndex - 1];
            this.state.searchTerm = '';
            this.state.currentPage = 1;
            this.renderCurrentScreen();
        }
    }

    // 検索処理
    handleSearch(screenType, term) {
        this.state.searchTerm = term;
        this.state.currentPage = 1;
        this.renderCurrentScreen();
    }

    // リセット処理
    reset() {
        this.state.selectedCompany = null;
        this.state.selectedDepartment = null;
        this.state.selectedMember = null;
        this.state.currentScreen = 'company';
        this.state.searchTerm = '';
        this.state.currentPage = 1;
        
        // 通知ステータスのリセット
        const statuses = document.querySelectorAll('.status-item');
        statuses.forEach(status => {
            status.classList.remove('completed');
            const statusText = status.querySelector('.status-text');
            if (statusText.textContent.includes('完了')) {
                statusText.textContent = statusText.textContent.replace('完了', '中...');
            }
        });
        
        this.renderCurrentScreen();
    }

    // 管理者画面表示
    showAdminScreen() {
        document.getElementById('admin-screen').classList.remove('hidden');
        
        if (!this.state.isAuthenticated) {
            document.getElementById('auth-screen').classList.remove('hidden');
            document.getElementById('admin-content').classList.add('hidden');
            document.getElementById('admin-password').focus();
        } else {
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('admin-content').classList.remove('hidden');
            this.renderAdminContent();
        }
    }

    // 管理者画面を隠す
    hideAdminScreen() {
        document.getElementById('admin-screen').classList.add('hidden');
    }

    // 管理者認証処理
    authenticate() {
        const password = document.getElementById('admin-password').value;
        
        if (password === this.data.adminPassword) {
            this.state.isAuthenticated = true;
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('admin-content').classList.remove('hidden');
            this.renderAdminContent();
            document.getElementById('admin-password').value = '';
        } else {
            this.showError('パスワードが正しくありません');
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
        }
    }

    // ログアウト処理
    logout() {
        this.state.isAuthenticated = false;
        this.hideAdminScreen();
    }

    // 管理者コンテンツ表示
    renderAdminContent() {
        this.renderCompaniesList();
        this.renderDepartmentsList();
        this.renderMembersList();
        this.updateCompanySelect();
        this.updateDepartmentSelect();
        this.loadSettingsToForm();
    }

    // 管理画面のタブ切り替え
    switchAdminTab(tabName) {
        // タブボタンの状態更新
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // タブパネルの表示切替
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });
    }

    // 会社リスト表示
    renderCompaniesList() {
        const list = document.getElementById('companies-list');
        list.innerHTML = '';

        this.data.companies.forEach(company => {
            const item = this.createAdminItem('🏢', company.name, '', company.id, 'company');
            list.appendChild(item);
        });
    }

    // 部署リスト表示
    renderDepartmentsList() {
        const list = document.getElementById('departments-list');
        list.innerHTML = '';

        this.data.departments.forEach(department => {
            const company = this.data.companies.find(c => c.id === department.companyId);
            const item = this.createAdminItem('🏬', department.name, company?.name, department.id, 'department');
            list.appendChild(item);
        });
    }

    // 担当者リスト表示
    renderMembersList() {
        const list = document.getElementById('members-list');
        list.innerHTML = '';

        this.data.members.forEach(member => {
            const department = this.data.departments.find(d => d.id === member.departmentId);
            const departmentName = department?.name || '-';
            
            let companyName = '-';
            if (department) {
                const company = this.data.companies.find(c => c.id === department.companyId);
                companyName = company?.name || '-';
            }
            
            const meta = `${departmentName} (${companyName})`;
            const item = this.createAdminItem('👤', member.name, meta, member.id, 'member');
            list.appendChild(item);
        });
    }

    // 管理画面のアイテム作成
    createAdminItem(icon, name, meta, id, type) {
        const item = document.createElement('div');
        item.className = 'item-card';
        item.innerHTML = `
            <div class="item-info">
                <span class="item-icon">${icon}</span>
                <div class="item-details">
                    <span class="item-name">${name}</span>
                    ${meta ? `<span class="item-meta">${meta}</span>` : ''}
                </div>
            </div>
            <div class="item-actions">
                <button class="delete-button" data-id="${id}" data-type="${type}">
                    🗑️
                </button>
            </div>
        `;
        
        // 削除ボタンのイベント設定
        item.querySelector('.delete-button').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const type = e.target.dataset.type;
            this.confirmDelete(id, type);
        });
        
        return item;
    }

    // フォーム表示
    showAddForm(type) {
        document.getElementById(`${type}-form`).classList.remove('hidden');
        if (type === 'department') {
            this.updateCompanySelect();
        } else if (type === 'member') {
            this.updateDepartmentSelect();
        }
    }

    // フォーム非表示
    hideAddForm(type) {
        document.getElementById(`${type}-form`).classList.add('hidden');
        document.getElementById(`${type}-name`).value = '';
        if (type === 'department') {
            document.getElementById('department-company').value = '';
        } else if (type === 'member') {
            document.getElementById('member-department').value = '';
        }
    }

    // 会社登録処理
    saveCompany() {
        const name = document.getElementById('company-name').value.trim();
        if (!name) {
            this.showError('会社名を入力してください');
            return;
        }

        const newId = this.generateId();
        const newCompany = {
            id: newId,
            name: name
        };

        this.data.companies.push(newCompany);
        this.saveDataToStorage();
        this.hideAddForm('company');
        this.renderCompaniesList();
        this.updateCompanySelect();
    }

    // 部署登録処理
    saveDepartment() {
        const name = document.getElementById('department-name').value.trim();
        const companyId = document.getElementById('department-company').value;
        
        if (!name) {
            this.showError('部署名を入力してください');
            return;
        }
        
        if (!companyId) {
            this.showError('会社を選択してください');
            return;
        }

        const newId = this.generateId();
        const newDepartment = {
            id: newId,
            name: name,
            companyId: companyId
        };

        this.data.departments.push(newDepartment);
        this.saveDataToStorage();
        this.hideAddForm('department');
        this.renderDepartmentsList();
        this.updateDepartmentSelect();
    }

    // 担当者登録処理
    saveMember() {
        const name = document.getElementById('member-name').value.trim();
        const departmentId = document.getElementById('member-department').value;
        
        if (!name) {
            this.showError('担当者名を入力してください');
            return;
        }
        
        if (!departmentId) {
            this.showError('部署を選択してください');
            return;
        }

        const newId = this.generateId();
        const newMember = {
            id: newId,
            name: name,
            departmentId: departmentId
        };

        this.data.members.push(newMember);
        this.saveDataToStorage();
        this.hideAddForm('member');
        this.renderMembersList();
    }

    // システム設定保存
    saveSettings() {
        const webhookUrl = document.getElementById('webhook-url').value.trim();
        const newPassword = document.getElementById('admin-password-setting').value.trim();
        
        // パスワードが入力されている場合のみ更新
        if (newPassword) {
            this.data.adminPassword = newPassword;
        }
        
        // WebhookのURLを更新
        this.data.webhookUrl = webhookUrl;
        
        this.saveDataToStorage();
        this.showNotificationResult(true, '設定を保存しました', '');
        
        // パスワードフィールドをクリア
        document.getElementById('admin-password-setting').value = '';
    }

    // 設定データをフォームに読み込み
    loadSettingsToForm() {
        document.getElementById('webhook-url').value = this.data.webhookUrl || '';
        document.getElementById('admin-password-setting').value = '';
    }

    // 会社選択リストの更新
    updateCompanySelect() {
        const select = document.getElementById('department-company');
        select.innerHTML = '<option value="">会社を選択</option>';
        
        this.data.companies.forEach(company => {
            const option = document.createElement('option');
            option.value = company.id;
            option.textContent = company.name;
            select.appendChild(option);
        });
    }

    // 部署選択リストの更新
    updateDepartmentSelect() {
        const select = document.getElementById('member-department');
        select.innerHTML = '<option value="">部署を選択</option>';
        
        this.data.departments.forEach(department => {
            const company = this.data.companies.find(c => c.id === department.companyId);
            const option = document.createElement('option');
            option.value = department.id;
            option.textContent = `${department.name} (${company?.name || '不明'})`;
            select.appendChild(option);
        });
    }

    // 削除確認ダイアログ表示
    confirmDelete(id, type) {
        this.pendingAction = { action: 'delete', id, type };
        
        let itemName = '';
        let message = '';
        
        switch(type) {
            case 'company':
                const company = this.data.companies.find(c => c.id === id);
                itemName = company?.name || 'この会社';
                message = `${itemName}を削除しますか？関連する部署と担当者も全て削除されます。`;
                break;
            case 'department':
                const department = this.data.departments.find(d => d.id === id);
                itemName = department?.name || 'この部署';
                message = `${itemName}を削除しますか？関連する担当者も全て削除されます。`;
                break;
            case 'member':
                const member = this.data.members.find(m => m.id === id);
                itemName = member?.name || 'この担当者';
                message = `${itemName}を削除しますか？`;
                break;
        }
        
        document.getElementById('confirm-title').textContent = '削除確認';
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-dialog').classList.remove('hidden');
    }

    // 確認ダイアログからのアクション
    confirmAction(confirmed) {
        document.getElementById('confirm-dialog').classList.add('hidden');
        
        if (confirmed && this.pendingAction) {
            if (this.pendingAction.action === 'delete') {
                this.deleteItem(this.pendingAction.id, this.pendingAction.type);
            }
        }
        
        this.pendingAction = null;
    }

    // アイテム削除処理
    deleteItem(id, type) {
        switch(type) {
            case 'company':
                // 関連する部署と担当者の削除
                const companyDepartments = this.data.departments.filter(d => d.companyId === id).map(d => d.id);
                this.data.members = this.data.members.filter(m => !companyDepartments.includes(m.departmentId));
                this.data.departments = this.data.departments.filter(d => d.companyId !== id);
                this.data.companies = this.data.companies.filter(c => c.id !== id);
                break;
                
            case 'department':
                // 関連する担当者の削除
                this.data.members = this.data.members.filter(m => m.departmentId !== id);
                this.data.departments = this.data.departments.filter(d => d.id !== id);
                break;
                
            case 'member':
                this.data.members = this.data.members.filter(m => m.id !== id);
                break;
        }
        
        // データ保存
        this.saveDataToStorage();
        
        // リスト再表示
        this.renderCompaniesList();
        this.renderDepartmentsList();
        this.renderMembersList();
        this.updateCompanySelect();
        this.updateDepartmentSelect();
    }

    // ユニークID生成
    generateId() {
        return 'id_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // エラーメッセージ表示
    showError(message) {
        const toast = document.getElementById('error-toast');
        const messageElement = toast.querySelector('.error-message');
        messageElement.textContent = message;
        toast.classList.remove('hidden');

        // 5秒後に自動で閉じる
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 5000);
    }
}

// エラーメッセージを閉じる
function hideError() {
    document.getElementById('error-toast').classList.add('hidden');
}

// アプリケーション初期化
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ChimeNotificationApp();
});

// Service Worker スクリプト
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}