// Background Script - 预检测+API混合检测
// 发送进度到popup/panel

function sendProgress(status, message) {
  chrome.runtime.sendMessage({
    action: 'analysisProgress',
    status: status,
    message: message
  }).catch(() => {});
}

function sendDetectProgress(status, message) {
  chrome.runtime.sendMessage({
    action: 'detectProgress',
    status: status,
    message: message
  }).catch(() => {});
}

// 获取设置
async function getSettings() {
  const data = await chrome.storage.local.get(['settings']);
  return data.settings || {
    apiKey: '',
    sensitivity: 'medium',
    maxPairs: 6,
    streaming: true
  };
}

// ==========================================
// 检测功能 - 本地快速算法（极速模式）
// ==========================================

// 关键词类型定义
const CORE_FACTORS = {
  // 日期相关
  datePattern: /\d{4}[年./-]\d{1,2}[月./-]\d{1,2}[日]?|\d{4}年|\d+月\d+日|\d{1,2}世纪|\d{4}[./-]\d{2}/g,
  // 数字/百分比
  numberPattern: /\d+[岁人次名例年个%]|\d+\.\d+[%度]?|\d+万\d+千|\d+亿/g,
  // 引号内容（重要引用）
  quotePattern: /["""'『""「].{5,30}["""'』""」]/g,
  // 核心名词（人名、地名、组织名等）
  entityPattern: /[A-Z一-龥]{2,4}([··][A-Z一-龥]{1,4})*(氏|先生|女士|总统|总理|主席|市长|省长|局长|部长|董事)/g
};

// 提取关键词
function extractKeywords(text) {
  const keywords = new Set();

  // 提取日期
  const dates = text.match(CORE_FACTORS.datePattern);
  if (dates) dates.forEach(d => keywords.add(d));

  // 提取数字
  const numbers = text.match(CORE_FACTORS.numberPattern);
  if (numbers) numbers.forEach(n => keywords.add(n));

  // 提取长词（3字以上的中文词）
  const chineseWords = text.match(/[一-龥]{3,}/g);
  if (chineseWords) chineseWords.forEach(w => keywords.add(w));

  // 提取英文词
  const englishWords = text.match(/[a-zA-Z]{4,}/g);
  if (englishWords) englishWords.forEach(w => keywords.add(w.toLowerCase()));

  // 提取书名号内容
  const bookTitles = text.match(/《[^》]+》/g);
  if (bookTitles) bookTitles.forEach(b => keywords.add(b));

  return Array.from(keywords);
}

// 计算两个句子的语义相似度
function calculateSimilarity(s1, s2) {
  const kws1 = extractKeywords(s1.text);
  const kws2 = extractKeywords(s2.text);

  if (kws1.length === 0 || kws2.length === 0) return 0;

  // 计算交集
  const intersection = kws1.filter(k => kws2.includes(k));

  // Jaccard相似度
  const union = new Set([...kws1, ...kws2]);
  const jaccard = intersection.length / union.size;

  // 加权分数
  let score = 0;

  // ============================================
  // 核心要素组合检测（避免误报）
  // ============================================
  // 规则：必须满足多个核心要素同时相同，才算真正重复
  // 例如：剧情简介提到"扎克"+"骨肉瘤"+"《云》"，音乐原声只提"扎克"+"《云》"
  //       → 这不算重复，因为缺少"骨肉瘤"这个关键要素

  let coreFactorScore = 0;
  let matchedFactors = [];

  // 1. 日期完全匹配（最重要）
  const dateMatch = kws1.some(k => CORE_FACTORS.datePattern.test(k) && kws2.includes(k));
  if (dateMatch) {
    coreFactorScore += 0.3;
    matchedFactors.push('日期');
  }

  // 2. 数字/百分比匹配
  const numMatch = kws1.filter(k => CORE_FACTORS.numberPattern.test(k) && kws2.includes(k));
  coreFactorScore += Math.min(numMatch.length * 0.08, 0.24);
  if (numMatch.length > 0) matchedFactors.push('数字');

  // 3. 书名/作品名匹配
  const bookMatch = kws1.filter(k => k.includes('《') && kws2.includes(k));
  if (bookMatch.length > 0) {
    coreFactorScore += 0.2;
    matchedFactors.push('作品名');
  }

  // 4. 核心词匹配（4字以上中文词）
  const coreMatch = kws1.filter(k => k.length >= 4 && kws2.includes(k));
  coreFactorScore += Math.min(coreMatch.length * 0.06, 0.18);
  if (coreMatch.length > 0) matchedFactors.push('核心词');

  // 5. 字符级相似度（辅助判断）
  const charSim = calculateCharSimilarity(s1.text, s2.text);
  coreFactorScore += charSim * 0.25;

  // 综合评分：核心要素占70%，字符相似度占30%
  // 但必须至少有2个核心要素匹配才能算重复
  const factorBonus = matchedFactors.length >= 2 ? coreFactorScore * 1.2 : coreFactorScore * 0.6;
  score = factorBonus;

  // 防止极短句子误判
  if (s1.text.length < 10 || s2.text.length < 10) {
    score *= 0.5;
  }

  return Math.min(score, 1);
}

// 字符级相似度（用于辅助判断）
function calculateCharSimilarity(t1, t2) {
  // 移除标点后比较
  const clean1 = t1.replace(/[，。！？、；：""''《》（）\[\]【】]/g, '');
  const clean2 = t2.replace(/[，。！？、；：""''《》（）\[\]【】]/g, '');

  if (clean1 === clean2) return 1;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return 0.85;

  // 公共子串比例
  const common = longestCommonSubstring(clean1, clean2);
  const maxLen = Math.max(clean1.length, clean2.length);
  return common.length / maxLen;
}

// 最长公共子串
function longestCommonSubstring(s1, s2) {
  const m = s1.length, n = s2.length;
  let maxLen = 0, endIndex = 0;

  // 优化：只检查短串与长串
  let short = s1, long = s2;
  if (m > n) { short = s2; long = s1; }

  const dp = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (short[i - 1] === long[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > maxLen) {
          maxLen = dp[j];
          endIndex = i;
        }
      } else {
        dp[j] = 0;
      }
      prev = temp;
    }
  }

  return short.substring(endIndex - maxLen, endIndex);
}

// 本地预检测（快速筛选候选对）
async function localPreDetect(sentences, sensitivity) {
  const startTime = performance.now();
  const candidates = [];
  const n = sentences.length;

  // 预检测阈值较低，保证不漏掉
  const preThreshold = sensitivity === 'high' ? 0.35 : sensitivity === 'low' ? 0.50 : 0.40;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = calculateSimilarity(sentences[i], sentences[j]);
      if (sim >= preThreshold) {
        candidates.push({ idx1: i, idx2: j, sim });
      }
    }
    if (i % 10 === 0) {
      sendDetectProgress('loading', `预检测 ${Math.round((i/n)*100)}%`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  console.log(`[LocalPre] ${n}句预检测耗时${performance.now() - startTime}ms，候选${candidates.length}对`);
  return candidates;
}

// API全量检测
async function apiFullDetect(sentences, settings) {
  const sentencesText = sentences.map((s, i) =>
    `[${i + 1}] ${s.pos}: ${s.text.substring(0, 120)}`
  ).join('\n');

  const sensitivityGuide = {
    high: '严格：只要有重复迹象就报告',
    medium: '适中：明确语义重复才报告',
    low: '宽松：只有高度相似才报告'
  };

  const prompt = `你是一个内容质量检测专家。请分析以下文本，找出语义重复的句子对。

判断标准（${sensitivityGuide[settings.sensitivity]}）：
- 相同人物、事件、地点的多次描述
- 同一内容的不同表述
- 简历中的重复自我介绍
- 必须多个核心要素（日期、地点、人物、数字）同时相同才算重复

返回格式（只返回JSON，不要其他内容）：
{
  "duplicates": [
    {"idx1": 1, "idx2": 2, "reason": "重复原因"}
  ]
}

文本（共${sentences.length}句）：
${sentencesText}`;

  const response = await fetch('https://api.minimaxi.com/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + settings.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: prompt }],
      stream: settings.streaming !== false
    })
  });

  if (!response.ok) throw new Error('API调用失败: ' + response.status);

  // 流式处理
  if (settings.streaming !== false) {
    return await parseStreamResponse(response, sentences, settings.maxPairs);
  } else {
    const text = await response.text();
    return parseFullResponse(text, sentences, settings.maxPairs);
  }
}

// 流式解析
async function parseStreamResponse(response, sentences, maxPairs) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            fullText += parsed.choices[0].delta.content;
            sendDetectProgress('loading', '分析中...');
          }
        } catch (e) {}
      }
    }
  }
  return parseFullResponse(fullText, sentences, maxPairs);
}

// 完整响应解析
function parseFullResponse(text, sentences, maxPairs) {
  console.log('[API] 响应:', text.substring(0, 500));
  try {
    const data = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    if (data.duplicates && Array.isArray(data.duplicates)) {
      return data.duplicates.slice(0, maxPairs).map(dup => {
        const s1 = sentences[dup.idx1 - 1];
        const s2 = sentences[dup.idx2 - 1];
        if (!s1 || !s2) return null;
        return {
          s1: s1.text,
          s2: s2.text,
          pos1: s1.pos,
          pos2: s2.pos,
          section1: s1.section,
          section2: s2.section,
          reason: dup.reason || '语义重复'
        };
      }).filter(Boolean);
    }
  } catch (e) {
    console.error('[API] 解析失败:', e);
  }
  return [];
}

// 生成重复原因说明
function generateReason(s1, s2, sim) {
  const kws1 = extractKeywords(s1.text);
  const kws2 = extractKeywords(s2.text);
  const common = kws1.filter(k => kws2.includes(k)).filter(k => k.length >= 3);

  if (common.length === 0) {
    return `字符相似度${(sim * 100).toFixed(0)}%`;
  }

  const topCommon = common.slice(0, 4).join('、');
  return `共同关键词：${topCommon}等`;
}

// ==========================================
// 主分析函数
// ==========================================

async function startAnalysis(tabId, url) {
  try {
    // 清除之前的状态
    await chrome.storage.local.remove(['summaryResult', 'summaryProgress', 'isSummarizing', 'analysisComplete']);

    console.log('[Background] 开始API检测，标签页:', tabId);

    sendDetectProgress('loading', '注入脚本...');
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    await new Promise(r => setTimeout(r, 300));

    // 测试连接
    try {
      const pingResp = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (pingResp !== 'pong') throw new Error('脚本响应异常');
    } catch (e) {
      throw new Error('脚本注入失败，请刷新页面后重试');
    }

    sendDetectProgress('loading', '提取内容...');
    const response = await chrome.tabs.sendMessage(tabId, { action: 'extractForDetection' });
    if (!response?.sentences) throw new Error('提取失败');
    if (response.error) throw new Error(response.error);

    const sentences = response.sentences;
    console.log('[Background] 提取' + sentences.length + '句');

    // 获取设置
    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new Error('未配置API Key，请在设置中输入');
    }

    // 使用API检测
    sendDetectProgress('loading', '正在分析语义重复...');
    const duplicates = await apiFullDetect(sentences, settings);
    console.log('[Background] API检测到' + duplicates.length + '对重复');

    // 保存结果
    await chrome.storage.local.set({
      analysisResult: {
        duplicates: duplicates,
        totalTime: Date.now()
      },
      sentences: sentences,
      url: url,
      timestamp: Date.now(),
      isAnalyzing: false,
      analysisComplete: true  // 明确标记完成
    });
    console.log('[Background] 结果已保存，duplicates:', duplicates.length);
    const logEntry = {
      timestamp: Date.now(),
      url: url,
      sentenceCount: sentences.length,
      duplicateCount: duplicates.length,
      duplicates: duplicates,
      sampleSentences: sentences.slice(0, 10).map(s => ({
        text: s.text.substring(0, 150),
        pos: s.pos,
        section: s.section
      }))
    };

    const existingLogs = await chrome.storage.local.get(['analysisLogs']);
    const logs = existingLogs.analysisLogs || [];
    logs.unshift(logEntry);
    if (logs.length > 50) logs.length = 50;
    await chrome.storage.local.set({ analysisLogs: logs });

    sendProgress('success', '完成 ' + duplicates.length + '对重复');

  } catch (error) {
    console.error('[Background] 检测失败:', error);
    await chrome.storage.local.set({ isAnalyzing: false });
    sendProgress('error', error.message || '检测失败');
  }
}

// ==========================================
// 智能摘要功能（仍需API Key）
// ==========================================

async function startSummary(tabId, url) {
  // 清除检测状态
  await chrome.storage.local.remove(['analysisResult', 'sentences', 'url', 'timestamp', 'isAnalyzing']);

  function sendSummaryProgress(status, message) {
    chrome.runtime.sendMessage({
      action: 'summaryProgress',
      status: status,
      message: message
    }).catch(() => {});
  }

  function updateProgress(stage, detail) {
    chrome.storage.local.set({
      summaryProgress: { stage, detail, timestamp: Date.now() }
    });
    sendSummaryProgress('loading', stage + ': ' + detail);
    console.log('[Summary] ' + stage + ': ' + detail);
  }

  try {
    updateProgress('初始化', '正在注入内容脚本...');

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    await new Promise(r => setTimeout(r, 300));

    updateProgress('内容提取', '正在提取页面内容...');

    const response = await chrome.tabs.sendMessage(tabId, { action: 'extractForSummary' });
    if (!response?.content) {
      throw new Error('内容提取失败: ' + (response?.error || '未知错误'));
    }

    const content = response.content;
    console.log('[Summary] 提取到内容长度:', content.length, '字符');

    if (content.length < 50) {
      throw new Error('提取内容太少，请确保页面有新闻正文');
    }

    // 获取API Key（从设置中读取）
    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new Error('未配置API Key，请在设置中输入');
    }

    updateProgress('API调用', '正在调用MiniMax API生成摘要...');

    const summary = await callMinimaxSummaryAPI(content, settings.apiKey);

    updateProgress('保存结果', '正在保存摘要...');
    await chrome.storage.local.set({
      summaryResult: {
        content: summary,
        sourceUrl: url,
        timestamp: Date.now(),
        sourceLength: content.length
      },
      isSummarizing: false
    });

    chrome.storage.local.remove(['summaryProgress']);
    sendSummaryProgress('success', '摘要完成 ' + summary.length + '字符');

  } catch (error) {
    console.error('[Summary] 失败:', error);
    chrome.storage.local.remove(['summaryProgress']);
    chrome.storage.local.set({ isSummarizing: false });
    sendSummaryProgress('error', '摘要失败: ' + error.message);
  }
}

async function callMinimaxSummaryAPI(content, apiKey) {
  const prompt = `用第三人称客观描述，按时间顺序整理以下新闻内容，格式为"时间，事件"：

${content}`;

  const response = await fetch('https://api.minimaxi.com/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  console.log('[Summary] API响应状态:', response.status);
  const text = await response.text();
  console.log('[Summary] API响应内容:', text.substring(0, 500));

  if (!response.ok) throw new Error('API调用失败: ' + response.status);

  try {
    const data = JSON.parse(text);
    if (data.base_resp && data.base_resp.status_code !== 0) {
      throw new Error('API错误: ' + (data.base_resp.status_msg || '未知错误'));
    }
    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }
    throw new Error('API返回格式异常');
  } catch (e) {
    if (e.message.includes('API错误') || e.message.includes('API返回')) throw e;
    throw new Error('JSON解析失败: ' + e.message);
  }
}

// ==========================================
// 消息监听
// ==========================================

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'startAnalysis') {
    startAnalysis(request.tabId, request.url);
    sendResponse({ started: true });
    return true;
  }

  if (request.action === 'clearCache') {
    chrome.storage.local.remove(['analysisLogs']);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'startSummary') {
    startSummary(request.tabId, request.url);
    sendResponse({ started: true });
    return true;
  }

  if (request.action === 'locateSentence') {
    (async () => {
      try {
        var targetTabId = request.tabId;
        if (!targetTabId) {
          var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length > 0) {
            targetTabId = tabs[0].id;
          }
        }
        if (targetTabId) {
          var text = request.text;
          chrome.tabs.sendMessage(targetTabId, {
            action: 'scrollToText',
            text: text
          });
        }
      } catch (e) {
        console.error('[Background] locateSentence失败:', e);
      }
    })();
    sendResponse({ started: true });
    return true;
  }

  return true;
});
