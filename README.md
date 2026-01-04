# Clement Li's Blog

一个使用 Astro 构建的个人博客，支持中英文双语切换。

## ✨ 功能特性

- 🌐 **国际化支持** - 基于 Astro 原生 i18n，支持中文/英文切换
- 💬 **评论系统** - 集成 Giscus（基于 GitHub Discussions）
- 🚀 **极速加载** - 100/100 Lighthouse 性能评分
- 📱 **响应式设计** - 完美适配各种设备
- 📝 **Markdown & MDX** - 支持丰富的内容格式
- 🔍 **SEO 优化** - 完善的 meta 标签和 OpenGraph 数据
- 📡 **RSS 订阅** - 支持 RSS Feed
- 🗺️ **站点地图** - 自动生成 sitemap

## 📁 项目结构

```text
├── public/                 # 静态资源
├── src/
│   ├── assets/            # 图片等资源
│   ├── components/        # 组件
│   │   ├── BaseHead.astro
│   │   ├── Footer.astro
│   │   ├── Header.astro
│   │   └── Giscus.astro   # 评论组件
│   ├── content/
│   │   └── blog/
│   │       ├── zh/        # 中文文章
│   │       └── en/        # 英文文章
│   ├── i18n/              # 国际化配置
│   │   ├── ui.ts          # 翻译文本
│   │   └── utils.ts       # 工具函数
│   ├── layouts/
│   │   └── BlogPost.astro
│   ├── pages/
│   │   ├── index.astro    # 中文首页
│   │   ├── about.astro    # 中文关于
│   │   ├── blog/          # 中文博客
│   │   └── en/            # 英文页面
│   └── consts.ts          # 站点配置
├── astro.config.mjs
└── package.json
```

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## ✍️ 写作指南

### 添加新文章

1. 在 `src/content/blog/zh/` 目录下创建中文文章
2. 在 `src/content/blog/en/` 目录下创建英文文章

### 文章格式

```markdown
---
title: "文章标题"
description: "文章描述"
pubDate: 2025-01-04
updatedDate: 2025-01-05  # 可选
tags: ["标签1", "标签2"]  # 可选
heroImage: ./image.jpg    # 可选
---

文章内容...
```

## 💬 配置评论系统

1. 访问 [Giscus](https://giscus.app) 配置页面
2. 输入你的 GitHub 仓库: `ugorange/blog`
3. 在仓库设置中启用 Discussions
4. 获取 `data-repo-id` 和 `data-category-id`
5. 更新 `src/components/Giscus.astro` 中的配置

```javascript
const giscusConfig = {
  repo: "ugorange/blog",
  repoId: "YOUR_REPO_ID",           // 从 giscus.app 获取
  category: "Announcements",
  categoryId: "YOUR_CATEGORY_ID",   // 从 giscus.app 获取
  // ...
};
```

## 🌐 网站信息

- **作者**: Clement Li
- **邮箱**: ugorange99@gmail.com
- **GitHub**: [@ugorange](https://github.com/ugorange)
- **网站**: https://ugorange.com

## 📄 许可证

MIT License
