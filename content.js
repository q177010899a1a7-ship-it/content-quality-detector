// Content Script - 内容提取（用于 API 检测和摘要）
(function() {
  'use strict';

  function isNoiseText(text) {
    var t = text.trim();
    return /^(登录|注册|评论|点赞|收藏|分享|All Rights Reserved|Copyright|All Rights|沪ICP备)/.test(t);
  }

  // 提取正文（用于重复检测）- 返回句子数组，最多20句
  function extractForDetection() {
    const 正文Selectors = [
      '.article-content', '.post-content', '.entry-content', '.post-body',
      '.article-body', '.content-body', 'article', '[role="article"]', '.story-body'
    ];

    let mainElement = null;

    // 查找正文区域
    const allElements = document.body.querySelectorAll('*');
    for (const el of allElements) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const text = el.textContent || '';
      if (text.includes('正文') && text.length < 100) {
        let sibling = el.nextElementSibling;
        while (sibling) {
          if (['ARTICLE', 'SECTION', 'DIV', 'MAIN'].includes(sibling.tagName.toUpperCase())) {
            mainElement = sibling;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
        if (mainElement) break;
      }
    }

    // 选择器查找
    if (!mainElement) {
      for (const sel of 正文Selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 500) {
          mainElement = el;
          break;
        }
      }
    }
    if (!mainElement) mainElement = document.body;

    // 提取段落
    const paragraphs = mainElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    const sentences = [];
    let currentSection = '正文';
    let sentenceIndex = 0;

    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (/^H[1-6]$/.test(p.tagName) && text.length < 50) {
        currentSection = text.substring(0, 20);
        sentenceIndex = 0;
      } else if (text.length > 20 && !isNoiseText(text)) {
        sentenceIndex++;
        sentences.push({
          text: text,
          section: currentSection,
          pos: currentSection + '第' + sentenceIndex + '句'
        });
      }
    });

    console.log('[Content] 提取' + sentences.length + '句');
    return sentences.slice(0, 20); // 限制20句以保证API速度
  }

  // 提取正文（用于摘要）- 返回连续文本
  function extractForSummary() {
    // 微信公众号文章内容选择器
    const wechatSelectors = [
      '#js_content',
      '.rich_media_content',
      '#img-content',
      '.article-content'
    ];

    // 通用选择器
    const commonSelectors = [
      'article',
      '[role="article"]',
      '.post-content',
      '.entry-content',
      '.article-body'
    ];

    let contentElement = null;

    // 先尝试微信公众号选择器
    for (const sel of wechatSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 100) {
        contentElement = el;
        console.log('[Content] 找到微信公众号内容:', sel);
        break;
      }
    }

    // 再尝试通用选择器
    if (!contentElement) {
      for (const sel of commonSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 100) {
          contentElement = el;
          console.log('[Content] 找到通用内容:', sel);
          break;
        }
      }
    }

    // 最后用body
    if (!contentElement) {
      contentElement = document.body;
      console.log('[Content] 使用body作为内容源');
    }

    // 提取所有文本段落
    const paragraphs = contentElement.querySelectorAll('p, section');
    const texts = [];
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text.length > 20 && !isNoiseText(text)) {
        texts.push(text);
      }
    });

    console.log('[Content] 摘要提取：获取到', texts.length, '个段落');
    return texts.join('\n');
  }

  // 兼容旧接口
  function extractMainContent() {
    const sentences = extractForDetection();
    return {
      sentences: sentences,
      duplicates: [], // 不再本地检测
      totalTime: 0
    };
  }

  // 消息监听器
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[Content] 收到消息:', request.action);

    if (request.action === 'ping') {
      sendResponse('pong');
      return true;
    }

    if (request.action === 'extractContent') {
      try {
        const result = extractMainContent();
        sendResponse(result);
      } catch (error) {
        console.error('[Content] 提取失败:', error);
        sendResponse({ error: error.message });
      }
      return true;
    }

    if (request.action === 'extractForDetection') {
      // 新增：专为检测提取句子
      try {
        const sentences = extractForDetection();
        sendResponse({ success: true, sentences: sentences });
      } catch (error) {
        console.error('[Content] 检测提取失败:', error);
        sendResponse({ error: error.message });
      }
      return true;
    }

    if (request.action === 'extractForSummary') {
      try {
        const content = extractForSummary();
        sendResponse({ success: true, content: content });
      } catch (error) {
        console.error('[Content] 摘要提取失败:', error);
        sendResponse({ error: error.message });
      }
      return true;
    }

    if (request.action === 'scrollToText') {
      // 定位到指定文本
      try {
        var targetText = request.text;
        if (!targetText) {
          sendResponse({ error: '没有指定文本' });
          return true;
        }

        console.log('[Content] 尝试定位文本:', targetText.substring(0, 50));

        // 清理目标文本
        var cleanTarget = targetText.replace(/[，。！？、；：""''《》（）\[\]【】\s\n\r]/g, '');

        if (cleanTarget.length < 5) {
          sendResponse({ error: '文本太短' });
          return true;
        }

        var found = false;
        var foundElement = null;

        // 方法1：尝试全文精确匹配
        var allText = document.body.innerText || '';
        var cleanAllText = allText.replace(/[，。！？、；：""''《》（）\[\]【】\s\n\r]/g, '');

        if (cleanAllText.includes(cleanTarget)) {
          console.log('[Content] 找到精确匹配');
          // 查找包含这段文本的元素
          var elements = document.querySelectorAll('p, div, span, article, section, li, td, th');
          for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var elText = el.innerText || '';
            var cleanElText = elText.replace(/[，。！？、；：""''《》（）\[\]【】\s\n\r]/g, '');
            if (cleanElText.includes(cleanTarget)) {
              foundElement = el;
              break;
            }
          }
        }

        // 方法2：如果没找到，尝试部分匹配（取目标文本的前20个字符）
        if (!foundElement && cleanTarget.length >= 20) {
          var partialTarget = cleanTarget.substring(0, 20);
          console.log('[Content] 尝试部分匹配:', partialTarget);
          var elements = document.querySelectorAll('p, div, span, article, section, li, td, th');
          for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var elText = el.innerText || '';
            var cleanElText = elText.replace(/[，。！？、；：""''《》（）\[\]【】\s\n\r]/g, '');
            if (cleanElText.includes(partialTarget)) {
              foundElement = el;
              break;
            }
          }
        }

        if (foundElement) {
          // 滚动到元素
          foundElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          console.log('[Content] 已滚动到元素');

          // 永久标红效果（不自动移除）
          var originalBg = foundElement.style.backgroundColor;
          var originalOutline = foundElement.style.outline;
          foundElement.style.outline = '3px solid #ef4444';
          foundElement.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';

          sendResponse({ success: true });
        } else {
          console.log('[Content] 未找到匹配的文本元素');
          sendResponse({ error: '未找到目标文本' });
        }
      } catch (error) {
        console.error('[Content] 定位失败:', error);
        sendResponse({ error: error.message });
      }
      return true;
    }

    return true;
  });

  console.log('[Content Script] 已就绪 v6 - API驱动检测');
})();
