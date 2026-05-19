# 内容质量检测 Chrome 插件

检测网页正文的冗余、重复内容，支持AI智能摘要。

## 功能特性

- **内容检测**：智能检测网页中的语义重复句子
- **AI摘要**：基于MiniMax API生成文章摘要
- **快速定位**：点击定位按钮，滚动到原网页对应位置并标红
- **案例日志**：记录历史检测案例，支持导出
- **Claude风格UI**：深色主题，简洁设计

## 技术栈

- Chrome Extension (Manifest V3)
- JavaScript (前端)
- MiniMax API (语义分析)
- 本地关键词算法 (预检测，<5秒)

## 安装

1. 克隆仓库
2. 打开 Chrome `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `chrome-extension` 文件夹

## 项目结构

```
chrome-extension/
├── manifest.json     # 扩展配置
├── popup.html/js     # 弹出窗口
├── panel.html/js     # 结果面板
├── background.js      # 后台脚本
├── content.js        # 内容脚本
├── logs.html/js      # 日志查看
└── icons/            # 图标
```

## 使用方法

1. 点击插件图标打开popup
2. 在设置中输入MiniMax API Key
3. 打开任意新闻/文章页面
4. 点击「开始检测」分析内容重复
5. 或点击「智能摘要」生成文章摘要
6. 在结果面板点击定位按钮查看原文对应位置