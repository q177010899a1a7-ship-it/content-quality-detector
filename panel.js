// Panel Script - 显示检测结果
var pollInterval = null;

// 从 URL 获取源标签页 ID
var sourceTabId = null;
(function() {
  var params = new URLSearchParams(window.location.search);
  sourceTabId = params.get('tabId') ? parseInt(params.get('tabId')) : null;
  console.log('[Panel] 源标签页 ID:', sourceTabId);
})();

document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('closeBtn');
  var pinBtn = document.getElementById('pinBtn');
  var resultsContainer = document.getElementById('resultsContainer');
  var urlBar = document.getElementById('urlBar');
  var timeCost = document.getElementById('timeCost');
  var totalSentences = document.getElementById('totalSentences');
  var totalDups = document.getElementById('totalDups');

  closeBtn.addEventListener('click', function() { window.close(); });

  pinBtn.addEventListener('click', async function() {
    pinBtn.classList.toggle('active');
    try {
      const winInfo = await chrome.windows.getCurrent();
      if (winInfo?.id) {
        await chrome.windows.update(winInfo.id, { alwaysOnTop: pinBtn.classList.contains('active') });
      }
    } catch (e) {
      console.error('[Panel] 置顶失败:', e);
    }
  });

  // 轮询
  pollInterval = setInterval(loadResults, 300);

  // 监听 storage 变化
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.analysisResult || changes.summaryResult || changes.analysisComplete || changes.timestamp) {
      loadResults();
    }
  });

  // 立即加载
  loadResults();

  // 事件委托：定位按钮
  resultsContainer.addEventListener('click', function(e) {
    var btn = e.target.closest('.locate-btn');
    if (btn) {
      var text = btn.getAttribute('data-text');
      if (text && sourceTabId) {
        chrome.runtime.sendMessage({ action: 'locateSentence', text: text, tabId: sourceTabId });
      } else if (!sourceTabId) {
        console.log('[Panel] 没有源标签页 ID，无法定位');
      }
    }
  });

  function showSummaryResult(data) {
    urlBar.textContent = '📝 智能摘要';
    totalSentences.textContent = Math.round((data.sourceLength || 0) / 100) + '段';
    totalDups.textContent = '-';
    timeCost.textContent = new Date(data.timestamp).toLocaleTimeString('zh-CN');

    resultsContainer.innerHTML = `
      <div class="summary-container">
        <div class="summary-meta">来源: ${escapeHtml(data.sourceUrl || '未知')}</div>
        <div class="summary-content" style="user-select:text;">${escapeHtml(data.content || '')}</div>
        <button class="copy-btn" id="copyBtn">📋 复制摘要</button>
      </div>
    `;

    document.getElementById('copyBtn')?.addEventListener('click', function() {
      navigator.clipboard.writeText(data.content).then(() => {
        this.textContent = '✓ 已复制';
        this.classList.add('copied');
        setTimeout(() => {
          this.textContent = '📋 复制摘要';
          this.classList.remove('copied');
        }, 2000);
      });
    });
  }

  function loadResults() {
    chrome.storage.local.get(['analysisResult', 'sentences', 'url', 'timestamp', 'summaryResult', 'isAnalyzing', 'isSummarizing', 'analysisComplete'], function(data) {
      // 摘要优先
      if (data.summaryResult) {
        showSummaryResult(data.summaryResult);
        return;
      }

      // 检测结果
      if (data.analysisResult && data.sentences && (data.analysisComplete || data.timestamp)) {
        showAnalysisResult(data.analysisResult, data.sentences, data.url);
        return;
      }

      // 进行中
      if (data.isSummarizing) {
        urlBar.textContent = '📝 智能摘要';
        resultsContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div><div class="text">摘要生成中...</div></div>';
        return;
      }

      if (data.isAnalyzing) {
        urlBar.textContent = '🔍 内容检测';
        resultsContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div><div class="text">检测中...</div></div>';
        return;
      }

      // 无结果
      resultsContainer.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div class="title">暂无检测结果</div><div class="desc">点击插件按钮开始检测</div></div>';
    });
  }

  function showAnalysisResult(result, sentences, url) {
    urlBar.textContent = url || '🔍 内容检测';
    totalSentences.textContent = (sentences?.length || 0);
    var duplicates = result.duplicates || [];
    totalDups.textContent = duplicates.length;

    if (duplicates.length === 0) {
      resultsContainer.innerHTML = '<div class="empty-state"><div class="icon">✨</div><div class="title">未发现重复</div><div class="desc">内容没有语义重复</div></div>';
      return;
    }

    var html = '';
    duplicates.forEach(function(dup, idx) {
      var common = getCommonText(dup.s1 || '', dup.s2 || '');
      html += '<div class="dup-group">';

      // 头部
      html += '<div class="dup-header">';
      html += '<div class="dup-icon">⚠️</div>';
      html += '<div class="dup-label">语义重复 #' + (idx + 1) + '</div>';
      html += '<div class="dup-count">' + escapeHtml(dup.reason || '重复内容') + '</div>';
      html += '</div>';

      // 公共内容
      if (common) {
        html += '<div class="dup-common">';
        html += '<div class="dup-common-label">🔁 共同重复内容</div>';
        html += '<div class="dup-common-text" style="user-select:text;">' + escapeHtml(common) + '</div>';
        html += '</div>';
      }

      // 句子1
      html += '<div class="sentence-card">';
      html += '<div class="sentence-meta">';
      if (dup.section1) html += '<span class="tag section-tag">' + escapeHtml(dup.section1) + '</span>';
      html += '<span class="tag pos-tag">' + escapeHtml(dup.pos1 || '') + '</span>';
      html += '<span class="tag status-tag delete">建议删除</span>';
      html += '<button class="locate-btn" data-index="' + idx + '" data-sentence="1" data-text="' + escapeHtml(dup.s1 || '').replace(/"/g, '&quot;') + '">🔍</button>';
      html += '</div>';
      html += '<div class="sentence-text" style="user-select:text;">' + highlightCommon(dup.s1 || '', dup.s2 || '') + '</div>';
      html += '</div>';

      // 句子2
      html += '<div class="sentence-card">';
      html += '<div class="sentence-meta">';
      if (dup.section2) html += '<span class="tag section-tag">' + escapeHtml(dup.section2) + '</span>';
      html += '<span class="tag pos-tag">' + escapeHtml(dup.pos2 || '') + '</span>';
      html += '<span class="tag status-tag keep">建议保留</span>';
      html += '<button class="locate-btn" data-index="' + idx + '" data-sentence="2" data-text="' + escapeHtml(dup.s2 || '').replace(/"/g, '&quot;') + '">🔍</button>';
      html += '</div>';
      html += '<div class="sentence-text" style="user-select:text;">' + highlightCommon(dup.s2 || '', dup.s1 || '') + '</div>';
      html += '</div>';

      html += '</div>';
    });

    resultsContainer.innerHTML = html;
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getCommonText(t1, t2) {
    var clean1 = t1.replace(/[，。！？、；：""''《》（）\[\]【】]/g, '');
    var clean2 = t2.replace(/[，。！？、；：""''《》（）\[\]【】]/g, '');
    var matches = findCommonSubstrings(clean1, clean2);
    if (matches.length > 0) {
      matches.sort(function(a, b) { return b.length - a.length; });
      return matches[0];
    }
    return '';
  }

  // 提取关键词用于核心要素检测
  function extractKeywords(text) {
    var keywords = [];
    // 提取日期
    var datePattern = /\d{4}年\d{1,2}月\d{1,2}日|\d{4}年\d{1,2}月|\d{4}年/g;
    var dates = text.match(datePattern);
    if (dates) keywords = keywords.concat(dates);
    // 提取数字/百分比
    var numPattern = /\d+\.?\d*%|[一-龥]+\d+[一-龥]*|\d+[一-龥]+/g;
    var nums = text.match(numPattern);
    if (nums) keywords = keywords.concat(nums);
    // 提取书名号内容
    var bookTitles = text.match(/《[^》]+》/g);
    if (bookTitles) keywords = keywords.concat(bookTitles);
    // 提取核心词（4字以上中文词）
    var chineseWords = text.match(/[一-龥]{4,}/g);
    if (chineseWords) keywords = keywords.concat(chineseWords);
    return keywords;
  }

  // 检测核心要素匹配数量
  function countCoreMatches(text1, text2) {
    var kws1 = extractKeywords(text1);
    var kws2 = extractKeywords(text2);
    var matchCount = 0;
    var matchedTypes = [];
    // 日期匹配
    var hasDateMatch = kws1.some(function(k) {
      return (/\d{4}年\d{1,2}月\d{1,2}日|\d{4}年\d{1,2}月|\d{4}年/.test(k)) && kws2.indexOf(k) !== -1;
    });
    if (hasDateMatch) { matchCount++; matchedTypes.push('日期'); }
    // 书名匹配
    var hasBookMatch = kws1.some(function(k) { return k.indexOf('《') !== -1 && kws2.indexOf(k) !== -1; });
    if (hasBookMatch) { matchCount++; matchedTypes.push('作品名'); }
    // 核心词匹配（4字以上中文词）
    var coreWords1 = kws1.filter(function(k) { return k.length >= 4 && !/《/.test(k) && !/^\d/.test(k) && !/%$/.test(k); });
    var coreWords2 = kws2.filter(function(k) { return k.length >= 4 && !/《/.test(k) && !/^\d/.test(k) && !/%$/.test(k); });
    var coreMatchCount = coreWords1.filter(function(k) { return coreWords2.indexOf(k) !== -1; }).length;
    if (coreMatchCount >= 2) { matchCount++; matchedTypes.push('核心词'); }
    return { count: matchCount, types: matchedTypes };
  }

  function findCommonSubstrings(s1, s2) {
    var matches = [];
    var maxLen = Math.min(s1.length, s2.length);
    for (var len = Math.min(20, maxLen); len >= 6; len--) {
      for (var i = 0; i <= s1.length - len; i++) {
        var sub = s1.substring(i, i + len);
        if (s2.indexOf(sub) !== -1 && matches.indexOf(sub) === -1) {
          matches.push(sub);
        }
      }
      if (matches.length > 0) break;
    }
    return matches;
  }

  function highlightCommon(text, compareText) {
    var escaped = escapeHtml(text);

    // 检测核心要素匹配数量
    var coreResult = countCoreMatches(text, compareText);

    // 只有当核心要素匹配 >= 2 时才高亮
    if (coreResult.count >= 2) {
      var matches = findCommonSubstrings(text.replace(/[，。！？、；：""''《》（）\[\]【】]/g, ''), compareText.replace(/[，。！？、；：""''《》（）\[\]【】]/g, ''));
      matches.sort(function(a, b) { return b.length - a.length; });
      matches.slice(0, 3).forEach(function(m) {
        if (m.length >= 6) {
          var esc = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          escaped = escaped.replace(new RegExp(esc, 'g'), '<mark>' + escapeHtml(m) + '</mark>');
        }
      });
    }
    return escaped;
  }

  // 全局定位函数 - 定位到原网页中的句子
  window.locateSentence = function(btn) {
    var text = btn.getAttribute('data-text');
    if (!text) {
      var sentenceCard = btn.closest('.sentence-card');
      if (sentenceCard) {
        var markText = sentenceCard.querySelector('.sentence-text');
        if (markText) {
          text = markText.textContent;
        }
      }
    }
    if (text) {
      // 发送消息给 background.js 进行定位
      chrome.runtime.sendMessage({
        action: 'locateSentence',
        text: text
      });
    }
  };
});