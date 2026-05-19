# 智能摘要功能 - 开发进度

## 当前状态：✅ 已修复，API正常工作

## 问题排查记录

### 2026-05-04 问题修复

| 问题 | 原因 | 解决 |
|------|------|------|
| API返回格式异常 | 错误地使用了 `coding_plan/search` API（搜索API，不是LLM） | 改用 `v1/text/chatcompletion_v2` 接口 |
| 搜索API返回乱码内容 | 搜索API返回的是网页片段，不是摘要 | 使用正确的模型 `MiniMax-M2.5` |
| prompt过长导致乱码 | 中文prompt通过URL传递时编码问题 | 简化为 `概括成30字以内：${content}` |

## API测试结果

**正确接口**: `POST https://api.minimaxi.com/v1/text/chatcompletion_v2`
**模型名**: `MiniMax-M2.5`

测试示例：
```
输入: "今天天气很好，阳光明媚，适合户外活动。明天可能会下雨，记得带伞。"
输出: "今天晴好宜户外，明天下雨需带伞。"
```

## 代码改动

### background.js - callMinimaxSummaryAPI()
- 接口从 `/v1/coding_plan/search` 改为 `/v1/text/chatcompletion_v2`
- prompt简化为 `概括成30字以内：${content}`
- 正常解析 `choices[0].message.content`

## 测试步骤

1. 在Chrome中重新加载扩展
2. 保存API Key
3. 打开一个新闻页面
4. 点击"智能摘要"按钮
5. 观察panel显示的摘要结果