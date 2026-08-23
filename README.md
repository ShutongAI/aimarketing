# aimarketing

本仓库收录可直接使用的 AI 营销工具：

| 项目 | 说明 |
| --- | --- |
| [ai-product-image-factory](ai-product-image-factory/) | **AI 商品图工厂**：上传一张普通商品照片，一次生成 1:1 / 3:4 / 4:3 / 16:9 的白底商品图、场景主图、促销图，并输出商品标题与 3 条卖点，支持一键下载完整素材包 |
| [brand-copy-system](brand-copy-system-repo/) | **品牌文案体系**：输入 5 个字段，一次产出完整自洽的品牌文案体系（文档见下方） |

---

First public release of the brand copy system prompt template.

# Brand Copy System



> **Input the essentials, get a complete and self-consistent brand copy system in one shot.**
> An open-source prompt template that works with any capable LLM (Claude, GPT, Gemini, DeepSeek, Qwen).

**Option 1: With Claude** — Download `brand-copy-system.skill` directly.
**Option 2: With any other LLM** — Download `SKILL.md` directly.

[简体中文](#中文文档) · [English](#english-docs)

---

## The Problem It Solves

**Pain point: consistency.**

The biggest problem with AI-generated brand copy isn't that the model can't write — it's that what it writes **doesn't add up**. The tagline sounds bold, the About page sounds corporate, the social bio suddenly turns quirky, the product detail page slides into discount-store mode. One brand, sounding like four or five different people talking.

The root cause: most prompts ask the model to **write single pieces directly**, with no strategic anchor. Each piece is generated in isolation, so naturally they drift in different directions.

This template takes a different approach: **build the strategic foundation first** (positioning → values → personality → tone spectrum), then **derive every downstream asset from that foundation**. The result is a tightly interlocking set of content — hero section, social posts, packaging, detail pages — all sounding like the same brand.

## What You Get

**Deliverable: fill in 5 fields, get a complete brand package.**

Input: brand name, core idea, industry, region, target audience.

Output (generated in one pass, across four modules):

- **Strategic Foundation**: positioning statement, brand values, brand personality, tone of voice spectrum
- **Core Messaging**: 3 ranked tagline options, brand story, elevator pitch, 3 value propositions
- **Tone of Voice Guide**: voice principles (with Do/Don't examples), preferred & avoid word lists, before-after rewrites
- **Channel Copy Templates**: website hero, social media bios & post templates, e-commerce detail page, offline store materials
- **Internal Alignment**: mission, vision, messaging hierarchy table

Not just a tagline. Not just a brand story. The **entire set** brand owners actually need.

See [`examples/xinjiay-snack-store.md`](examples/xinjiay-snack-store.md) for a full sample output.

---

> **输入关键信息，一键产出一套完整、自洽的品牌文案体系。**
> 开源 prompt 模板，任何大模型都能用（Claude、GPT、Gemini、DeepSeek、通义千问）。

[简体中文](#中文文档) · [English](#english-docs)

**「Option 1: With Claude」可直接下载brand-copy-system.skill，
   「Option 2: With any other LLM」的用户直接下载 SKILL.md**
---

## 它解决什么问题

**痛点：一致性。**

用 AI 写品牌文案，最大的问题不是写不出来，而是写出来的东西**对不上**——Slogan 、产品介绍页、社媒简介、电商详情页等。同一个品牌，听起来像四五个不同的人在说话。

根本原因是大多数 prompt 让模型**直接写单点文案**，没有战略锚点。每段独立生成，自然各飘各的方向。

这个模板换了个思路：**先让模型搭好战略地基**（定位 → 价值观 → 品牌人格 → 语调光谱），**所有下游文案都从这个地基推导**。结果是一整套互相咬合的内容——首屏、社媒、包装、详情页，听起来是同一个品牌在说话。

## 你会得到什么

**交付物：填 5 个字段，输出一套完整品牌方案。**

输入：品牌名称、核心理念、行业、区域、目标人群。

输出（一次生成，四大模块）：

- **战略基础**：品牌定位语、价值观、品牌人格、语调光谱
- **核心信息**：3 个 Slogan 备选、品牌故事、电梯演讲、3 大价值主张
- **语调指南**：表达原则（含 Do/Don't 示例）、推荐词/避免词表、改写示范
- **渠道文案**：官网首屏、社媒简介与帖子模板、电商详情页、线下门店物料
- **内部对齐**：使命、愿景、消息层级表

不是一句 Slogan，不是一段品牌故事，而是品牌方真正需要的**那一整套**。

完整样例见 [`examples/xinjiay-snack-store.md`](examples/xinjiay-snack-store.md)。


---

     
     - Core prompt template (SKILL.md)
     - Bilingual README (English + 简体中文)
     - Example output: snack retail brand
     - Ready to use with any capable LLM (Claude, GPT, Gemini, etc.)
