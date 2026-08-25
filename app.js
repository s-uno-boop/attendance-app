/**
 * TimeFlow - 出退勤管理Webアプリケーション
 * Core Logic & Cloud Synchronization
 * （Google Apps Script / スプレッドシート完全一元管理・クラウド認証・スタッフマスタ同期・休憩60分控除）
 */

(function () {
  'use strict';

  // ==========================================
  // 定数 & ストレージキー
  // ==========================================
  const STORAGE_KEY = 'timeflow_attendance_records_v1';
  const STORAGE_STAFF_KEY = 'timeflow_staff_list_v1';
  const STORAGE_ADMIN_PIN_KEY = 'timeflow_admin_pin_v1';
  const STORAGE_LAST_USER_KEY = 'timeflow_last_user_name_v1';
  const STORAGE_GAS_URL_KEY = 'timeflow_gas_api_url_v1';
  const STORAGE_SHEET_URL_KEY = 'timeflow_gas_sheet_url_v1';

  // デフォルト設定定数（LocalStorageが空の端末でも必ずこのURLと通信）
  const DEFAULT_PIN = '1234';
  const DEFAULT_STAFF = ['門上 紀子'];
  const DEFAULT_GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzU2ggc9AUGzg63r5jUW-J2DYmO_77Yke9QXoPYUd4Yv5MEaFj5MVpOxHYzLK6MRRJz/exec';
  const DEFAULT_GAS_SHEET_URL = '';

  const TYPE_CONFIG = {
    clock_in: {
      label: '出勤',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
      className: 'type-clock_in',
      toastClass: 'toast-success',
      toastMsg: '出勤を記録しました。'
    },
    clock_out: {
      label: '退勤',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
      className: 'type-clock_out',
      toastClass: 'toast-error',
      toastMsg: '退勤を記録しました。'
    }
  };

  const DAYS_JA = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

  // ==========================================
  // アプリ状態（スプレッドシートが Single Source of Truth）
  // ==========================================
  let records = [];
  let staffList = [...DEFAULT_STAFF];
  let adminPin = DEFAULT_PIN;
  let gasApiUrl = DEFAULT_GAS_API_URL;
  let gasSheetUrl = DEFAULT_GAS_SHEET_URL;
  let isSyncing = false;
  let pendingModalAction = null;

  // ==========================================
  // DOM要素
  // ==========================================
  const dom = {
    // ヘッダー & クラウドステータス
    cloudStatusBadge: document.getElementById('cloud-status-badge'),
    cloudStatusText: document.getElementById('cloud-status-text'),

    // 日付・時計・ステータス
    currentDate: document.getElementById('current-date'),
    currentDay: document.getElementById('current-day'),
    digitalClock: document.getElementById('digital-clock'),
    statusDot: document.getElementById('status-dot'),
    currentStatusText: document.getElementById('current-status-text'),
    userName: document.getElementById('user-name'),
    punchNote: document.getElementById('punch-note'),

    // 打刻ボタン
    btnClockIn: document.getElementById('btn-clock-in'),
    btnClockOut: document.getElementById('btn-clock-out'),

    // サマリー
    summaryClockIn: document.getElementById('summary-clock-in'),
    summaryClockOut: document.getElementById('summary-clock-out'),
    summaryWorkTime: document.getElementById('summary-work-time'),

    // 一般画面：履歴テーブル
    recordsCountBadge: document.getElementById('records-count-badge'),
    recordsTbody: document.getElementById('records-tbody'),
    emptyState: document.getElementById('empty-state'),
    filterUser: document.getElementById('filter-user'),
    filterPeriod: document.getElementById('filter-period'),
    filterType: document.getElementById('filter-type'),

    // 管理者ログインモーダル
    btnOpenAdminLogin: document.getElementById('btn-open-admin-login'),
    adminLoginModal: document.getElementById('admin-login-modal'),
    adminPinInput: document.getElementById('admin-pin-input'),
    adminLoginError: document.getElementById('admin-login-error'),
    adminLoginCancelBtn: document.getElementById('admin-login-cancel-btn'),
    adminLoginSubmitBtn: document.getElementById('admin-login-submit-btn'),

    // 管理者パネル
    adminPanelModal: document.getElementById('admin-panel-modal'),
    adminPanelCloseBtn: document.getElementById('admin-panel-close-btn'),
    adminTabs: document.querySelectorAll('.admin-tab'),
    adminTabContents: document.querySelectorAll('.admin-tab-content'),
    adminFilterUser: document.getElementById('admin-filter-user'),
    adminFilterPeriod: document.getElementById('admin-filter-period'),
    adminRecordsTbody: document.getElementById('admin-records-tbody'),
    btnManualAdd: document.getElementById('btn-manual-add'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnSampleData: document.getElementById('btn-sample-data'),
    btnClearAll: document.getElementById('btn-clear-all'),

    // 手動追加モーダル
    manualAddModal: document.getElementById('manual-add-modal'),
    addUserName: document.getElementById('add-user-name'),
    addDate: document.getElementById('add-date'),
    addTime: document.getElementById('add-time'),
    addType: document.getElementById('add-type'),
    addNote: document.getElementById('add-note'),
    addCancelBtn: document.getElementById('add-cancel-btn'),
    addSaveBtn: document.getElementById('add-save-btn'),

    // レコード個別編集モーダル
    editRecordModal: document.getElementById('edit-record-modal'),
    editRecordId: document.getElementById('edit-record-id'),
    editUserName: document.getElementById('edit-user-name'),
    editDate: document.getElementById('edit-date'),
    editTime: document.getElementById('edit-time'),
    editType: document.getElementById('edit-type'),
    editNote: document.getElementById('edit-note'),
    editCancelBtn: document.getElementById('edit-cancel-btn'),
    editSaveBtn: document.getElementById('edit-save-btn'),

    // スタッフ管理
    staffNameInput: document.getElementById('staff-name-input'),
    btnAddStaff: document.getElementById('btn-add-staff'),
    staffChipsWrap: document.getElementById('staff-chips-wrap'),

    // PIN変更
    currentPinInput: document.getElementById('current-pin-input'),
    newPinInput: document.getElementById('new-pin-input'),
    confirmPinInput: document.getElementById('confirm-pin-input'),
    btnChangePin: document.getElementById('btn-change-pin'),

    // Google連携設定
    gasApiUrlInput: document.getElementById('gas-api-url'),
    gasSheetUrlInput: document.getElementById('gas-sheet-url'),
    btnOpenSheet: document.getElementById('btn-open-sheet'),
    btnTestGas: document.getElementById('btn-test-gas'),
    btnSaveGas: document.getElementById('btn-save-gas'),
    btnSyncAllGas: document.getElementById('btn-sync-all-gas'),

    // トースト・確認モーダル
    toastContainer: document.getElementById('toast-container'),
    confirmModal: document.getElementById('confirm-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn')
  };

  // ==========================================
  // ユーティリティ関数 & 実労働時間計算
  // ==========================================

  function padZero(num) {
    return String(num).padStart(2, '0');
  }

  function formatDate(d) {
    return `${d.getFullYear()}/${padZero(d.getMonth() + 1)}/${padZero(d.getDate())}`;
  }

  function formatTime(d, withSeconds = true) {
    const hh = padZero(d.getHours());
    const mm = padZero(d.getMinutes());
    if (!withSeconds) return `${hh}:${mm}`;
    const ss = padZero(d.getSeconds());
    return `${hh}:${mm}:${ss}`;
  }

  function formatDurationMinutes(totalMinutes) {
    if (totalMinutes <= 0) return '0時間 0分';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}時間 ${mins}分`;
  }

  function generateId() {
    return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function calculateNetWorkMinutes(startMs, endMs) {
    if (!startMs || !endMs || endMs <= startMs) return 0;
    const grossMinutes = Math.floor((endMs - startMs) / (1000 * 60));
    const netMinutes = grossMinutes - 60; // 休憩60分を控除
    return Math.max(0, netMinutes);
  }

  // ==========================================
  // キャッシュ・初期値ロード
  // ==========================================

  function loadLocalCache() {
    try {
      const recordData = localStorage.getItem(STORAGE_KEY);
      records = recordData ? JSON.parse(recordData) : [];
      if (!Array.isArray(records)) records = [];

      const staffData = localStorage.getItem(STORAGE_STAFF_KEY);
      if (staffData) {
        const parsedStaff = JSON.parse(staffData);
        if (Array.isArray(parsedStaff) && parsedStaff.length > 0) {
          staffList = parsedStaff;
        }
      }

      adminPin = localStorage.getItem(STORAGE_ADMIN_PIN_KEY) || DEFAULT_PIN;
      gasApiUrl = localStorage.getItem(STORAGE_GAS_URL_KEY) || DEFAULT_GAS_API_URL;
      gasSheetUrl = localStorage.getItem(STORAGE_SHEET_URL_KEY) || DEFAULT_GAS_SHEET_URL;

      if (dom.gasApiUrlInput) dom.gasApiUrlInput.value = gasApiUrl;
      if (dom.gasSheetUrlInput) dom.gasSheetUrlInput.value = gasSheetUrl;
      updateCloudStatusUI();
    } catch (e) {
      console.error('LocalStorage load error:', e);
      records = [];
      staffList = [...DEFAULT_STAFF];
      gasApiUrl = DEFAULT_GAS_API_URL;
      adminPin = DEFAULT_PIN;
    }
  }

  function saveLocalRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.error('LocalStorage save error:', e);
    }
  }

  function saveLocalStaffList() {
    try {
      localStorage.setItem(STORAGE_STAFF_KEY, JSON.stringify(staffList));
    } catch (e) {
      console.error('Staff list save error:', e);
    }
  }

  function saveLocalAdminPin(pin) {
    try {
      adminPin = pin;
      localStorage.setItem(STORAGE_ADMIN_PIN_KEY, pin);
    } catch (e) {
      console.error('Admin PIN save error:', e);
    }
  }

  function saveGasConfig(url, sheetUrl) {
    try {
      gasApiUrl = (url || '').trim();
      gasSheetUrl = (sheetUrl || '').trim();
      localStorage.setItem(STORAGE_GAS_URL_KEY, gasApiUrl);
      localStorage.setItem(STORAGE_SHEET_URL_KEY, gasSheetUrl);
      updateCloudStatusUI();
    } catch (e) {
      console.error('GAS config save error:', e);
    }
  }

  function saveLastUserName(name) {
    try {
      if (name) localStorage.setItem(STORAGE_LAST_USER_KEY, name);
    } catch (e) {
      console.error('Save last user error:', e);
    }
  }

  // ==========================================
  // Google Apps Script (GAS) クラウド同期・API
  // ==========================================

  function updateCloudStatusUI(status = null) {
    if (!dom.cloudStatusBadge) return;

    dom.cloudStatusBadge.className = 'cloud-status-badge';

    if (status === 'syncing') {
      dom.cloudStatusBadge.classList.add('syncing');
      dom.cloudStatusText.textContent = '同期中...';
      return;
    }

    if (!gasApiUrl) {
      dom.cloudStatusText.textContent = 'ローカル保存';
    } else {
      dom.cloudStatusBadge.classList.add('connected');
      dom.cloudStatusText.textContent = 'クラウド連携中';
    }

    if (dom.btnOpenSheet && gasSheetUrl) {
      dom.btnOpenSheet.href = gasSheetUrl;
      dom.btnOpenSheet.style.display = 'inline-flex';
    } else if (dom.btnOpenSheet) {
      dom.btnOpenSheet.style.display = 'none';
    }
  }

  /**
   * 起動時・更新時にGASから最新データ（スタッフ一覧・管理者PIN・打刻全件）を一括完全取得 (doGet: getInitialData)
   */
  async function fetchInitialData(silent = false) {
    if (!gasApiUrl) return;

    if (!silent) updateCloudStatusUI('syncing');
    isSyncing = true;

    try {
      const url = `${gasApiUrl}?action=getInitialData&_t=${Date.now()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      if (data && data.status === 'success') {
        // 1. 管理者PIN（スプレッドシート「システム設定」シートが正）
        if (data.adminPin) {
          const cloudPin = String(data.adminPin).trim();
          if (cloudPin) {
            adminPin = cloudPin;
            saveLocalAdminPin(cloudPin);
          }
        }

        // 2. スタッフマスタ（スプレッドシート「スタッフマスタ」シートが正）
        if (Array.isArray(data.staffList) && data.staffList.length > 0) {
          staffList = data.staffList.map(s => String(s).trim()).filter(Boolean);
          saveLocalStaffList();
        }

        // 3. 打刻レコード（スプレッドシート「打刻記録」シートが正）
        if (Array.isArray(data.records)) {
          records = [...data.records].sort((a, b) => a.timestamp - b.timestamp);
          saveLocalRecords();
        }

        // 全UIをクラウドの最新状態で即時再描画（ドロップダウン、ステータス、サマリー、ログ）
        updateStaffUI();
        updateStatusUI();
        updateSummary();
        renderGeneralRecords();
        renderAdminRecords();

        updateCloudStatusUI();
        if (!silent) {
          showToast('☁ スプレッドシートから最新設定・データを同期しました', 'success');
        }
      }
    } catch (err) {
      console.warn('Fetch from GAS failed (running with local cache):', err);
      updateCloudStatusUI();
      if (!silent) {
        showToast('スプレッドシートからのデータ取得に失敗しました（ローカルデータで動作中）', 'warning');
      }
    } finally {
      isSyncing = false;
    }
  }

  /**
   * GASへPOSTリクエスト送信（打刻送信と同じ形式で統一）
   */
  async function postToGas(payload) {
    if (!gasApiUrl) return;
    try {
      updateCloudStatusUI('syncing');
      await fetch(gasApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });
      updateCloudStatusUI();
    } catch (err) {
      console.error('postToGas error:', err);
      updateCloudStatusUI();
    }
  }

  /**
   * 単一レコードをGoogle Apps ScriptへPOST送信
   */
  async function syncRecordToGas(record, workTimeString = '') {
    if (!gasApiUrl) return;

    updateCloudStatusUI('syncing');

    const payload = {
      action: 'record',
      id: record.id,
      userName: record.userName,
      dateStr: record.dateStr,
      timeStr: record.timeStr,
      type: record.type,
      typeLabel: record.typeLabel,
      note: record.note || '',
      workTime: workTimeString || '',
      timestamp: record.timestamp
    };

    try {
      await postToGas(payload);
      console.log('Record synced to Google Sheet successfully');
    } catch (err) {
      console.error('GAS sync error:', err);
      showToast('☁ スプレッドシートへの送信に失敗しました', 'warning');
    }
  }

  /**
   * 全ローカルレコードをスプレッドシートへ一括同期
   */
  async function syncAllRecordsToGas() {
    if (!gasApiUrl) {
      showToast('先に「GAS Web API URL」を設定・保存してください', 'warning');
      return;
    }

    updateCloudStatusUI('syncing');
    showToast('Googleスプレッドシートと双方向同期を実行中...', 'info');

    // 1. 打刻レコード送信
    if (records.length > 0) {
      const workTimeMap = computeRecordWorkTimes();
      const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);

      const payloadRecords = sorted.map(r => {
        const wt = workTimeMap[r.id];
        return {
          id: r.id,
          userName: r.userName,
          dateStr: r.dateStr,
          timeStr: r.timeStr,
          type: r.type,
          typeLabel: r.typeLabel,
          note: r.note || '',
          workTime: wt ? wt.text : '',
          timestamp: r.timestamp
        };
      });

      await postToGas({ action: 'bulk_sync', records: payloadRecords });
    }

    // 2. スタッフマスター送信
    if (staffList.length > 0) {
      await fetch(gasApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateStaffList',
          staffList: staffList
        }),
        mode: 'no-cors'
      });
    }

    // 3. 管理者PIN送信
    if (adminPin) {
      await fetch(gasApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updatePin',
          newPin: adminPin
        }),
        mode: 'no-cors'
      });
    }

    // 4. 最新データを再取得
    await fetchInitialData(true);
    updateCloudStatusUI();
    showToast(`☁ スプレッドシートとの同期が完了しました！（全 ${records.length}件）`, 'success');
  }

  /**
   * GAS Web API の接続テスト
   */
  async function testGasConnection() {
    const url = dom.gasApiUrlInput.value.trim();
    if (!url) {
      showToast('GAS Web API URL を入力してください', 'warning');
      return;
    }

    showToast('接続テスト＆データ同期を実行中...', 'info');

    try {
      const res = await fetch(`${url}?action=getInitialData&_t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (res.ok) {
        const json = await res.json();
        showToast('✅ Google Apps Script への双方向接続を確認しました！', 'success');
        if (json && Array.isArray(json.records)) {
          fetchInitialData(false);
        }
      } else {
        await fetch(url, { method: 'GET', mode: 'no-cors' });
        showToast('✅ Google Apps Script URL への接続を確認しました！', 'success');
      }
    } catch (err) {
      console.error('GAS connection test error:', err);
      showToast('⚠️ 接続に失敗しました。URLとデプロイ設定（アクセス権: 全員）をご確認ください', 'error');
    }
  }

  // ==========================================
  // スタッフ選択肢 & ドロップダウンの即時再描画（スタッフマスタを唯一の正とする）
  // ==========================================

  function updateStaffUI() {
    const validStaffNames = Array.from(new Set(staffList.map(s => String(s).trim()).filter(Boolean)));
    const lastSavedUser = localStorage.getItem(STORAGE_LAST_USER_KEY) || '';

    // 1. メイン打刻画面の名前ドロップダウン（<select id="user-name">）
    if (dom.userName) {
      const curSelected = dom.userName.value;
      if (validStaffNames.length === 0) {
        dom.userName.innerHTML = '<option value="">(スタッフ未登録)</option>';
      } else {
        dom.userName.innerHTML = validStaffNames
          .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
          .join('');

        if (curSelected && validStaffNames.includes(curSelected)) {
          dom.userName.value = curSelected;
        } else if (lastSavedUser && validStaffNames.includes(lastSavedUser)) {
          dom.userName.value = lastSavedUser;
        } else {
          dom.userName.value = validStaffNames[0];
        }
      }
    }

    // 2. 管理者手動追加モーダルのスタッフ選択
    if (dom.addUserName) {
      const curAdd = dom.addUserName.value;
      dom.addUserName.innerHTML = validStaffNames
        .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join('');
      if (curAdd && validStaffNames.includes(curAdd)) {
        dom.addUserName.value = curAdd;
      }
    }

    // 3. 管理者個別編集モーダルのスタッフ選択
    if (dom.editUserName) {
      const curEdit = dom.editUserName.value;
      dom.editUserName.innerHTML = validStaffNames
        .map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
        .join('');
      if (curEdit && validStaffNames.includes(curEdit)) {
        dom.editUserName.value = curEdit;
      }
    }

    // 4. 一般画面：名前フィルター
    if (dom.filterUser) {
      const selected = dom.filterUser.value;
      let opts = '<option value="all">全員</option>';
      validStaffNames.forEach(name => {
        const isSel = (name === selected) ? 'selected' : '';
        opts += `<option value="${escapeHtml(name)}" ${isSel}>${escapeHtml(name)}</option>`;
      });
      dom.filterUser.innerHTML = opts;
    }

    // 5. 管理者画面：名前フィルター
    if (dom.adminFilterUser) {
      const selected = dom.adminFilterUser.value;
      let opts = '<option value="all">全員</option>';
      validStaffNames.forEach(name => {
        const isSel = (name === selected) ? 'selected' : '';
        opts += `<option value="${escapeHtml(name)}" ${isSel}>${escapeHtml(name)}</option>`;
      });
      dom.adminFilterUser.innerHTML = opts;
    }

    // 6. 管理者パネル：スタッフチップ一覧
    if (dom.staffChipsWrap) {
      if (validStaffNames.length === 0) {
        dom.staffChipsWrap.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">登録スタッフがいません</span>';
      } else {
        dom.staffChipsWrap.innerHTML = validStaffNames.map(name => `
          <div class="staff-chip">
            <span>${escapeHtml(name)}</span>
            <button class="btn-remove-staff" data-name="${escapeHtml(name)}" title="このスタッフを削除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `).join('');

        dom.staffChipsWrap.querySelectorAll('.btn-remove-staff').forEach(btn => {
          btn.addEventListener('click', () => {
            const targetName = btn.getAttribute('data-name');
            removeStaff(targetName);
          });
        });
      }
    }
  }

  /**
   * スタッフ追加処理（GAS即時POST送信 ＆ ボタンローディング制御）
   */
  async function addStaff(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      showToast('スタッフ名を入力してください', 'warning');
      return;
    }
    if (staffList.includes(trimmed)) {
      showToast('そのスタッフ名は既に登録されています', 'warning');
      return;
    }

    const btn = dom.btnAddStaff;
    const originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spinner"></span> <span>保存中...</span>';
    }

    updateCloudStatusUI('syncing');

    try {
      const newStaffList = [...staffList, trimmed];

      // GASへ直接POST送信（打刻送信と同じ形式）
      await fetch(gasApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateStaffList',
          staffList: newStaffList
        }),
        mode: 'no-cors'
      });

      staffList = newStaffList;
      saveLocalStaffList();

      // UI（スタッフマスタ一覧 ＆ 打刻画面プルダウン）を即時再描画
      updateStaffUI();
      if (dom.staffNameInput) dom.staffNameInput.value = '';

      updateCloudStatusUI();
      showToast(`スタッフ「${trimmed}」を登録しました（☁ スプレッドシート同期済）`, 'success');
    } catch (err) {
      console.error('addStaff error:', err);
      updateCloudStatusUI();
      showToast('スタッフのクラウド保存に失敗しました', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
      }
    }
  }

  /**
   * スタッフ削除処理（GAS即時POST送信）
   */
  function removeStaff(name) {
    showConfirmModal(
      'スタッフの削除',
      `スタッフ「${name}」をリストから削除しますか？\n（※過去の打刻記録は保持されます）`,
      async () => {
        updateCloudStatusUI('syncing');
        try {
          const newStaffList = staffList.filter(s => s !== name);

          // GASへ直接POST送信（打刻送信と同じ形式）
          await fetch(gasApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'updateStaffList',
              staffList: newStaffList
            }),
            mode: 'no-cors'
          });

          staffList = newStaffList;
          saveLocalStaffList();

          // UI再描画
          updateStaffUI();
          updateStatusUI();
          updateSummary();

          updateCloudStatusUI();
          showToast(`スタッフ「${name}」を削除しました（☁ スプレッドシート同期済）`, 'info');
        } catch (err) {
          console.error('removeStaff error:', err);
          updateCloudStatusUI();
          showToast('スタッフ削除のクラウド同期に失敗しました', 'error');
        }
      }
    );
  }

  /**
   * PIN変更処理（GAS即時POST送信 ＆ ボタンローディング制御）
   */
  async function handlePinChange() {
    const curPin = dom.currentPinInput.value.trim();
    const newPin = dom.newPinInput.value.trim();
    const confPin = dom.confirmPinInput.value.trim();

    if (curPin !== adminPin) {
      showToast('現在のPINコードが正しくありません', 'error');
      return;
    }
    if (newPin.length < 4 || newPin.length > 8) {
      showToast('新しいPINは4〜8文字で設定してください', 'warning');
      return;
    }
    if (newPin !== confPin) {
      showToast('新しいPINコード（確認）が一致しません', 'error');
      return;
    }

    const btn = dom.btnChangePin;
    const originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spinner"></span> <span>保存中...</span>';
    }

    updateCloudStatusUI('syncing');

    try {
      // GASへ updatePin POSTリクエスト送信（打刻送信と同じ形式）
      await fetch(gasApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updatePin',
          newPin: newPin
        }),
        mode: 'no-cors'
      });

      adminPin = newPin;
      saveLocalAdminPin(newPin);

      dom.currentPinInput.value = '';
      dom.newPinInput.value = '';
      dom.confirmPinInput.value = '';

      updateCloudStatusUI();
      showToast('管理者PINコードを変更しました（☁ スプレッドシート「システム設定」に保存済）', 'success');
    } catch (err) {
      console.error('PIN update error:', err);
      updateCloudStatusUI();
      showToast('PIN変更のクラウド送信に失敗しました', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
      }
    }
  }

  // ==========================================
  // 時計 & 日付更新
  // ==========================================

  function updateClock() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dayJa = DAYS_JA[now.getDay()];

    dom.currentDate.textContent = `${year}年${month}月${date}日`;
    dom.currentDay.textContent = dayJa;
    dom.digitalClock.textContent = formatTime(now, true);

    updateSummary();
  }

  // ==========================================
  // 状態判定 & ボタン活性制御
  // ==========================================

  function getCurrentStatus() {
    const todayStr = formatDate(new Date());
    const currentName = (dom.userName ? dom.userName.value : '').trim();

    const todayRecords = records
      .filter(r => {
        if (r.dateStr !== todayStr) return false;
        if (currentName && r.userName && r.userName !== currentName) return false;
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    if (todayRecords.length === 0) {
      return { status: 'none', label: '未出勤', dotClass: 'status-off' };
    }

    const last = todayRecords[todayRecords.length - 1];

    if (last.type === 'clock_in') {
      return { status: 'working', label: '勤務中', dotClass: 'status-working' };
    } else if (last.type === 'clock_out') {
      return { status: 'left', label: '退勤済', dotClass: 'status-left' };
    }

    return { status: 'none', label: '未出勤', dotClass: 'status-off' };
  }

  function updateStatusUI() {
    const current = getCurrentStatus();

    dom.currentStatusText.textContent = current.label;
    dom.statusDot.className = `status-dot ${current.dotClass}`;

    dom.btnClockIn.classList.remove('recommended');
    dom.btnClockOut.classList.remove('recommended');
    dom.btnClockIn.removeAttribute('disabled');
    dom.btnClockOut.removeAttribute('disabled');

    if (current.status === 'none') {
      dom.btnClockIn.classList.add('recommended');
      dom.btnClockOut.setAttribute('disabled', 'true');
    } else if (current.status === 'working') {
      dom.btnClockOut.classList.add('recommended');
      dom.btnClockIn.setAttribute('disabled', 'true');
    } else if (current.status === 'left') {
      dom.btnClockIn.classList.add('recommended');
      dom.btnClockOut.setAttribute('disabled', 'true');
    }
  }

  // ==========================================
  // サマリー計算 & 表示（休憩60分控除）
  // ==========================================

  function updateSummary() {
    const todayStr = formatDate(new Date());
    const currentName = (dom.userName ? dom.userName.value : '').trim();

    const todayRecords = records
      .filter(r => {
        if (r.dateStr !== todayStr) return false;
        if (currentName && r.userName && r.userName !== currentName) return false;
        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    if (todayRecords.length === 0) {
      dom.summaryClockIn.textContent = '--:--';
      dom.summaryClockOut.textContent = '--:--';
      dom.summaryWorkTime.textContent = '0時間 0分';
      return;
    }

    const firstClockIn = todayRecords.find(r => r.type === 'clock_in');
    dom.summaryClockIn.textContent = firstClockIn ? firstClockIn.timeStr.substring(0, 5) : '--:--';

    const clockOuts = todayRecords.filter(r => r.type === 'clock_out');
    const lastClockOut = clockOuts.length > 0 ? clockOuts[clockOuts.length - 1] : null;
    dom.summaryClockOut.textContent = lastClockOut ? lastClockOut.timeStr.substring(0, 5) : '--:--';

    if (firstClockIn) {
      let endMs = Date.now();
      if (lastClockOut) {
        endMs = lastClockOut.timestamp;
      }
      const netMinutes = calculateNetWorkMinutes(firstClockIn.timestamp, endMs);
      dom.summaryWorkTime.textContent = formatDurationMinutes(netMinutes);
    } else {
      dom.summaryWorkTime.textContent = '0時間 0分';
    }
  }

  function computeRecordWorkTimes() {
    const workTimeMap = {};
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const userDayClockIns = {};

    sorted.forEach(r => {
      const user = r.userName || '未設定';
      const key = `${user}_${r.dateStr}`;

      if (r.type === 'clock_in') {
        userDayClockIns[key] = r.timestamp;
        workTimeMap[r.id] = null;
      } else if (r.type === 'clock_out') {
        const startMs = userDayClockIns[key];
        if (startMs) {
          const netMins = calculateNetWorkMinutes(startMs, r.timestamp);
          workTimeMap[r.id] = {
            minutes: netMins,
            text: formatDurationMinutes(netMins)
          };
          delete userDayClockIns[key];
        } else {
          workTimeMap[r.id] = null;
        }
      }
    });

    return workTimeMap;
  }

  // ==========================================
  // 打刻処理（一般画面）
  // ==========================================

  function handlePunch(type) {
    const config = TYPE_CONFIG[type];
    if (!config) return;

    const rawUserName = dom.userName.value.trim();
    const userName = rawUserName || (staffList[0] || DEFAULT_STAFF[0]);
    const noteValue = dom.punchNote.value.trim();
    const now = new Date();

    const record = {
      id: generateId(),
      userName: userName,
      dateStr: formatDate(now),
      timeStr: formatTime(now, true),
      type: type,
      typeLabel: config.label,
      note: noteValue,
      timestamp: now.getTime()
    };

    records.push(record);
    saveLocalRecords();
    saveLastUserName(userName);

    if (userName && !staffList.includes(userName)) {
      staffList.push(userName);
      saveLocalStaffList();
      updateStaffUI();
      postToGas({ action: 'updateStaffList', staffList: staffList });
    }

    dom.punchNote.value = '';

    updateStatusUI();
    updateSummary();
    renderGeneralRecords();
    renderAdminRecords();

    // 実労働時間の計算（退勤時）
    const workTimeMap = computeRecordWorkTimes();
    const wt = workTimeMap[record.id];
    const workTimeString = wt ? wt.text : '';

    // クラウド（Googleスプレッドシート）へ自動送信
    syncRecordToGas(record, workTimeString);

    const cloudMsg = gasApiUrl ? '（☁ スプレッドシート連携中）' : '';
    showToast(`【${userName}様】${config.toastMsg}${cloudMsg}`, config.toastClass);
  }

  // ==========================================
  // 一般画面：記録テーブル描画（閲覧専用）
  // ==========================================

  function getFilteredRecords(userFilter, periodFilter, typeFilter) {
    const now = new Date();
    const todayStr = formatDate(now);
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
    const currentMonthPrefix = `${now.getFullYear()}/${padZero(now.getMonth() + 1)}`;

    return records.filter(r => {
      if (userFilter !== 'all' && (r.userName || '') !== userFilter) {
        return false;
      }
      if (periodFilter === 'today' && r.dateStr !== todayStr) {
        return false;
      }
      if (periodFilter === 'week' && r.timestamp < sevenDaysAgo) {
        return false;
      }
      if (periodFilter === 'month' && !r.dateStr.startsWith(currentMonthPrefix)) {
        return false;
      }
      if (typeFilter !== 'all' && r.type !== typeFilter) {
        return false;
      }
      return true;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }

  function renderGeneralRecords() {
    const userFilter = dom.filterUser ? dom.filterUser.value : 'all';
    const periodFilter = dom.filterPeriod ? dom.filterPeriod.value : 'today';
    const typeFilter = dom.filterType ? dom.filterType.value : 'all';

    const filtered = getFilteredRecords(userFilter, periodFilter, typeFilter);
    const workTimeMap = computeRecordWorkTimes();

    dom.recordsCountBadge.textContent = `${filtered.length}件`;

    if (filtered.length === 0) {
      dom.recordsTbody.innerHTML = '';
      dom.emptyState.classList.remove('hidden');
      return;
    }

    dom.emptyState.classList.add('hidden');

    const html = filtered.map(r => {
      const config = TYPE_CONFIG[r.type] || {
        label: r.typeLabel || r.type,
        icon: '',
        className: 'type-clock_in'
      };

      const wt = workTimeMap[r.id];
      const workTimeDisplay = wt 
        ? `<span class="worktime-col">${wt.text}</span>` 
        : `<span class="worktime-col empty">-</span>`;

      const isAdminModified = r.note && (r.note.includes('[管理者修正]') || r.note.includes('[管理者追加]'));
      const cleanNote = r.note 
        ? r.note.replace(/\[管理者修正\]/g, '').replace(/\[管理者追加\]/g, '').trim()
        : '';
      const tagHtml = isAdminModified ? '<span class="admin-tag">⚙ 修正</span>' : '';
      const noteContent = (tagHtml + escapeHtml(cleanNote)) || '<span style="opacity: 0.35;">-</span>';

      return `
        <tr>
          <td class="user-col">${escapeHtml(r.userName || '未設定')}</td>
          <td class="date-col">${r.dateStr}</td>
          <td class="time-col">${r.timeStr}</td>
          <td>
            <span class="type-tag ${config.className}">
              ${config.icon}
              ${config.label}
            </span>
          </td>
          <td class="note-col ${r.note ? 'has-note' : ''}">${noteContent}</td>
          <td>${workTimeDisplay}</td>
          <td class="timestamp-col">${r.timestamp}</td>
        </tr>
      `;
    }).join('');

    dom.recordsTbody.innerHTML = html;
  }

  // ==========================================
  // 管理者画面：記録テーブル描画
  // ==========================================

  function renderAdminRecords() {
    if (!dom.adminRecordsTbody) return;

    const userFilter = dom.adminFilterUser ? dom.adminFilterUser.value : 'all';
    const periodFilter = dom.adminFilterPeriod ? dom.adminFilterPeriod.value : 'all';

    const filtered = getFilteredRecords(userFilter, periodFilter, 'all');
    const workTimeMap = computeRecordWorkTimes();

    if (filtered.length === 0) {
      dom.adminRecordsTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">
            該当する勤怠データがありません
          </td>
        </tr>
      `;
      return;
    }

    const html = filtered.map(r => {
      const config = TYPE_CONFIG[r.type] || {
        label: r.typeLabel || r.type,
        icon: '',
        className: 'type-clock_in'
      };

      const wt = workTimeMap[r.id];
      const workTimeDisplay = wt 
        ? `<span class="worktime-col">${wt.text}</span>` 
        : `<span class="worktime-col empty">-</span>`;

      const isAdminModified = r.note && (r.note.includes('[管理者修正]') || r.note.includes('[管理者追加]'));
      const cleanNote = r.note 
        ? r.note.replace(/\[管理者修正\]/g, '').replace(/\[管理者追加\]/g, '').trim()
        : '';
      const tagHtml = isAdminModified ? '<span class="admin-tag">⚙ 修正</span>' : '';
      const noteContent = (tagHtml + escapeHtml(cleanNote)) || '<span style="opacity: 0.35;">-</span>';

      return `
        <tr data-id="${r.id}">
          <td class="user-col">${escapeHtml(r.userName || '未設定')}</td>
          <td class="date-col">${r.dateStr}</td>
          <td class="time-col">${r.timeStr}</td>
          <td>
            <span class="type-tag ${config.className}">
              ${config.icon}
              ${config.label}
            </span>
          </td>
          <td class="note-col ${r.note ? 'has-note' : ''}">${noteContent}</td>
          <td>${workTimeDisplay}</td>
          <td class="timestamp-col">${r.timestamp}</td>
          <td>
            <div class="action-btn-group">
              <button class="btn-edit-row" data-id="${r.id}" title="このレコードを編集">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn-delete-row" data-id="${r.id}" title="このレコードを削除">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    dom.adminRecordsTbody.innerHTML = html;

    dom.adminRecordsTbody.querySelectorAll('.btn-edit-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditModal(id);
      });
    });

    dom.adminRecordsTbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteRecord(id);
      });
    });
  }

  // ==========================================
  // 手動新規登録モーダル (管理者機能)
  // ==========================================

  function openManualAddModal() {
    const now = new Date();
    updateStaffUI();
    dom.addUserName.value = dom.adminFilterUser.value !== 'all' ? dom.adminFilterUser.value : (staffList[0] || DEFAULT_STAFF[0]);
    dom.addDate.value = formatDate(now);
    dom.addTime.value = formatTime(now, true);
    dom.addType.value = 'clock_in';
    dom.addNote.value = '';

    dom.manualAddModal.classList.remove('hidden');
  }

  function saveManualAddRecord() {
    const userName = dom.addUserName.value.trim() || DEFAULT_STAFF[0];
    const dateStr = dom.addDate.value.trim();
    const timeStr = dom.addTime.value.trim();
    const type = dom.addType.value;
    let note = dom.addNote.value.trim();

    if (!dateStr || !timeStr) {
      showToast('日付と時刻を正しく入力してください', 'warning');
      return;
    }

    const dateParts = dateStr.split(/[\/\-]/);
    const timeParts = timeStr.split(':');
    let timestamp = Date.now();

    if (dateParts.length === 3 && timeParts.length >= 2) {
      const parsed = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
        parseInt(timeParts[0], 10),
        parseInt(timeParts[1], 10),
        timeParts[2] ? parseInt(timeParts[2], 10) : 0
      );
      if (!isNaN(parsed.getTime())) {
        timestamp = parsed.getTime();
      }
    }

    const finalNote = note ? `[管理者追加] ${note}` : '[管理者追加]';

    const record = {
      id: generateId(),
      userName: userName,
      dateStr: dateStr,
      timeStr: timeStr,
      type: type,
      typeLabel: TYPE_CONFIG[type] ? TYPE_CONFIG[type].label : '出勤',
      note: finalNote,
      timestamp: timestamp
    };

    records.push(record);
    saveLocalRecords();

    if (userName && !staffList.includes(userName)) {
      staffList.push(userName);
      saveLocalStaffList();
      updateStaffUI();
      postToGas({ action: 'updateStaffList', staffList: staffList });
    }

    updateStatusUI();
    updateSummary();
    renderGeneralRecords();
    renderAdminRecords();

    const workTimeMap = computeRecordWorkTimes();
    const wt = workTimeMap[record.id];
    syncRecordToGas(record, wt ? wt.text : '');

    dom.manualAddModal.classList.add('hidden');
    showToast(`【${userName}様】の打刻を手動登録しました`, 'success');
  }

  // ==========================================
  // レコード個別編集モーダル (管理者機能)
  // ==========================================

  function openEditModal(id) {
    const target = records.find(r => r.id === id);
    if (!target) return;

    updateStaffUI();
    dom.editRecordId.value = target.id;
    dom.editUserName.value = target.userName || (staffList[0] || '');
    dom.editDate.value = target.dateStr || '';
    dom.editTime.value = target.timeStr || '';
    dom.editType.value = target.type || 'clock_in';

    const cleanNote = (target.note || '')
      .replace(/\[管理者修正\]/g, '')
      .replace(/\[管理者追加\]/g, '')
      .trim();
    dom.editNote.value = cleanNote;

    dom.editRecordModal.classList.remove('hidden');
  }

  function saveEditedRecord() {
    const id = dom.editRecordId.value;
    const target = records.find(r => r.id === id);
    if (!target) return;

    const oldTimestamp = target.timestamp;
    const oldUserName = target.userName;
    const oldDateStr = target.dateStr;
    const oldTimeStr = target.timeStr;

    const newName = dom.editUserName.value.trim() || '未設定';
    const newDateStr = dom.editDate.value.trim();
    const newTimeStr = dom.editTime.value.trim();
    const newType = dom.editType.value;
    const rawNote = dom.editNote.value.trim();

    const dateParts = newDateStr.split(/[\/\-]/);
    const timeParts = newTimeStr.split(':');

    let newTimestamp = target.timestamp;
    if (dateParts.length === 3 && timeParts.length >= 2) {
      const parsedDate = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
        parseInt(timeParts[0], 10),
        parseInt(timeParts[1], 10),
        timeParts[2] ? parseInt(timeParts[2], 10) : 0
      );
      if (!isNaN(parsedDate.getTime())) {
        newTimestamp = parsedDate.getTime();
      }
    }

    const finalNote = rawNote ? `[管理者修正] ${rawNote}` : '[管理者修正]';

    target.userName = newName;
    target.dateStr = newDateStr;
    target.timeStr = newTimeStr;
    target.type = newType;
    target.typeLabel = TYPE_CONFIG[newType] ? TYPE_CONFIG[newType].label : '出勤';
    target.note = finalNote;
    target.timestamp = newTimestamp;

    saveLocalRecords();
    updateStatusUI();
    updateSummary();
    renderGeneralRecords();
    renderAdminRecords();

    const workTimeMap = computeRecordWorkTimes();
    const wt = workTimeMap[target.id];
    const wtStr = wt ? wt.text : '';

    // スプレッドシート側の行も完全同期更新
    postToGas({
      action: 'update_record',
      oldTimestamp: oldTimestamp,
      oldUserName: oldUserName,
      oldDateStr: oldDateStr,
      oldTimeStr: oldTimeStr,
      timestamp: newTimestamp,
      userName: newName,
      dateStr: newDateStr,
      timeStr: newTimeStr,
      type: newType,
      typeLabel: target.typeLabel,
      note: finalNote,
      workTime: wtStr
    });

    dom.editRecordModal.classList.add('hidden');
    showToast('打刻データを修正しました（[管理者修正] タグ付与）', 'success');
  }

  // ==========================================
  // レコード削除・全件クリア (管理者専用)
  // ==========================================

  function deleteRecord(id) {
    const target = records.find(r => r.id === id);
    if (!target) return;

    const targetUser = target.userName || '未設定';
    showConfirmModal(
      '記録の削除',
      `【${targetUser}】${target.dateStr} ${target.timeStr} の「${target.typeLabel}」を削除してもよろしいですか？`,
      () => {
        records = records.filter(r => r.id !== id);
        saveLocalRecords();
        updateStatusUI();
        updateSummary();
        renderGeneralRecords();
        renderAdminRecords();

        // スプレッドシート側も削除
        postToGas({
          action: 'delete_record',
          timestamp: target.timestamp,
          userName: target.userName,
          dateStr: target.dateStr,
          timeStr: target.timeStr
        });

        showToast('記録を1件削除しました', 'info');
      }
    );
  }

  function clearAllRecords() {
    if (records.length === 0) {
      showToast('削除する記録がありません', 'info');
      return;
    }

    showConfirmModal(
      '全記録の削除',
      'すべての打刻履歴（LocalStorage）を完全に消去します。この操作は取り消せません。本当によろしいですか？',
      () => {
        records = [];
        saveLocalRecords();
        updateStatusUI();
        updateSummary();
        renderGeneralRecords();
        renderAdminRecords();

        // スプレッドシート側も全件クリア
        postToGas({ action: 'clear_all' });
        showToast('すべての打刻記録をリセットしました', 'info');
      }
    );
  }

  // ==========================================
  // CSVエクスポート
  // ==========================================

  function exportCsv() {
    if (records.length === 0) {
      showToast('出力可能な勤怠記録がありません', 'warning');
      return;
    }

    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const workTimeMap = computeRecordWorkTimes();

    const headers = ['名前', '日付', '時刻', '打刻種別', 'メモ・備考', '実労働時間(休憩60分控除)', 'タイムスタンプ'];
    const rows = [headers];

    sorted.forEach(r => {
      const wt = workTimeMap[r.id];
      const wtStr = wt ? wt.text : '';

      const row = [
        `"${(r.userName || '未設定').replace(/"/g, '""')}"`,
        r.dateStr,
        r.timeStr,
        r.typeLabel || r.type,
        `"${(r.note || '').replace(/"/g, '""')}"`,
        `"${wtStr}"`,
        r.timestamp
      ];
      rows.push(row);
    });

    const csvContent = rows.map(e => e.join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStamp = `${now.getFullYear()}${padZero(now.getMonth() + 1)}${padZero(now.getDate())}_${padZero(now.getHours())}${padZero(now.getMinutes())}`;
    const filename = `attendance_records_${dateStamp}.csv`;

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`CSVファイル（${filename}）を出力しました`, 'success');
  }

  // ==========================================
  // サンプルデータ投入
  // ==========================================

  function insertSampleData() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const sampleList = [];

    // 2日前: 09:00〜18:00 (実働 8時間 0分)
    const d2 = new Date(today.getTime() - 2 * 86400000);
    const d2Str = formatDate(d2);
    sampleList.push(
      { id: generateId(), userName: '門上 紀子', timestamp: new Date(d2.getFullYear(), d2.getMonth(), d2.getDate(), 9, 0, 0).getTime(), type: 'clock_in', typeLabel: '出勤', dateStr: d2Str, timeStr: '09:00:00', note: '定時出勤' },
      { id: generateId(), userName: '門上 紀子', timestamp: new Date(d2.getFullYear(), d2.getMonth(), d2.getDate(), 18, 0, 0).getTime(), type: 'clock_out', typeLabel: '退勤', dateStr: d2Str, timeStr: '18:00:00', note: '業務終了' }
    );

    // 1日前: 09:00〜18:30 (実働 8時間 30分)
    const d1 = new Date(today.getTime() - 1 * 86400000);
    const d1Str = formatDate(d1);
    sampleList.push(
      { id: generateId(), userName: '門上 紀子', timestamp: new Date(d1.getFullYear(), d1.getMonth(), d1.getDate(), 9, 0, 0).getTime(), type: 'clock_in', typeLabel: '出勤', dateStr: d1Str, timeStr: '09:00:00', note: '[管理者修正] 直行対応' },
      { id: generateId(), userName: '門上 紀子', timestamp: new Date(d1.getFullYear(), d1.getMonth(), d1.getDate(), 18, 30, 0).getTime(), type: 'clock_out', typeLabel: '退勤', dateStr: d1Str, timeStr: '18:30:00', note: '' }
    );

    // 本日: 09:00出勤
    const d0Str = formatDate(today);
    sampleList.push(
      { id: generateId(), userName: '門上 紀子', timestamp: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0).getTime(), type: 'clock_in', typeLabel: '出勤', dateStr: d0Str, timeStr: '09:00:00', note: '出社' }
    );

    records = [...sampleList, ...records];
    saveLocalRecords();
    updateStaffUI();
    updateStatusUI();
    updateSummary();
    renderGeneralRecords();
    renderAdminRecords();

    showToast('サンプルデータを追加しました', 'success');
  }

  // ==========================================
  // 管理者認証 & パネル制御（スプレッドシート照合）
  // ==========================================

  function openAdminLogin() {
    dom.adminPinInput.value = '';
    dom.adminLoginError.classList.add('hidden');
    dom.adminLoginModal.classList.remove('hidden');
    fetchInitialData(true);
    setTimeout(() => dom.adminPinInput.focus(), 50);
  }

  function closeAdminLogin() {
    dom.adminLoginModal.classList.add('hidden');
  }

  async function handleAdminLogin() {
    const inputPin = dom.adminPinInput.value.trim();
    if (!inputPin) {
      dom.adminLoginError.classList.remove('hidden');
      return;
    }

    // 1. メモリ上のPINと照合
    if (inputPin === adminPin) {
      dom.adminLoginModal.classList.add('hidden');
      openAdminPanel();
      showToast('管理者としてログインしました', 'info');
      return;
    }

    // 2. もし不一致でも、GASへ直接検証リクエスト（スプレッドシート最新値と照合）
    if (gasApiUrl) {
      try {
        const res = await fetch(`${gasApiUrl}?action=verifyPin&pin=${encodeURIComponent(inputPin)}&_t=${Date.now()}`);
        if (res.ok) {
          const json = await res.json();
          if (json && json.verified) {
            adminPin = inputPin;
            saveLocalAdminPin(inputPin);
            dom.adminLoginModal.classList.add('hidden');
            openAdminPanel();
            showToast('管理者としてログインしました（☁ クラウド認証）', 'info');
            return;
          }
        }
      } catch (err) {
        console.warn('Direct PIN verification failed:', err);
      }
    }

    dom.adminLoginError.classList.remove('hidden');
    dom.adminPinInput.select();
  }

  function openAdminPanel() {
    updateStaffUI();
    renderAdminRecords();
    if (dom.gasApiUrlInput) dom.gasApiUrlInput.value = gasApiUrl;
    if (dom.gasSheetUrlInput) dom.gasSheetUrlInput.value = gasSheetUrl;
    dom.adminPanelModal.classList.remove('hidden');
    fetchInitialData(true);
  }

  function closeAdminPanel() {
    dom.adminPanelModal.classList.add('hidden');
    updateStaffUI();
    renderGeneralRecords();
  }

  // ==========================================
  // トースト通知 & 確認モーダル
  // ==========================================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const toastClass = type.startsWith('toast-') ? type : `toast-${type}`;
    toast.className = `toast ${toastClass}`;

    let iconSvg = '';
    if (type === 'success' || type === 'toast-success') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    } else if (type === 'warning' || type === 'toast-warning') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    } else if (type === 'error' || type === 'toast-error') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 20);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3600);
  }

  function showConfirmModal(title, message, onConfirm) {
    dom.modalTitle.textContent = title;
    dom.modalMessage.textContent = message;
    pendingModalAction = onConfirm;
    dom.confirmModal.classList.remove('hidden');
  }

  function hideConfirmModal() {
    dom.confirmModal.classList.add('hidden');
    pendingModalAction = null;
  }

  // ==========================================
  // イベントリスナー初期化
  // ==========================================

  function initEventListeners() {
    // 0. クラウドステータスバッジのクリックで手動最新データ再取得
    if (dom.cloudStatusBadge) {
      dom.cloudStatusBadge.style.cursor = 'pointer';
      dom.cloudStatusBadge.setAttribute('title', 'クリックで最新データをスプレッドシートから再同期');
      dom.cloudStatusBadge.addEventListener('click', () => {
        if (!isSyncing) fetchInitialData(false);
      });
    }

    // タブ復帰時（画面再表示時）の自動再同期
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && gasApiUrl) {
        fetchInitialData(true);
      }
    });

    // 1. 一般打刻画面イベント
    dom.btnClockIn.addEventListener('click', () => handlePunch('clock_in'));
    dom.btnClockOut.addEventListener('click', () => handlePunch('clock_out'));

    // お名前ドロップダウン切り替え時にステータス・サマリーを即時更新
    dom.userName.addEventListener('change', () => {
      saveLastUserName(dom.userName.value.trim());
      updateStatusUI();
      updateSummary();
    });

    dom.punchNote.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const recommendedBtn = document.querySelector('.punch-btn.recommended:not(:disabled)');
        if (recommendedBtn) {
          const type = recommendedBtn.getAttribute('data-type');
          handlePunch(type);
        }
      }
    });

    if (dom.filterUser) dom.filterUser.addEventListener('change', renderGeneralRecords);
    if (dom.filterPeriod) dom.filterPeriod.addEventListener('change', renderGeneralRecords);
    if (dom.filterType) dom.filterType.addEventListener('change', renderGeneralRecords);

    // 2. 管理者ログイン認証
    dom.btnOpenAdminLogin.addEventListener('click', openAdminLogin);
    dom.adminLoginCancelBtn.addEventListener('click', closeAdminLogin);
    dom.adminLoginSubmitBtn.addEventListener('click', handleAdminLogin);
    dom.adminPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdminLogin();
    });

    // 3. 管理者パネル制御
    dom.adminPanelCloseBtn.addEventListener('click', closeAdminPanel);

    // 管理者タブ切り替え
    dom.adminTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = `tab-${tab.getAttribute('data-tab')}`;
        dom.adminTabs.forEach(t => t.classList.remove('active'));
        dom.adminTabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add('active');
      });
    });

    // 管理者データ管理ツールバー
    if (dom.adminFilterUser) dom.adminFilterUser.addEventListener('change', renderAdminRecords);
    if (dom.adminFilterPeriod) dom.adminFilterPeriod.addEventListener('change', renderAdminRecords);
    dom.btnManualAdd.addEventListener('click', openManualAddModal);
    dom.btnExportCsv.addEventListener('click', exportCsv);
    dom.btnSampleData.addEventListener('click', insertSampleData);
    dom.btnClearAll.addEventListener('click', clearAllRecords);

    // 手動追加モーダル
    dom.addCancelBtn.addEventListener('click', () => dom.manualAddModal.classList.add('hidden'));
    dom.addSaveBtn.addEventListener('click', saveManualAddRecord);

    // レコード個別編集モーダル
    dom.editCancelBtn.addEventListener('click', () => dom.editRecordModal.classList.add('hidden'));
    dom.editSaveBtn.addEventListener('click', saveEditedRecord);

    // スタッフ管理：ボタンクリック & Enterキー
    dom.btnAddStaff.addEventListener('click', () => addStaff(dom.staffNameInput.value));
    dom.staffNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addStaff(dom.staffNameInput.value);
    });

    // PIN変更：更新ボタン
    dom.btnChangePin.addEventListener('click', handlePinChange);

    // Google連携設定
    dom.btnSaveGas.addEventListener('click', () => {
      saveGasConfig(dom.gasApiUrlInput.value, dom.gasSheetUrlInput.value);
      showToast('Google Apps Script連携設定を保存しました', 'success');
      fetchInitialData(false);
    });
    dom.btnTestGas.addEventListener('click', testGasConnection);
    dom.btnSyncAllGas.addEventListener('click', syncAllRecordsToGas);

    // 汎用確認モーダルのボタン
    dom.modalCancelBtn.addEventListener('click', hideConfirmModal);
    dom.modalConfirmBtn.addEventListener('click', () => {
      if (typeof pendingModalAction === 'function') {
        pendingModalAction();
      }
      hideConfirmModal();
    });

    // モーダル個別背景クリック制御
    dom.confirmModal.addEventListener('click', (e) => {
      if (e.target === dom.confirmModal) hideConfirmModal();
    });

    dom.editRecordModal.addEventListener('click', (e) => {
      if (e.target === dom.editRecordModal) dom.editRecordModal.classList.add('hidden');
    });

    dom.manualAddModal.addEventListener('click', (e) => {
      if (e.target === dom.manualAddModal) dom.manualAddModal.classList.add('hidden');
    });

    dom.adminLoginModal.addEventListener('click', (e) => {
      if (e.target === dom.adminLoginModal) closeAdminLogin();
    });

    dom.adminPanelModal.addEventListener('click', (e) => {
      if (e.target === dom.adminPanelModal) {
        const isEditOpen = !dom.editRecordModal.classList.contains('hidden');
        const isManualAddOpen = !dom.manualAddModal.classList.contains('hidden');
        const isConfirmOpen = !dom.confirmModal.classList.contains('hidden');
        if (!isEditOpen && !isManualAddOpen && !isConfirmOpen) {
          closeAdminPanel();
        }
      }
    });

    // ESCキー対応
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!dom.confirmModal.classList.contains('hidden')) {
          hideConfirmModal();
        } else if (!dom.editRecordModal.classList.contains('hidden')) {
          dom.editRecordModal.classList.add('hidden');
        } else if (!dom.manualAddModal.classList.contains('hidden')) {
          dom.manualAddModal.classList.add('hidden');
        } else if (!dom.adminLoginModal.classList.contains('hidden')) {
          closeAdminLogin();
        } else if (!dom.adminPanelModal.classList.contains('hidden')) {
          closeAdminPanel();
        }
      }
    });
  }

  // ==========================================
  // アプリケーション起動
  // ==========================================

  function init() {
    loadLocalCache();
    initEventListeners();
    updateStaffUI();
    updateClock();
    setInterval(updateClock, 1000);
    updateStatusUI();
    updateSummary();
    renderGeneralRecords();

    // 起動時に必ずスプレッドシートから最新マスター（スタッフ一覧・PIN・打刻全件）を同期
    if (gasApiUrl) {
      fetchInitialData(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
