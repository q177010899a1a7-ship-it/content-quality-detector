// Popup Script - 触发后台分析，不依赖窗口焦点
document.addEventListener('DOMContentLoaded', async function() {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const logsBtn = document.getElementById('logsBtn');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const status = document.getElementById('status');

  // 设置相关元素
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKey = document.getElementById('saveApiKey');
  const sensitivitySelect = document.getElementById('sensitivitySelect');
  const maxPairsInput = document.getElementById('maxPairsInput');
  const streamingToggle = document.getElementById('streamingToggle');
  const alwaysOnTopToggle = document.getElementById('alwaysOnTopToggle');

  // 加载设置
  async function loadSettings() {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    apiKeyInput.value = settings.apiKey || '';
    sensitivitySelect.value = settings.sensitivity || 'medium';
    maxPairsInput.value = settings.maxPairs || 6;
    if (settings.streaming === false) {
      streamingToggle.classList.remove('active');
    } else {
      streamingToggle.classList.add('active');
    }
    if (settings.alwaysOnTop) {
      alwaysOnTopToggle.classList.add('active');
    } else {
      alwaysOnTopToggle.classList.remove('active');
    }
  }

  // 保存设置
  async function saveSettings() {
    const settings = {
      apiKey: apiKeyInput.value.trim(),
      sensitivity: sensitivitySelect.value,
      maxPairs: parseInt(maxPairsInput.value) || 6,
      streaming: streamingToggle.classList.contains('active'),
      alwaysOnTop: alwaysOnTopToggle.classList.contains('active')
    };
    await chrome.storage.local.set({ settings });
    showStatus('设置已保存', 'success');
  }

  // 读取之前的状态
  const savedData = await chrome.storage.local.get(['analysisResult', 'sentences', 'url', 'timestamp', 'isAnalyzing']);
  if (savedData.analysisResult && savedData.timestamp) {
    const result = savedData.analysisResult;
    const duplicates = result?.duplicates || [];
    if (duplicates.length > 0) {
      status.textContent = '已完成 ' + duplicates.length + '对重复';
    } else {
      status.textContent = '已完成，未发现重复';
    }
  }

  // 检查是否正在分析中
  if (savedData.isAnalyzing) {
    analyzeBtn.disabled = true;
    showStatus('分析中...', 'loading');
  }

  function showStatus(message, type) {
    if (type === 'loading') {
      status.innerHTML = '<span class="spinner"></span> ' + message;
      status.className = 'status loading';
    } else if (type === 'success') {
      status.textContent = message;
      status.className = 'status success';
    } else if (type === 'error') {
      status.textContent = message;
      status.className = 'status error';
    } else {
      status.textContent = message;
      status.className = 'status';
    }
  }

  // 监听检测进度（区分检测和摘要）
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'detectProgress' || request.action === 'analysisProgress') {
      if (request.status === 'loading') {
        showStatus(request.message, 'loading');
      } else if (request.status === 'success') {
        showStatus(request.message, 'success');
        analyzeBtn.disabled = false;
        chrome.storage.local.set({ isAnalyzing: false });
      } else if (request.status === 'error') {
        showStatus(request.message, 'error');
        analyzeBtn.disabled = false;
        chrome.storage.local.set({ isAnalyzing: false });
      }
    }

    if (request.action === 'summaryProgress') {
      if (request.status === 'loading') {
        showStatus(request.message, 'loading');
      } else if (request.status === 'success') {
        showStatus(request.message, 'success');
        summarizeBtn.disabled = false;
        chrome.storage.local.set({ isSummarizing: false });
      } else if (request.status === 'error') {
        showStatus(request.message, 'error');
        summarizeBtn.disabled = false;
        chrome.storage.local.set({ isSummarizing: false });
      }
    }

    sendResponse({ received: true });
    return true;
  });

  // 设置面板展开/收起
  settingsToggle.addEventListener('click', function() {
    settingsToggle.classList.toggle('open');
    settingsPanel.classList.toggle('open');
  });

  // 保存设置
  saveApiKey.addEventListener('click', saveSettings);
  sensitivitySelect.addEventListener('change', saveSettings);
  maxPairsInput.addEventListener('change', saveSettings);
  streamingToggle.addEventListener('click', function() {
    streamingToggle.classList.toggle('active');
    saveSettings();
  });

  alwaysOnTopToggle.addEventListener('click', function() {
    alwaysOnTopToggle.classList.toggle('active');
    saveSettings();
  });

  // 初始化设置
  loadSettings();

  // 关闭已存在的popup窗口
  async function closeExistingPopups() {
    try {
      const windows = await chrome.windows.getAll({ windowTypes: ['popup'] });
      for (const win of windows) {
        if (win.id) await chrome.windows.remove(win.id);
      }
    } catch (e) {
      console.error('[Popup] 关闭窗口失败:', e);
    }
  }

  // 创建结果窗口
  let resultWindowId = null;
  async function openResultWindow(tabId) {
    try {
      const settings = await chrome.storage.local.get(['settings']);
      const win = await chrome.windows.create({
        url: chrome.runtime.getURL('panel.html?tabId=' + tabId),
        type: 'popup',
        width: 450,
        height: 700,
        left: 100,
        top: 100,
        focused: true,
        alwaysOnTop: settings.settings?.alwaysOnTop || false
      });
      resultWindowId = win.id;
      console.log('[Popup] 窗口创建成功, id:', win.id, 'tabId:', tabId);
    } catch (e) {
      console.error('[Popup] 窗口创建失败:', e);
    }
  }

  analyzeBtn.addEventListener('click', async function() {
    analyzeBtn.disabled = true;
    showStatus('准备中...', 'loading');
    await chrome.storage.local.set({ isAnalyzing: true });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('无法获取标签页');

      // 先打开结果窗口，传入 tabId 以便后续定位
      await openResultWindow(tab.id);

      // 再通知后台开始检测
      chrome.runtime.sendMessage({
        action: 'startAnalysis',
        tabId: tab.id,
        url: tab.url
      });

    } catch (error) {
      console.error('[Popup] 检测失败:', error);
      showStatus(error.message || '失败', 'error');
      analyzeBtn.disabled = false;
      await chrome.storage.local.set({ isAnalyzing: false });
    }
  });

  clearBtn.addEventListener('click', async function() {
    await chrome.storage.local.clear();
    showStatus('已清除', 'success');
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status';
      analyzeBtn.disabled = false;
    }, 1500);
  });

  logsBtn.addEventListener('click', async function() {
    // 关闭已存在的窗口
    await closeExistingPopups();

    const settings = await chrome.storage.local.get(['settings']);
    const alwaysOnTop = settings.settings?.alwaysOnTop || false;
    try {
      await chrome.windows.create({
        url: chrome.runtime.getURL('logs.html'),
        type: 'popup',
        width: 600,
        height: 700,
        left: 150,
        top: 150,
        focused: true,
        alwaysOnTop: alwaysOnTop
      });
      console.log('[Popup] 日志窗口创建成功');
    } catch (e) {
      console.error('[Popup] 日志窗口创建失败:', e);
    }
  });

  // 智能摘要按钮
  summarizeBtn.addEventListener('click', async function() {
    summarizeBtn.disabled = true;
    showStatus('准备启动...', 'loading');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('无法获取标签页');

      // 关闭已存在的窗口
      await closeExistingPopups();

      // 通知后台开始摘要
      chrome.runtime.sendMessage({
        action: 'startSummary',
        tabId: tab.id,
        url: tab.url
      });

      // 打开结果窗口，传入 tabId 以便后续定位
      await openResultWindow(tab.id);
      showStatus('后台处理中...', 'loading');

    } catch (error) {
      console.error('[Popup] 摘要失败:', error);
      showStatus(error.message || '摘要失败', 'error');
      summarizeBtn.disabled = false;
    }
  });
});
