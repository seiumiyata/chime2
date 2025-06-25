// チャイム通知PWAアプリケーション - iPad mini 2対応版
function ChimeNotificationApp() {
    var self = this;
    
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

    // デフォルトデータ
    this.data = {
        companies: [],
        departments: [],
        members: [],
        adminPassword: 'admin123',
        webhookUrl: '',
        chimeSettings: {
            type: 'beep', // 'beep', 'tone1', 'tone2', 'custom'
            volume: 0.5,
            duration: 2000
        }
    };

    // プライベート変数
    this.audioContext = null;
    this.pendingAction = null;
    this.customAudioBuffer = null;

    // アプリ初期化
    this.initApp();
}

// アプリ初期化処理
ChimeNotificationApp.prototype.initApp = function() {
    var self = this;
    this.loadDataFromStorage();
    this.setupEventListeners();
    this.setupServiceWorker();
    this.initTheme();
    
    setTimeout(function() {
        self.hideLoadingScreen();
        self.renderCurrentScreen();
    }, 1000);
};

// ServiceWorker登録
ChimeNotificationApp.prototype.setupServiceWorker = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registered successfully');
            })
            .catch(function(error) {
                console.log('ServiceWorker registration failed:', error);
            });
    }
};

// データをlocalStorageに保存
ChimeNotificationApp.prototype.saveDataToStorage = function() {
    try {
        localStorage.setItem('chimeNotificationData', JSON.stringify(this.data));
    } catch (error) {
        console.error('Error saving data to localStorage:', error);
        this.showError('データの保存に失敗しました');
    }
};

// データをlocalStorageから読み込み
ChimeNotificationApp.prototype.loadDataFromStorage = function() {
    try {
        var savedData = localStorage.getItem('chimeNotificationData');
        if (savedData) {
            this.data = JSON.parse(savedData);
            // 新しい設定項目がない場合は追加
            if (!this.data.chimeSettings) {
                this.data.chimeSettings = {
                    type: 'beep',
                    volume: 0.5,
                    duration: 2000
                };
            }
        } else {
            this.initializeDefaultData();
            this.saveDataToStorage();
        }
    } catch (error) {
        console.error('Error loading data from localStorage:', error);
        this.initializeDefaultData();
    }
};

// デフォルトデータ初期化
ChimeNotificationApp.prototype.initializeDefaultData = function() {
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
        webhookUrl: "",
        chimeSettings: {
            type: 'beep',
            volume: 0.5,
            duration: 2000
        }
    };
};

// イベントリスナー設定
ChimeNotificationApp.prototype.setupEventListeners = function() {
    var self = this;
    
    // ヘッダーボタン
    document.getElementById('back-btn').addEventListener('click', function() {
        self.goBack();
    });
    document.getElementById('theme-toggle').addEventListener('click', function() {
        self.toggleTheme();
    });
    document.getElementById('admin-toggle').addEventListener('click', function() {
        self.showAdminScreen();
    });

    // 管理者認証関連
    document.getElementById('auth-btn').addEventListener('click', function() {
        self.authenticate();
    });
    document.getElementById('admin-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
            self.authenticate();
        }
    });
    document.getElementById('back-to-main').addEventListener('click', function() {
        self.hideAdminScreen();
    });
    document.getElementById('admin-logout').addEventListener('click', function() {
        self.logout();
    });

    // 管理者タブ
    var navTabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < navTabs.length; i++) {
        navTabs[i].addEventListener('click', function(e) {
            var tab = e.target.closest('.nav-tab');
            if (tab) {
                self.switchAdminTab(tab.getAttribute('data-tab'));
            }
        });
    }

    // 通知リセットボタン
    document.getElementById('manual-reset-btn').addEventListener('click', function() {
        self.reset();
    });

    // 検索機能
    document.getElementById('company-search').addEventListener('input', function(e) {
        self.handleSearch('company', e.target.value);
    });
    document.getElementById('department-search').addEventListener('input', function(e) {
        self.handleSearch('department', e.target.value);
    });
    document.getElementById('member-search').addEventListener('input', function(e) {
        self.handleSearch('member', e.target.value);
    });

    // 確認ダイアログ
    document.getElementById('confirm-yes').addEventListener('click', function() {
        self.confirmAction(true);
    });
    document.getElementById('confirm-no').addEventListener('click', function() {
        self.confirmAction(false);
    });

    // 管理者機能のイベントリスナー
    this.setupAdminEventListeners();
};

// 管理者機能のイベントリスナー
ChimeNotificationApp.prototype.setupAdminEventListeners = function() {
    var self = this;
    
    // 会社管理
    document.getElementById('add-company-btn').addEventListener('click', function() {
        self.showAddForm('company');
    });
    document.getElementById('save-company').addEventListener('click', function() {
        self.saveCompany();
    });
    document.getElementById('cancel-company').addEventListener('click', function() {
        self.hideAddForm('company');
    });

    // 部署管理
    document.getElementById('add-department-btn').addEventListener('click', function() {
        self.showAddForm('department');
    });
    document.getElementById('save-department').addEventListener('click', function() {
        self.saveDepartment();
    });
    document.getElementById('cancel-department').addEventListener('click', function() {
        self.hideAddForm('department');
    });

    // 担当者管理
    document.getElementById('add-member-btn').addEventListener('click', function() {
        self.showAddForm('member');
    });
    document.getElementById('save-member').addEventListener('click', function() {
        self.saveMember();
    });
    document.getElementById('cancel-member').addEventListener('click', function() {
        self.hideAddForm('member');
    });

    // 設定管理
    document.getElementById('save-settings').addEventListener('click', function() {
        self.saveSettings();
    });

    // チャイム音設定
    document.getElementById('chime-type').addEventListener('change', function() {
        self.previewChime();
    });
    document.getElementById('chime-volume').addEventListener('input', function() {
        self.updateVolumeDisplay();
    });
    document.getElementById('preview-chime').addEventListener('click', function() {
        self.previewChime();
    });
    document.getElementById('upload-custom-chime').addEventListener('change', function(e) {
        self.handleCustomChimeUpload(e);
    });
};

// ローディング表示を消す
ChimeNotificationApp.prototype.hideLoadingScreen = function() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
};

// テーマ初期化
ChimeNotificationApp.prototype.initTheme = function() {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.state.theme = prefersDark ? 'dark' : 'light';
    this.applyTheme();
};

// テーマの切り替え
ChimeNotificationApp.prototype.toggleTheme = function() {
    this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
    this.applyTheme();
};

// テーマの適用
ChimeNotificationApp.prototype.applyTheme = function() {
    var app = document.getElementById('app');
    var themeIcon = document.querySelector('.theme-icon');
    
    if (this.state.theme === 'dark') {
        app.setAttribute('data-color-scheme', 'dark');
        if (themeIcon) themeIcon.textContent = '☀️';
    } else {
        app.setAttribute('data-color-scheme', 'light');
        if (themeIcon) themeIcon.textContent = '🌙';
    }
};

// 現在の画面を表示
ChimeNotificationApp.prototype.renderCurrentScreen = function() {
    this.updateProgressBar();
    this.updateScreenTitle();
    this.updateBackButton();

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
};

// プログレスバー更新
ChimeNotificationApp.prototype.updateProgressBar = function() {
    var steps = ['company', 'department', 'member', 'notification'];
    var currentIndex = steps.indexOf(this.state.currentScreen);
    var progress = ((currentIndex + 1) / steps.length) * 100;
    
    var progressFill = document.getElementById('progress-fill');
    if (progressFill) {
        progressFill.style.width = progress + '%';
    }

    for (var i = 0; i < steps.length; i++) {
        var stepElement = document.getElementById('step-' + steps[i]);
        if (stepElement) {
            if (i <= currentIndex) {
                stepElement.classList.add('active');
            } else {
                stepElement.classList.remove('active');
            }
        }
    }
};

// 画面タイトル更新
ChimeNotificationApp.prototype.updateScreenTitle = function() {
    var titles = {
        company: 'チャイム通知システム',
        department: '部署選択',
        member: '担当者選択',
        notification: '通知送信'
    };
    
    var titleElement = document.getElementById('screen-title');
    if (titleElement) {
        titleElement.textContent = titles[this.state.currentScreen];
    }
};

// 戻るボタン更新
ChimeNotificationApp.prototype.updateBackButton = function() {
    var backBtn = document.getElementById('back-btn');
    if (backBtn) {
        if (this.state.currentScreen === 'company') {
            backBtn.classList.add('hidden');
        } else {
            backBtn.classList.remove('hidden');
        }
    }
};

// 会社選択画面の表示
ChimeNotificationApp.prototype.renderCompanyScreen = function() {
    this.showScreen('company-screen');
    var filteredCompanies = this.filterData(this.data.companies, this.state.searchTerm);
    this.renderGrid('company-grid', filteredCompanies, this.renderCompanyButton.bind(this));
    this.renderPagination('company-pagination', filteredCompanies.length);
};

// 部署選択画面の表示
ChimeNotificationApp.prototype.renderDepartmentScreen = function() {
    this.showScreen('department-screen');
    var selectedCompanyName = document.getElementById('selected-company-name');
    if (selectedCompanyName && this.state.selectedCompany) {
        selectedCompanyName.textContent = this.state.selectedCompany.name;
    }
    
    var departments = this.data.departments.filter(function(dept) {
        return dept.companyId === this.state.selectedCompany.id;
    }.bind(this));
    
    var filteredDepartments = this.filterData(departments, this.state.searchTerm);
    this.renderGrid('department-grid', filteredDepartments, this.renderDepartmentButton.bind(this));
    this.renderPagination('department-pagination', filteredDepartments.length);
};

// 担当者選択画面の表示
ChimeNotificationApp.prototype.renderMemberScreen = function() {
    this.showScreen('member-screen');
    
    var memberSelectedCompany = document.getElementById('member-selected-company');
    var memberSelectedDepartment = document.getElementById('member-selected-department');
    
    if (memberSelectedCompany && this.state.selectedCompany) {
        memberSelectedCompany.textContent = this.state.selectedCompany.name;
    }
    if (memberSelectedDepartment && this.state.selectedDepartment) {
        memberSelectedDepartment.textContent = this.state.selectedDepartment.name;
    }
    
    var members = this.data.members.filter(function(member) {
        return member.departmentId === this.state.selectedDepartment.id;
    }.bind(this));
    
    var filteredMembers = this.filterData(members, this.state.searchTerm);
    this.renderGrid('member-grid', filteredMembers, this.renderMemberButton.bind(this));
    this.renderPagination('member-pagination', filteredMembers.length);
};

// 通知画面の表示
ChimeNotificationApp.prototype.renderNotificationScreen = function() {
    this.showScreen('notification-screen');
    this.updateNotificationSummary();
};

// 指定された画面を表示
ChimeNotificationApp.prototype.showScreen = function(screenId) {
    var screens = document.querySelectorAll('.selection-screen');
    for (var i = 0; i < screens.length; i++) {
        screens[i].classList.remove('active');
    }
    
    var targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
};

// データの検索・フィルタリング
ChimeNotificationApp.prototype.filterData = function(data, searchTerm) {
    if (!searchTerm) return data;
    
    var filtered = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i].name.toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) {
            filtered.push(data[i]);
        }
    }
    return filtered;
};

// ボタングリッド表示
ChimeNotificationApp.prototype.renderGrid = function(gridId, data, renderFunction) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    
    var startIndex = (this.state.currentPage - 1) * this.state.itemsPerPage;
    var pageData = data.slice(startIndex, startIndex + this.state.itemsPerPage);
    
    grid.innerHTML = '';
    
    if (pageData.length === 0) {
        var emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message';
        emptyMessage.textContent = '該当するデータがありません';
        grid.appendChild(emptyMessage);
        return;
    }

    for (var i = 0; i < pageData.length; i++) {
        var button = renderFunction(pageData[i]);
        grid.appendChild(button);
    }
};

// 会社ボタンの作成
ChimeNotificationApp.prototype.renderCompanyButton = function(company) {
    var self = this;
    var button = document.createElement('button');
    button.className = 'selection-button';
    button.innerHTML = '<div class="button-icon">🏢</div><div class="button-text">' + company.name + '</div>';
    button.addEventListener('click', function() {
        self.selectCompany(company);
    });
    return button;
};

// 部署ボタンの作成
ChimeNotificationApp.prototype.renderDepartmentButton = function(department) {
    var self = this;
    var button = document.createElement('button');
    button.className = 'selection-button';
    button.innerHTML = '<div class="button-icon">🏬</div><div class="button-text">' + department.name + '</div>';
    button.addEventListener('click', function() {
        self.selectDepartment(department);
    });
    return button;
};

// 担当者ボタンの作成
ChimeNotificationApp.prototype.renderMemberButton = function(member) {
    var self = this;
    var button = document.createElement('button');
    button.className = 'selection-button';
    button.innerHTML = '<div class="button-icon">👤</div><div class="button-text">' + member.name + '</div>';
    button.addEventListener('click', function() {
        self.selectMember(member);
    });
    return button;
};

// ページネーション表示
ChimeNotificationApp.prototype.renderPagination = function(paginationId, totalItems) {
    var pagination = document.getElementById(paginationId);
    if (!pagination) return;
    
    var totalPages = Math.ceil(totalItems / this.state.itemsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    pagination.innerHTML = '';

    // 前へボタン
    var prevBtn = this.createPaginationButton('‹', this.state.currentPage - 1, this.state.currentPage <= 1);
    pagination.appendChild(prevBtn);

    // ページ番号
    var startPage = Math.max(1, this.state.currentPage - 2);
    var endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
        pagination.appendChild(this.createPaginationButton('1', 1, false));
        if (startPage > 2) {
            var ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pagination.appendChild(ellipsis);
        }
    }

    for (var i = startPage; i <= endPage; i++) {
        var pageBtn = this.createPaginationButton(i.toString(), i, false, i === this.state.currentPage);
        pagination.appendChild(pageBtn);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            var ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            pagination.appendChild(ellipsis);
        }
        pagination.appendChild(this.createPaginationButton(totalPages.toString(), totalPages, false));
    }

    // 次へボタン
    var nextBtn = this.createPaginationButton('›', this.state.currentPage + 1, this.state.currentPage >= totalPages);
    pagination.appendChild(nextBtn);
};

// ページネーションボタン作成
ChimeNotificationApp.prototype.createPaginationButton = function(text, page, disabled, active) {
    var self = this;
    var button = document.createElement('button');
    button.className = 'pagination-button';
    button.textContent = text;
    button.disabled = disabled;
    
    if (active) {
        button.classList.add('active');
    }
    
    if (!disabled) {
        button.addEventListener('click', function() {
            self.state.currentPage = page;
            self.renderCurrentScreen();
        });
    }
    
    return button;
};

// 会社選択時の処理
ChimeNotificationApp.prototype.selectCompany = function(company) {
    this.state.selectedCompany = company;
    this.state.currentScreen = 'department';
    this.state.searchTerm = '';
    this.state.currentPage = 1;
    this.renderCurrentScreen();
};

// 部署選択時の処理
ChimeNotificationApp.prototype.selectDepartment = function(department) {
    this.state.selectedDepartment = department;
    this.state.currentScreen = 'member';
    this.state.searchTerm = '';
    this.state.currentPage = 1;
    this.renderCurrentScreen();
};

// 担当者選択時の処理
ChimeNotificationApp.prototype.selectMember = function(member) {
    this.state.selectedMember = member;
    this.state.currentScreen = 'notification';
    this.state.searchTerm = '';
    this.state.currentPage = 1;
    this.renderCurrentScreen();
    this.processNotification();
};

// 通知サマリーの更新
ChimeNotificationApp.prototype.updateNotificationSummary = function() {
    var finalCompanyName = document.getElementById('final-company-name');
    var finalDepartmentName = document.getElementById('final-department-name');
    var finalMemberName = document.getElementById('final-member-name');
    var notificationTime = document.getElementById('notification-time');
    
    if (finalCompanyName) {
        finalCompanyName.textContent = this.state.selectedCompany ? this.state.selectedCompany.name : '-';
    }
    if (finalDepartmentName) {
        finalDepartmentName.textContent = this.state.selectedDepartment ? this.state.selectedDepartment.name : '-';
    }
    if (finalMemberName) {
        finalMemberName.textContent = this.state.selectedMember ? this.state.selectedMember.name : '-';
    }
    
    if (notificationTime) {
        var now = new Date();
        var timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                        now.getMinutes().toString().padStart(2, '0') + ':' + 
                        now.getSeconds().toString().padStart(2, '0');
        notificationTime.textContent = timeString;
    }
};

// 通知処理
ChimeNotificationApp.prototype.processNotification = function() {
    var self = this;
    
    this.playChime()
        .then(function() {
            var chimeStatus = document.getElementById('chime-status');
            if (chimeStatus) {
                chimeStatus.classList.add('completed');
                var statusText = chimeStatus.querySelector('.status-text');
                if (statusText) {
                    statusText.textContent = 'チャイム音再生完了';
                }
            }
            
            return self.sendTeamsNotification();
        })
        .then(function() {
            var teamsStatus = document.getElementById('teams-status');
            if (teamsStatus) {
                teamsStatus.classList.add('completed');
                var statusText = teamsStatus.querySelector('.status-text');
                if (statusText) {
                    statusText.textContent = 'Teams通知送信完了';
                }
            }
            
            self.showNotificationResult(true, '通知送信完了', '3秒後に最初の画面に戻ります');
            
            setTimeout(function() {
                self.reset();
            }, 3000);
        })
        .catch(function(error) {
            self.showNotificationResult(false, '通知送信エラー', error.message);
        });
};

// チャイム音の再生（互換性改善版）
ChimeNotificationApp.prototype.playChime = function() {
    var self = this;
    
    return new Promise(function(resolve, reject) {
        try {
            self.startWaveAnimation();
            
            // Web Audio API初期化
            if (!self.audioContext) {
                try {
                    var AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext) {
                        self.audioContext = new AudioContext();
                    } else {
                        throw new Error('Web Audio API非対応');
                    }
                } catch (e) {
                    // フォールバック: HTMLAudioElementを使用
                    self.playChimeFallback();
                    resolve();
                    return;
                }
            }
            
            // チャイム音タイプに応じて再生
            switch (self.data.chimeSettings.type) {
                case 'beep':
                    self.playBeepChime(resolve);
                    break;
                case 'tone1':
                    self.playTone1Chime(resolve);
                    break;
                case 'tone2':
                    self.playTone2Chime(resolve);
                    break;
                case 'custom':
                    if (self.customAudioBuffer) {
                        self.playCustomChime(resolve);
                    } else {
                        self.playBeepChime(resolve);
                    }
                    break;
                default:
                    self.playBeepChime(resolve);
                    break;
            }
        } catch (error) {
            console.error('Chime play error:', error);
            self.playChimeFallback();
            resolve();
        }
    });
};

// ベーシックチャイム音
ChimeNotificationApp.prototype.playBeepChime = function(resolve) {
    var oscillator = this.audioContext.createOscillator();
    var gainNode = this.audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.start();
    
    // フェードイン
    gainNode.gain.linearRampToValueAtTime(this.data.chimeSettings.volume, this.audioContext.currentTime + 0.1);
    
    // 周波数変化
    oscillator.frequency.linearRampToValueAtTime(1760, this.audioContext.currentTime + 0.5);
    
    var self = this;
    setTimeout(function() {
        oscillator.frequency.setValueAtTime(1318.51, self.audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(659.25, self.audioContext.currentTime + 0.5);
        
        setTimeout(function() {
            gainNode.gain.linearRampToValueAtTime(0, self.audioContext.currentTime + 0.5);
            setTimeout(function() {
                oscillator.stop();
                resolve();
            }, 500);
        }, 500);
    }, 500);
};

// トーン1チャイム音
ChimeNotificationApp.prototype.playTone1Chime = function(resolve) {
    var oscillator = this.audioContext.createOscillator();
    var gainNode = this.audioContext.createGain();
    
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.start();
    
    gainNode.gain.linearRampToValueAtTime(this.data.chimeSettings.volume, this.audioContext.currentTime + 0.05);
    
    var self = this;
    var notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    var noteIndex = 0;
    
    function playNextNote() {
        if (noteIndex < notes.length) {
            oscillator.frequency.setValueAtTime(notes[noteIndex], self.audioContext.currentTime);
            noteIndex++;
            setTimeout(playNextNote, 300);
        } else {
            gainNode.gain.linearRampToValueAtTime(0, self.audioContext.currentTime + 0.2);
            setTimeout(function() {
                oscillator.stop();
                resolve();
            }, 200);
        }
    }
    
    playNextNote();
};

// トーン2チャイム音
ChimeNotificationApp.prototype.playTone2Chime = function(resolve) {
    var oscillator = this.audioContext.createOscillator();
    var gainNode = this.audioContext.createGain();
    
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.start();
    
    gainNode.gain.linearRampToValueAtTime(this.data.chimeSettings.volume, this.audioContext.currentTime + 0.05);
    
    // アルペジオ
    var notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    var currentTime = this.audioContext.currentTime;
    
    for (var i = 0; i < notes.length; i++) {
        oscillator.frequency.setValueAtTime(notes[i], currentTime + (i * 0.2));
    }
    
    setTimeout(function() {
        gainNode.gain.linearRampToValueAtTime(0, oscillator.context.currentTime + 0.3);
        setTimeout(function() {
            oscillator.stop();
            resolve();
        }, 300);
    }, 800);
};

// カスタムチャイム音
ChimeNotificationApp.prototype.playCustomChime = function(resolve) {
    var source = this.audioContext.createBufferSource();
    var gainNode = this.audioContext.createGain();
    
    source.buffer = this.customAudioBuffer;
    gainNode.gain.value = this.data.chimeSettings.volume;
    
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    source.start();
    
    source.onended = function() {
        resolve();
    };
    
    // 最大再生時間の制限
    setTimeout(function() {
        try {
            source.stop();
        } catch (e) {
            // 既に停止済みの場合
        }
        resolve();
    }, this.data.chimeSettings.duration);
};

// フォールバック音再生
ChimeNotificationApp.prototype.playChimeFallback = function() {
    try {
        // 簡単なビープ音を作成
        var audio = document.createElement('audio');
        audio.volume = this.data.chimeSettings.volume;
        
        // データURLでビープ音を生成（非常にシンプル）
        var freq = 880;
        var duration = 1;
        var sampleRate = 44100;
        var samples = duration * sampleRate;
        var buffer = new ArrayBuffer(samples * 2);
        var view = new DataView(buffer);
        
        for (var i = 0; i < samples; i++) {
            var sample = Math.sin(freq * 2 * Math.PI * i / sampleRate) * 0.5;
            view.setInt16(i * 2, sample * 0x7FFF, true);
        }
        
        var blob = new Blob([buffer], { type: 'audio/wav' });
        audio.src = URL.createObjectURL(blob);
        audio.play();
    } catch (e) {
        console.warn('フォールバック音再生も失敗しました:', e);
    }
};

// 波形アニメーション開始
ChimeNotificationApp.prototype.startWaveAnimation = function() {
    var canvas = document.getElementById('wave-canvas');
    if (!canvas) return;
    
    var ctx = canvas.getContext('2d');
    canvas.width = 300;
    canvas.height = 200;
    
    var animationId;
    var time = 0;
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 波形描画
        var gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#21808d30');
        gradient.addColorStop(1, '#21808d05');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#21808d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        
        for (var x = 0; x < canvas.width; x++) {
            var y1 = Math.sin((x * 0.02) + (time * 0.05)) * 30;
            var y2 = Math.sin((x * 0.04) + (time * 0.03)) * 15;
            var y = canvas.height / 2 + y1 + y2;
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        time++;
        animationId = requestAnimationFrame(animate);
    }
    
    var waveContainer = document.getElementById('wave-container');
    if (waveContainer) {
        waveContainer.classList.remove('hidden');
    }
    
    animate();
    
    setTimeout(function() {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        if (waveContainer) {
            waveContainer.classList.add('hidden');
        }
    }, 3000);
};

// Teams通知送信
ChimeNotificationApp.prototype.sendTeamsNotification = function() {
    var self = this;
    var company = this.state.selectedCompany.name;
    var department = this.state.selectedDepartment.name;
    var member = this.state.selectedMember.name;
    var timestamp = new Date().toLocaleString('ja-JP');
    var webhookUrl = this.data.webhookUrl;
    
    return new Promise(function(resolve, reject) {
        if (!webhookUrl) {
            setTimeout(resolve, 1500);
            return;
        }
        
        var payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": "0076D7",
            "summary": member + "さんへの来客通知",
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
        
        var xhr = new XMLHttpRequest();
        xhr.open('POST', webhookUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                resolve(); // エラーでも続行
            }
        };
        
        xhr.onerror = function() {
            resolve(); // エラーでも続行
        };
        
        xhr.send(JSON.stringify(payload));
    });
};

// 通知結果表示
ChimeNotificationApp.prototype.showNotificationResult = function(success, message, detail) {
    var resultContainer = document.getElementById('notification-result');
    if (!resultContainer) return;
    
    var resultIcon = resultContainer.querySelector('.result-icon');
    var resultMessage = resultContainer.querySelector('.result-message');
    var resultDetail = resultContainer.querySelector('.result-detail');
    
    if (resultIcon) resultIcon.textContent = success ? '✅' : '❌';
    if (resultMessage) resultMessage.textContent = message;
    if (resultDetail) resultDetail.textContent = detail;
    
    resultContainer.classList.remove('hidden');
    
    setTimeout(function() {
        resultContainer.classList.add('hidden');
    }, 3000);
};

// 戻るボタンの処理
ChimeNotificationApp.prototype.goBack = function() {
    var screens = ['company', 'department', 'member', 'notification'];
    var currentIndex = screens.indexOf(this.state.currentScreen);
    
    if (currentIndex > 0) {
        this.state.currentScreen = screens[currentIndex - 1];
        this.state.searchTerm = '';
        this.state.currentPage = 1;
        this.renderCurrentScreen();
    }
};

// 検索処理
ChimeNotificationApp.prototype.handleSearch = function(screenType, term) {
    this.state.searchTerm = term;
    this.state.currentPage = 1;
    this.renderCurrentScreen();
};

// リセット処理
ChimeNotificationApp.prototype.reset = function() {
    this.state.selectedCompany = null;
    this.state.selectedDepartment = null;
    this.state.selectedMember = null;
    this.state.currentScreen = 'company';
    this.state.searchTerm = '';
    this.state.currentPage = 1;
    
    var statuses = document.querySelectorAll('.status-item');
    for (var i = 0; i < statuses.length; i++) {
        statuses[i].classList.remove('completed');
        var statusText = statuses[i].querySelector('.status-text');
        if (statusText && statusText.textContent.indexOf('完了') !== -1) {
            statusText.textContent = statusText.textContent.replace('完了', '中...');
        }
    }
    
    this.renderCurrentScreen();
};

// 管理者画面表示
ChimeNotificationApp.prototype.showAdminScreen = function() {
    var adminScreen = document.getElementById('admin-screen');
    if (adminScreen) {
        adminScreen.classList.remove('hidden');
    }
    
    if (!this.state.isAuthenticated) {
        var authScreen = document.getElementById('auth-screen');
        var adminContent = document.getElementById('admin-content');
        var adminPassword = document.getElementById('admin-password');
        
        if (authScreen) authScreen.classList.remove('hidden');
        if (adminContent) adminContent.classList.add('hidden');
        if (adminPassword) adminPassword.focus();
    } else {
        var authScreen = document.getElementById('auth-screen');
        var adminContent = document.getElementById('admin-content');
        
        if (authScreen) authScreen.classList.add('hidden');
        if (adminContent) adminContent.classList.remove('hidden');
        this.renderAdminContent();
    }
};

// 管理者画面を隠す
ChimeNotificationApp.prototype.hideAdminScreen = function() {
    var adminScreen = document.getElementById('admin-screen');
    if (adminScreen) {
        adminScreen.classList.add('hidden');
    }
};

// 管理者認証処理
ChimeNotificationApp.prototype.authenticate = function() {
    var passwordInput = document.getElementById('admin-password');
    if (!passwordInput) return;
    
    var password = passwordInput.value;
    
    if (password === this.data.adminPassword) {
        this.state.isAuthenticated = true;
        
        var authScreen = document.getElementById('auth-screen');
        var adminContent = document.getElementById('admin-content');
        
        if (authScreen) authScreen.classList.add('hidden');
        if (adminContent) adminContent.classList.remove('hidden');
        
        this.renderAdminContent();
        passwordInput.value = '';
    } else {
        this.showError('パスワードが正しくありません');
        passwordInput.value = '';
        passwordInput.focus();
    }
};

// ログアウト処理
ChimeNotificationApp.prototype.logout = function() {
    this.state.isAuthenticated = false;
    this.hideAdminScreen();
};

// 管理者コンテンツ表示
ChimeNotificationApp.prototype.renderAdminContent = function() {
    this.renderCompaniesList();
    this.renderDepartmentsList();
    this.renderMembersList();
    this.updateCompanySelect();
    this.updateDepartmentSelect();
    this.loadSettingsToForm();
};

// 管理画面のタブ切り替え
ChimeNotificationApp.prototype.switchAdminTab = function(tabName) {
    var tabs = document.querySelectorAll('.nav-tab');
    for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('data-tab') === tabName) {
            tabs[i].classList.add('active');
        } else {
            tabs[i].classList.remove('active');
        }
    }
    
    var panels = document.querySelectorAll('.tab-panel');
    for (var i = 0; i < panels.length; i++) {
        if (panels[i].id === tabName + '-tab') {
            panels[i].classList.add('active');
        } else {
            panels[i].classList.remove('active');
        }
    }
};

// チャイム音設定関連
ChimeNotificationApp.prototype.previewChime = function() {
    var chimeType = document.getElementById('chime-type');
    if (chimeType) {
        this.data.chimeSettings.type = chimeType.value;
    }
    
    var chimeVolume = document.getElementById('chime-volume');
    if (chimeVolume) {
        this.data.chimeSettings.volume = parseFloat(chimeVolume.value);
    }
    
    this.playChime();
};

ChimeNotificationApp.prototype.updateVolumeDisplay = function() {
    var chimeVolume = document.getElementById('chime-volume');
    var volumeDisplay = document.getElementById('volume-display');
    
    if (chimeVolume && volumeDisplay) {
        var volume = Math.round(parseFloat(chimeVolume.value) * 100);
        volumeDisplay.textContent = volume + '%';
    }
};

ChimeNotificationApp.prototype.handleCustomChimeUpload = function(e) {
    var self = this;
    var file = e.target.files[0];
    
    if (!file) return;
    
    if (!file.type.startsWith('audio/')) {
        this.showError('音声ファイルを選択してください');
        return;
    }
    
    var reader = new FileReader();
    reader.onload = function(event) {
        var arrayBuffer = event.target.result;
        
        if (self.audioContext) {
            self.audioContext.decodeAudioData(arrayBuffer)
                .then(function(audioBuffer) {
                    self.customAudioBuffer = audioBuffer;
                    self.data.chimeSettings.type = 'custom';
                    self.data.chimeSettings.duration = Math.min(audioBuffer.duration * 1000, 5000);
                    
                    var chimeType = document.getElementById('chime-type');
                    if (chimeType) {
                        chimeType.value = 'custom';
                    }
                    
                    self.saveDataToStorage();
                    alert('カスタムチャイム音をアップロードしました');
                })
                .catch(function(error) {
                    console.error('Audio decode error:', error);
                    self.showError('音声ファイルの読み込みに失敗しました');
                });
        }
    };
    
    reader.readAsArrayBuffer(file);
};

// その他の管理機能（省略版）
ChimeNotificationApp.prototype.renderCompaniesList = function() {
    // 実装は既存のコードと同様
};

ChimeNotificationApp.prototype.saveSettings = function() {
    var webhookUrl = document.getElementById('webhook-url');
    var adminPassword = document.getElementById('admin-password-setting');
    var chimeType = document.getElementById('chime-type');
    var chimeVolume = document.getElementById('chime-volume');
    
    if (webhookUrl) this.data.webhookUrl = webhookUrl.value;
    if (adminPassword && adminPassword.value) this.data.adminPassword = adminPassword.value;
    if (chimeType) this.data.chimeSettings.type = chimeType.value;
    if (chimeVolume) this.data.chimeSettings.volume = parseFloat(chimeVolume.value);
    
    this.saveDataToStorage();
    this.showError('設定を保存しました');
};

ChimeNotificationApp.prototype.loadSettingsToForm = function() {
    var webhookUrl = document.getElementById('webhook-url');
    var chimeType = document.getElementById('chime-type');
    var chimeVolume = document.getElementById('chime-volume');
    
    if (webhookUrl) webhookUrl.value = this.data.webhookUrl || '';
    if (chimeType) chimeType.value = this.data.chimeSettings.type || 'beep';
    if (chimeVolume) {
        chimeVolume.value = this.data.chimeSettings.volume || 0.5;
        this.updateVolumeDisplay();
    }
};

// エラー表示
ChimeNotificationApp.prototype.showError = function(message) {
    alert(message);
};

// 確認ダイアログ
ChimeNotificationApp.prototype.confirmAction = function(confirmed) {
    // 実装省略
};

// アプリ初期化
document.addEventListener('DOMContentLoaded', function() {
    window.app = new ChimeNotificationApp();
});
