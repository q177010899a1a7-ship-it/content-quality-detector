// Logs Script - 查看和导出检测日志
document.addEventListener('DOMContentLoaded', function() {
  const logsContainer = document.getElementById('logsContainer');
  const totalCount = document.getElementById('totalCount');
  const currentPageCount = document.getElementById('currentPageCount');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportModal = document.getElementById('exportModal');
  const exportText = document.getElementById('exportText');
  const copyBtn = document.getElementById('copyBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const pinBtn = document.getElementById('pinBtn');

  // 置顶按钮逻辑
  if (pinBtn) {
    pinBtn.addEventListener('click', async function() {
      pinBtn.classList.toggle('active');
      const isPinned = pinBtn.classList.contains('active');
      console.log('[Logs] 置顶状态:', isPinned);
      try {
        const winInfo = await chrome.windows.getCurrent();
        console.log('[Logs] 当前窗口:', winInfo);
        if (winInfo && winInfo.id) {
          await chrome.windows.update(winInfo.id, { alwaysOnTop: isPinned });
          console.log('[Logs] 置顶设置成功:', isPinned);
        } else {
          console.error('[Logs] 无法获取窗口ID');
        }
      } catch (e) {
        console.error('[Logs] 置顶失败:', e.message || e);
      }
    });
  }

  // 加载日志
  function loadLogs() {
    chrome.storage.local.get(['analysisLogs'], function(data) {
      const logs = data.analysisLogs || [];
      totalCount.textContent = logs.length;
      currentPageCount.textContent = logs.length;

      if (logs.length === 0) {
        logsContainer.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div>暂无检测日志</div><div style="margin-top:8px;font-size:12px;">开始检测后案例会自动保存</div></div>';
        return;
      }

      let html = '';
      logs.forEach(function(log, idx) {
        const date = new Date(log.timestamp);
        const dateStr = date.toLocaleString('zh-CN');
        const hasDups = log.duplicates && log.duplicates.length > 0;

        html += '<div class="log-group">';
        html += '<div class="log-header" onclick="toggleLog(' + idx + ')">';
        html += '<div>';
        html += '<div class="log-url">' + escapeHtml(log.url || '') + '</div>';
        html += '<div class="log-meta">';
        html += '<span>' + dateStr + '</span>';
        html += '<span>' + (log.sentenceCount || 0) + '句</span>';
        html += '<span style="color:' + (hasDups ? '#ff6b6b' : '#4caf50') + ';">' + (log.duplicateCount || 0) + '对重复</span>';
        html += '<span>' + (log.totalTime || 0) + 'ms</span>';
        html += '</div>';
        html += '</div>';
        html += '<span class="toggle-icon">' + (hasDups ? '▼' : '○') + '</span>';
        html += '</div>';

        html += '<div class="log-details" id="log-details-' + idx + '">';

        // 检测到的重复
        if (hasDups) {
          html += '<div class="section-title">✅ 检测到的重复:</div>';
          log.duplicates.forEach(function(dup) {
            html += '<div class="dup-item">';
            if (dup.reason) {
              html += '<div class="dup-reason">⚠️ ' + escapeHtml(dup.reason) + '</div>';
            }
            html += '<div class="dup-text">';
            html += '<div>句1';
            if (dup.section1) html += ' <span class="section-bracket">[' + escapeHtml(dup.section1) + ']</span>';
            html += ': ' + highlightCommon(dup.s1 || '', dup.s2 || '') + '</div>';
            html += '<div>句2';
            if (dup.section2) html += ' <span class="section-bracket">[' + escapeHtml(dup.section2) + ']</span>';
            html += ': ' + highlightCommon(dup.s2 || '', dup.s1 || '') + '</div>';
            html += '</div>';
            html += '</div>';
          });
        }

        // 样本句子（用于分析漏检）
        if (log.sampleSentences && log.sampleSentences.length > 0) {
          html += '<div class="section-title">📝 样本句子（用于分析漏检）:</div>';
          log.sampleSentences.forEach(function(s, i) {
            html += '<div class="sample-sentence">';
            html += '<div class="sample-pos">' + escapeHtml(s.pos || '') + ' [' + escapeHtml(s.section || '') + ']</div>';
            html += '<div class="sample-text">' + escapeHtml(s.text) + '</div>';
            html += '</div>';
          });
        }

        // 无重复提示
        if (!hasDups && log.sentenceCount > 0) {
          html += '<div class="no-dup-tip">✨ 未检测到重复。如果认为存在重复，请导出案例反馈给开发者。</div>';
        }

        html += '</div>';
      });

      logsContainer.innerHTML = html;
    });
  }

  // 切换日志详情显示
  window.toggleLog = function(idx) {
    const details = document.getElementById('log-details-' + idx);
    if (details) {
      details.classList.toggle('show');
    }
  };

  // 导出案例
  function exportLogs() {
    chrome.storage.local.get(['analysisLogs'], function(data) {
      const logs = data.analysisLogs || [];

      if (logs.length === 0) {
        alert('暂无案例可导出');
        return;
      }

      let text = '=== 内容质量检测案例日志 ===\n';
      text += '导出时间: ' + new Date().toLocaleString('zh-CN') + '\n';
      text += '案例总数: ' + logs.length + '\n';
      text += '\n';

      logs.forEach(function(log, idx) {
        text += '【案例 ' + (idx + 1) + '】\n';
        text += 'URL: ' + (log.url || '未知') + '\n';
        text += '时间: ' + new Date(log.timestamp).toLocaleString('zh-CN') + '\n';
        text += '句子数: ' + (log.sentenceCount || 0) + '\n';
        text += '检测到重复: ' + (log.duplicateCount || 0) + '对\n';
        text += '耗时: ' + (log.totalTime || 0) + 'ms\n';

        if (log.duplicates && log.duplicates.length > 0) {
          text += '\n重复句对:\n';
          log.duplicates.forEach(function(dup, i) {
            text += '\n--- 重复' + (i + 1) + ' ---\n';
            text += '位置1: ' + (dup.pos1 || '') + '\n';
            text += '句1: ' + (dup.s1 || '') + '\n';
            text += '位置2: ' + (dup.pos2 || '') + '\n';
            text += '句2: ' + (dup.s2 || '') + '\n';
            if (dup.reason) {
              text += '原因: ' + dup.reason + '\n';
            }
          });
        } else {
          text += '\n未检测到重复。\n';
        }

        if (log.sampleSentences && log.sampleSentences.length > 0) {
          text += '\n样本句子:\n';
          log.sampleSentences.forEach(function(s, i) {
            text += '[' + s.pos + '] ' + s.text + '\n';
          });
        }

        text += '\n' + '='.repeat(40) + '\n\n';
      });

      exportText.value = text;
      exportModal.classList.add('show');
    });
  }

  // 清除全部日志
  function clearLogs() {
    if (confirm('确定要清除所有检测日志吗？')) {
      chrome.storage.local.set({ analysisLogs: [] }, function() {
        loadLogs();
      });
    }
  }

  // 复制到剪贴板
  function copyToClipboard() {
    exportText.select();
    document.execCommand('copy');
    alert('已复制到剪贴板');
  }

  // 工具函数
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(text, maxLen) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  }

  // 高亮两个句子中相同的语义片段（较长匹配优先）
  function highlightCommon(text1, text2) {
    if (!text1 || !text2) return escapeHtml(text1);

    // 转义HTML
    text1 = escapeHtml(text1);

    // 方法：找出所有公共子串（长度>=10），按长度降序排列后逐个高亮
    var matches = findLongestCommonSubstrings(text1, text2);

    if (matches.length === 0) return text1;

    // 按长度降序排列，避免短匹配干扰长匹配
    matches.sort(function(a, b) { return b.length - a.length; });

    var result = text1;
    matches.forEach(function(match) {
      if (match.length >= 10) {  // 只高亮长度>=10的匹配
        // 转义正则特殊字符
        var escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp(escaped, 'g');
        result = result.replace(regex, '<mark>' + match + '</mark>');
      }
    });

    return result;
  }

  // 找出两个字符串的所有公共子串（长度>=10）
  function findLongestCommonSubstrings(str1, str2) {
    var matches = [];
    var len1 = str1.length;
    var len2 = str2.length;

    // 滑动窗口：从长度50开始，逐渐减小到10
    for (var windowLen = 50; windowLen >= 10; windowLen--) {
      for (var i = 0; i <= len1 - windowLen; i++) {
        var sub = str1.substring(i, i + windowLen);
        var idx = str2.indexOf(sub);
        if (idx !== -1) {
          // 找到匹配，检查是否已经被包含在更长的匹配中
          var isDuplicate = false;
          for (var j = 0; j < matches.length; j++) {
            if (matches[j].indexOf(sub) !== -1 || sub.indexOf(matches[j]) !== -1) {
              isDuplicate = true;
              break;
            }
          }
          if (!isDuplicate) {
            matches.push(sub);
          }
        }
      }
    }

    return matches;
  }

  // 事件绑定
  exportBtn.addEventListener('click', exportLogs);
  clearBtn.addEventListener('click', clearLogs);
  copyBtn.addEventListener('click', copyToClipboard);
  closeModalBtn.addEventListener('click', function() {
    exportModal.classList.remove('show');
  });

  // 初始化
  loadLogs();
});
