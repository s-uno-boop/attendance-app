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

  // デフォルト設定定数
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
  // アプリ状態
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
    cloudStatusBadge: document.getElementById('cloud-status-badge'),
    cloudStatusText: document.getElementById('cloud-status-text'),
    currentDate: document.getElementById('current-date'),
    currentDay: document.getElementById('current-day'),
    digitalClock: document.getElementById('digital-clock'),
    statusDot: document.getElementById('status-dot'),
    currentStatusText: document.getElementById('current-status-text'),
    userName: document.getElementById('user-name'),
    punchNote: document.getElementById('punch-note'),
    btnClockIn: document.getElementById('btn-clock-in'),
    btnClockOut: document.getElementById('btn-clock-out'),
    summaryClockIn: document.getElementById('summary-clock-in'),
    summaryClockOut: document.getElementById('summary-clock-out'),
    summaryWorkTime: document.getElementById('summary-work-time'),
    recordsCountBadge: document.getElementById('records-count-badge'),
    recordsTbody: document.getElementById('records-tbody'),
    emptyState: document.getElementById('empty-state'),
    filterUser: document.getElementById('filter-user'),
    filterPeriod: document.getElementById('filter-period'),
    filterType: document.getElementById('filter-type'),
    btnOpenAdminLogin: document.getElementById('btn-open-admin-login'),
    adminLoginModal: document.getElementById('admin-login-modal'),
    adminPinInput: document.getElementById('admin-pin-input'),
    adminLoginError: document.getElementById('admin-login-error'),
    adminLoginCancelBtn: document.getElementById('admin-login-cancel-btn'),
    adminLoginSubmitBtn: document.getElementById('admin-login-submit-btn'),
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
    manualAddModal: document.getElementById('manual-add-modal'),
    addUserName: document.getElementById('add-user-name'),
    addDate: document.getElementById('add-date'),
    addTime: document.getElementById('add-time'),
    addType: document.getElementById('add-type'),
    addNote: document.getElementById('add-note'),
    addCancelBtn: document.getElementById('add-cancel-btn'),
    addSaveBtn: document.getElementById('add-save-btn'),
    editRecordModal: document.getElementById('edit-record-modal'),
    editRecordId: document.getElementById('edit-record-id'),
    editUserName: document.getElementById('edit-user-name'),
    editDate: document.getElementById('edit-date'),
    editTime: document.getElementById('edit-time'),
    editType: document.getElementById('edit-type'),
    editNote: document.getElementById('edit-note'),
    editCancelBtn: document.getElementById('edit-cancel-btn'),
    editSaveBtn: document.getElementById('edit-save-btn'),
    staffNameInput: document.getElementById('staff-name-input'),
    btnAddStaff: document.getElementById('btn-add-staff'),
    staffChipsWrap: document.getElementById('staff-chips-wrap'),
    currentPinInput: document.getElementById('current-pin-input'),
    newPinInput: document.getElementById('new-pin-input'),
    confirmPinInput: document.getElementById('confirm-pin-input'),
    btnChangePin: document.getElementById('btn-change-pin'),
    gasApiUrlInput: document.getElementById('gas-api-url'),
    gasSheetUrlInput: document.getElementById('gas-sheet-url'),
    btnOpenSheet: document.getElementById('btn-open-sheet'),
    btnTestGas: document.getElementById('btn-test-gas'),
    btnSaveGas: document.getElementById('btn-save-gas'),
    btnSyncAllGas: document.getElementById('btn-sync-all-gas'),
    toastContainer: document.getElementById('toast-container'),
    confirmModal: document.getElementById('confirm-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn')
  };

  // ==========================================
  // ユーティリティ
  // ==========================================
  function padZero(num) { return String(num).padStart(2, '0'); }
  function formatDate(d) { return `${d.getFullYear()}/${padZero(d.getMonth() + 1)}/${padZero(d.getDate())}`; }
  function formatTime(d, withSeconds = true) {
    const hh = padZero(d.getHours());
    const mm = padZero(d.getMinutes());
    if (!withSeconds) return `${hh}:${mm}`;
    return `${hh}:${mm}:${padZero(d.getSeconds())}`;
  }
  function formatDurationMinutes(totalMinutes) {
    if (totalMinutes <= 0) return '0時間 0分';
    return `${Math.floor(totalMinutes / 60)}時間 ${totalMinutes % 60}分`;
  }
  function generateId() { return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7); }
  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function calculateNetWorkMinutes(startMs, endMs) {
    if (!startMs || !endMs || endMs <= startMs) return 0;
    const grossMinutes = Math.floor((endMs - startMs) / (1000 * 60));
    return Math.max(0, grossMinutes - 60);
  }

  // ==========================================
  // キャッシュ・設定
  // ==========================================
  function loadLocalCache() {
    try {
      const recordData = localStorage.getItem(STORAGE_KEY);
      records = recordData ? JSON.parse(recordData) : [];
      if (!Array.isArray(records)) records = [];

      const staffData = localStorage.getItem(STORAGE_STAFF_KEY);
      if (staffData) {
        const parsedStaff = JSON.parse(staffData);
        if (Array.isArray(parsedStaff) && parsedStaff.length > 0) staffList = parsedStaff;
      }

      adminPin = localStorage.getItem(STORAGE_ADMIN_PIN_KEY) || DEFAULT_PIN;
      gasApiUrl = localStorage.getItem(STORAGE_GAS_URL_KEY) || DEFAULT_GAS_API_URL;
      gasSheetUrl = localStorage.getItem(STORAGE_SHEET_URL_KEY) || DEFAULT_GAS_SHEET_URL;

      if (dom.gasApiUrlInput) dom.gasApiUrlInput.value = gasApiUrl;
      if (dom.gasSheetUrlInput) dom.gasSheetUrlInput.value = gasSheetUrl;
      updateCloudStatusUI();
    } catch (e) {
      records = [];
      staffList = [...DEFAULT_STAFF];
      gasApiUrl = DEFAULT_GAS_API_URL;
      adminPin = DEFAULT_PIN;
    }
  }

  function saveLocalRecords() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (e) {} }
  function saveLocalStaffList() { try { localStorage.setItem(STORAGE_STAFF_KEY, JSON.stringify(staffList)); } catch (e) {} }
  function saveLocalAdminPin(pin) { try { adminPin = pin; localStorage.setItem(STORAGE_ADMIN_PIN_KEY, pin); } catch (e) {} }
  function saveGasConfig(url, sheetUrl) {
    try {
      gasApiUrl = (url || '').trim();
      gasSheetUrl = (sheetUrl || '').trim();
      localStorage.setItem(STORAGE_GAS_URL_KEY, gasApiUrl);
      localStorage.setItem(STORAGE_SHEET_URL_KEY, gasSheetUrl);
      updateCloudStatusUI();
    } catch (e) {}
  }
  function saveLastUserName(name) { try { if (name) localStorage.setItem(STORAGE_LAST_USER_KEY, name); } catch (e) {} }

  // ==========================================
  // Google Apps Script 通信
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
  }

  async function postToGas(payload) {
    if (!gasApiUrl) return false;
    try {
      updateCloudStatusUI('syncing');
      await fetch(gasApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      updateCloudStatusUI();
      return true;
    } catch (err) {
      console.warn('postToGas warning:', err);
      updateCloudStatusUI();
      return true;
    }
  }

  async function fetchInitialData(silent = false) {
    if (!gasApiUrl) return;
    if (!silent) updateCloudStatusUI('syncing');
    isSyncing = true;

    try {
      const url = `${gasApiUrl}?_t=${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data && data.status === 'success') {
        if (data.adminPin) {
          adminPin = String(data.adminPin).trim();
          saveLocalAdminPin(adminPin);
        }
        if (Array.isArray(data.staffList) && data.staffList.length > 0) {
          staffList = data.staffList.map(s => String(s).trim()).filter(Boolean);
          saveLocalStaffList();
        }

        updateStaffUI();
        updateStatusUI();
        updateSummary();
        renderGeneralRecords();
        renderAdminRecords();
        updateCloudStatusUI();
      }
    } catch (err) {
      console.warn('Fetch from GAS failed:', err);
      updateCloudStatusUI();
    } finally {
      isSyncing = false;
    }
  }

  async function syncRecordToGas(record, workTimeString = '') {
    const payload = {
      action: 'recordAttendance',
      name: record.userName,
      date: record.dateStr,
      time: record.timeStr,
      type: record.typeLabel,
      note: record.note || '',
      workHours: workTimeString || '',
      timestamp: String(record.timestamp)
    };
    await postToGas(payload);
  }

  // ==========================================
  // スタッフUI & 管理
  // ==========================================
  function updateStaffUI() {
    const validStaffNames = Array.from(new Set(staffList.map(s => String(s).trim()).filter(Boolean)));
    const lastSavedUser = localStorage.getItem(STORAGE_LAST_USER_KEY) || '';

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

    if (dom.addUserName) {
      dom.addUserName.innerHTML = validStaffNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    }
    if (dom.editUserName) {
      dom.editUserName.innerHTML = validStaffNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    }
    if (dom.filterUser) {
      dom.filterUser.innerHTML = '<option value="all">全員</option>' + validStaffNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    }
    if (dom.adminFilterUser) {
      dom.adminFilterUser.innerHTML = '<option value="all">全員</option>' + validStaffNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    }

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
          btn.addEventListener('click', () => removeStaff(btn.getAttribute('data-name')));
        });
      }
    }
  }

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
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>保存中...</span>';
    }

    const newStaffList = [...staffList, trimmed];
    staffList = newStaffList;
    saveLocalStaffList();
    updateStaffUI();
    if (dom.staffNameInput) dom.staffNameInput.value = '';

    await postToGas({
      action: 'updateStaffList',
      staffList: newStaffList
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>追加する</span>';
    }

    showToast(`スタッフ「${trimmed}」を登録しました（☁ スプレッドシート同期済）`, 'success');
  }

  function removeStaff(name) {
    showConfirmModal('スタッフの削除', `スタッフ「${name}」を削除しますか？`, async () => {
      const newStaffList = staffList.filter(s => s !== name);
      staffList = newStaffList;
      saveLocalStaffList();
      updateStaffUI();

      await postToGas({
        action: 'updateStaffList',
        staffList: newStaffList
      });

      showToast(`スタッフ「${name}」を削除しました（☁ スプレッドシート同期済）`, 'info');
    });
  }

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
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>保存中...</span>';
    }

    adminPin = newPin;
    saveLocalAdminPin(newPin);

    await postToGas({
      action: 'updatePin',
      newPin: newPin
    });

    dom.currentPinInput.value = '';
    dom.newPinInput.value = '';
    dom.confirmPinInput.value = '';

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>PINコードを変更する</span>';
    }

    showToast('管理者PINコードを変更しました（☁ スプレッドシート「システム設定」に保存済）', 'success');
  }

  // ==========================================
  // 時計・打刻・状態管理
  // ==========================================
  function updateClock() {
    const now = new Date();
    dom.currentDate.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    dom.currentDay.textContent = DAYS_JA[now.getDay()];
    dom.digitalClock.textContent = formatTime(now, true);
    updateSummary();
  }

  function getCurrentStatus() {
    const todayStr = formatDate(new Date());
    const currentName = (dom.userName ? dom.userName.value : '').trim();
    const todayRecords = records
      .filter(r => r.dateStr === todayStr && (!currentName || r.userName === currentName))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (todayRecords.length === 0) return { status: 'none', label: '未出勤', dotClass: 'status-off' };
    const last = todayRecords[todayRecords.length - 1];
    if (last.type === 'clock_in') return { status: 'working', label: '勤務中', dotClass: 'status-working' };
    if (last.type === 'clock_out') return { status: 'left', label: '退勤済', dotClass: 'status-left' };
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

    if (current.status === 'none' || current.status === 'left') {
      dom.btnClockIn.classList.add('recommended');
      dom.btnClockOut.setAttribute('disabled', 'true');
    } else if (current.status === 'working') {
      dom.btnClockOut.classList.add('recommended');
      dom.btnClockIn.setAttribute('disabled', 'true');
    }
  }

  function updateSummary() {
    const todayStr = formatDate(new Date());
    const currentName = (dom.userName ? dom.userName.value : '').trim();
    const todayRecords = records
      .filter(r => r.dateStr === todayStr && (!currentName || r.userName === currentName))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (todayRecords.length === 0) {
      dom.summaryClockIn.textContent = '--:--';
      dom.summaryClockOut.textContent = '--:--';
      dom.summaryWorkTime.textContent = '0時間 0分';
      return;
    }

    const firstIn = todayRecords.find(r => r.type === 'clock_in');
    const lastOut = [...todayRecords].reverse().find(r => r.type === 'clock_out');

    dom.summaryClockIn.textContent = firstIn ? firstIn.timeStr.substring(0, 5) : '--:--';
    dom.summaryClockOut.textContent = lastOut ? lastOut.timeStr.substring(0, 5) : '--:--';

    if (firstIn) {
      const endMs = lastOut ? lastOut.timestamp : Date.now();
      const netMinutes = calculateNetWorkMinutes(firstIn.timestamp, endMs);
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
          workTimeMap[r.id] = { minutes: netMins, text: formatDurationMinutes(netMins) };
          delete userDayClockIns[key];
        } else {
          workTimeMap[r.id] = null;
        }
      }
    });
    return workTimeMap;
  }

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

    dom.punchNote.value = '';
    updateStatusUI();
    updateSummary();
    renderGeneralRecords();
    renderAdminRecords();

    const workTimeMap = computeRecordWorkTimes();
    const wt = workTimeMap[record.id];
    syncRecordToGas(record, wt ? wt.text : '');

    showToast(`【${userName}様】${config.toastMsg}（☁ スプレッドシート連携中）`, config.toastClass);
  }

  // ==========================================
  // ログ一覧描画
  // ==========================================
  function getFilteredRecords(userFilter, periodFilter, typeFilter) {
    const now = new Date();
    const todayStr = formatDate(now);
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
    const currentMonthPrefix = `${now.getFullYear()}/${padZero(now.getMonth() + 1)}`;

    return records.filter(r => {
      if (userFilter !== 'all' && (r.userName || '') !== userFilter) return false;
      if (periodFilter === 'today' && r.dateStr !== todayStr) return false;
      if (periodFilter === 'week' && r.timestamp < sevenDaysAgo) return false;
      if (periodFilter === 'month' && !r.dateStr.startsWith(currentMonthPrefix)) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      return true;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }

  function renderGeneralRecords() {
    const userFilter = dom.filterUser ? dom.filterUser.value : 'all';
    const periodFilter = dom.filterPeriod ? dom.filterPeriod.value : 'today';
    const typeFilter = dom.filterType ? dom.filterType.value : 'all';

    const filtered = getFilteredRecords(userFilter, periodFilter, typeFilter);
    const workTimeMap = computeRecordWorkTimes();

    if (dom.recordsCountBadge) dom.recordsCountBadge.textContent = `${filtered.length}件`;
    if (filtered.length === 0) {
      if (dom.recordsTbody) dom.recordsTbody.innerHTML = '';
      if (dom.emptyState) dom.emptyState.classList.remove('hidden');
      return;
    }

    if (dom.emptyState) dom.emptyState.classList.add('hidden');

    const html = filtered.map(r => {
      const config = TYPE_CONFIG[r.type] || { label: r.typeLabel || r.type, icon: '', className: 'type-clock_in' };
      const wt = workTimeMap[r.id];
      const workTimeDisplay = wt ? `<span class="worktime-col">${wt.text}</span>` : `<span class="worktime-col empty">-</span>`;
      return `
        <tr>
          <td class="user-col">${escapeHtml(r.userName || '未設定')}</td>
          <td class="date-col">${r.dateStr}</td>
          <td class="time-col">${r.timeStr}</td>
          <td><span class="type-tag ${config.className}">${config.icon}${config.label}</span></td>
          <td class="note-col ${r.note ? 'has-note' : ''}">${escapeHtml(r.note || '-')}</td>
          <td>${workTimeDisplay}</td>
          <td class="timestamp-col">${r.timestamp}</td>
        </tr>
      `;
    }).join('');

    if (dom.recordsTbody) dom.recordsTbody.innerHTML = html;
  }

  function renderAdminRecords() {
    if (!dom.adminRecordsTbody) return;
    const userFilter = dom.adminFilterUser ? dom.adminFilterUser.value : 'all';
    const periodFilter = dom.adminFilterPeriod ? dom.adminFilterPeriod.value : 'all';
    const filtered = getFilteredRecords(userFilter, periodFilter, 'all');
    const workTimeMap = computeRecordWorkTimes();

    if (filtered.length === 0) {
      dom.adminRecordsTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">データがありません</td></tr>';
      return;
    }

    dom.adminRecordsTbody.innerHTML = filtered.map(r => {
      const config = TYPE_CONFIG[r.type] || { label: r.typeLabel || r.type, icon: '', className: 'type-clock_in' };
      const wt = workTimeMap[r.id];
      const workTimeDisplay = wt ? `<span class="worktime-col">${wt.text}</span>` : `<span class="worktime-col empty">-</span>`;
      return `
        <tr data-id="${r.id}">
          <td class="user-col">${escapeHtml(r.userName || '未設定')}</td>
          <td class="date-col">${r.dateStr}</td>
          <td class="time-col">${r.timeStr}</td>
          <td><span class="type-tag ${config.className}">${config.icon}${config.label}</span></td>
          <td class="note-col ${r.note ? 'has-note' : ''}">${escapeHtml(r.note || '-')}</td>
          <td>${workTimeDisplay}</td>
          <td class="timestamp-col">${r.timestamp}</td>
          <td>
            <div class="action-btn-group">
              <button class="btn-delete-row" data-id="${r.id}" title="削除">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    dom.adminRecordsTbody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        records = records.filter(r => r.id !== id);
        saveLocalRecords();
        renderGeneralRecords();
        renderAdminRecords();
        showToast('記録を削除しました', 'info');
      });
    });
  }

  // ==========================================
  // モーダル・トースト
  // ==========================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const toastClass = type.startsWith('toast-') ? type : `toast-${type}`;
    toast.className = `toast ${toastClass}`;
    toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 20);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
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

  function openAdminLogin() {
    dom.adminPinInput.value = '';
    dom.adminLoginError.classList.add('hidden');
    dom.adminLoginModal.classList.remove('hidden');
    fetchInitialData(true);
    setTimeout(() => dom.adminPinInput.focus(), 50);
  }

  function closeAdminLogin() { dom.adminLoginModal.classList.add('hidden'); }

  function handleAdminLogin() {
    const inputPin = dom.adminPinInput.value.trim();
    if (inputPin === adminPin) {
      dom.adminLoginModal.classList.add('hidden');
      openAdminPanel();
      showToast('管理者としてログインしました', 'info');
    } else {
      dom.adminLoginError.classList.remove('hidden');
    }
  }

  function openAdminPanel() {
    updateStaffUI();
    renderAdminRecords();
    if (dom.gasApiUrlInput) dom.gasApiUrlInput.value = gasApiUrl;
    dom.adminPanelModal.classList.remove('hidden');
    fetchInitialData(true);
  }

  function closeAdminPanel() {
    dom.adminPanelModal.classList.add('hidden');
    updateStaffUI();
    renderGeneralRecords();
  }

  // ==========================================
  // 初期化 & イベント登録
  // ==========================================
  function initEventListeners() {
    dom.btnClockIn.addEventListener('click', () => handlePunch('clock_in'));
    dom.btnClockOut.addEventListener('click', () => handlePunch('clock_out'));

    dom.userName.addEventListener('change', () => {
      saveLastUserName(dom.userName.value.trim());
      updateStatusUI();
      updateSummary();
    });

    if (dom.filterUser) dom.filterUser.addEventListener('change', renderGeneralRecords);
    if (dom.filterPeriod) dom.filterPeriod.addEventListener('change', renderGeneralRecords);
    if (dom.filterType) dom.filterType.addEventListener('change', renderGeneralRecords);

    dom.btnOpenAdminLogin.addEventListener('click', openAdminLogin);
    dom.adminLoginCancelBtn.addEventListener('click', closeAdminLogin);
    dom.adminLoginSubmitBtn.addEventListener('click', handleAdminLogin);
    dom.adminPinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdminLogin(); });

    dom.adminPanelCloseBtn.addEventListener('click', closeAdminPanel);
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

    dom.btnAddStaff.addEventListener('click', () => addStaff(dom.staffNameInput.value));
    dom.staffNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addStaff(dom.staffNameInput.value); });
    dom.btnChangePin.addEventListener('click', handlePinChange);

    dom.btnSaveGas.addEventListener('click', () => {
      saveGasConfig(dom.gasApiUrlInput.value, dom.gasSheetUrlInput.value);
      showToast('設定を保存しました', 'success');
      fetchInitialData(false);
    });

    dom.modalCancelBtn.addEventListener('click', hideConfirmModal);
    dom.modalConfirmBtn.addEventListener('click', () => {
      if (typeof pendingModalAction === 'function') pendingModalAction();
      hideConfirmModal();
    });
  }

  function init() {
    loadLocalCache();
    initEventListeners();
    updateStaffUI();
    updateClock();
    setInterval(updateClock, 1000);
    updateStatusUI();
    updateSummary();
    renderGeneralRecords();

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
