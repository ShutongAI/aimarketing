/** 规格中心：图片比例、图片类型、商品类目、视觉风格。生成端与导出端共用同一份定义。 */

export type RatioKey = '1:1' | '3:4' | '4:3' | '16:9';
export type ShotType = 'white' | 'scene' | 'promo';
export type CategoryKey =
  | 'beauty'
  | 'food'
  | 'home'
  | 'digital'
  | 'apparel'
  | 'baby'
  | 'pet'
  | 'health';
export type StyleKey =
  | 'fresh'
  | 'premium'
  | 'bright'
  | 'warm'
  | 'pop'
  | 'minimal'
  | 'oriental'
  | 'tech';

export interface RatioSpec {
  key: RatioKey;
  /** 导出像素宽 */
  width: number;
  /** 导出像素高 */
  height: number;
  /** 使用场景说明，展示在结果卡片与素材清单里 */
  usage: string;
  slug: string;
}

export const RATIOS: RatioSpec[] = [
  { key: '1:1', width: 1080, height: 1080, usage: '电商主图 / 详情页首图', slug: '1x1' },
  { key: '3:4', width: 1080, height: 1440, usage: '竖版信息流 / 小红书笔记', slug: '3x4' },
  { key: '4:3', width: 1440, height: 1080, usage: '横版详情页 / 商品卡片', slug: '4x3' },
  { key: '16:9', width: 1920, height: 1080, usage: '首页横幅 / 落地页 Banner', slug: '16x9' },
];

export const RATIO_MAP: Record<RatioKey, RatioSpec> = Object.fromEntries(
  RATIOS.map((r) => [r.key, r]),
) as Record<RatioKey, RatioSpec>;

export interface ShotSpec {
  key: ShotType;
  name: string;
  desc: string;
  /** 导出文件格式 */
  format: 'png' | 'jpeg';
  folder: string;
}

export const SHOTS: ShotSpec[] = [
  {
    key: 'white',
    name: '白底商品图',
    desc: '纯白背景、居中构图，符合主流电商平台主图审核规范',
    format: 'png',
    folder: '01_白底商品图',
  },
  {
    key: 'scene',
    name: '场景主图',
    desc: '带环境氛围与光影融合的场景图，用于种草与详情页',
    format: 'jpeg',
    folder: '02_场景主图',
  },
  {
    key: 'promo',
    name: '促销图',
    desc: '叠加中文营销排版（主标题 / 副标题 / 卖点 / 角标）',
    format: 'jpeg',
    folder: '03_促销图',
  },
];

export const SHOT_MAP: Record<ShotType, ShotSpec> = Object.fromEntries(
  SHOTS.map((s) => [s.key, s]),
) as Record<ShotType, ShotSpec>;

export interface CategorySpec {
  key: CategoryKey;
  name: string;
  /** 生图 prompt 里的场景描述 */
  scene: string;
  /** 场景道具，本地合成引擎按此绘制矢量元素 */
  props: Array<'leaf' | 'stone' | 'water' | 'fabric' | 'grid' | 'glow' | 'crumb' | 'bubble'>;
  /** 卖点模板，{name} 会被替换成商品名 */
  points: string[];
  /** 标题里的属性词 */
  attrs: string[];
  /** 适用人群 / 场景词 */
  audience: string[];
}

export const CATEGORIES: CategorySpec[] = [
  {
    key: 'beauty',
    name: '美妆护肤',
    scene: '大理石台面、晨光斜射、绿植与水波倒影的护肤场景',
    props: ['leaf', 'stone', 'water'],
    points: ['温和配方，敏感肌也能日常使用', '质地清爽不黏腻，上脸即吸收', '实验室功效验证，28 天可见改善'],
    attrs: ['温和净澈', '水润修护', '氨基酸配方', '植萃安心'],
    audience: ['敏感肌适用', '油痘肌友好', '全肤质通用', '早晚可用'],
  },
  {
    key: 'food',
    name: '食品饮料',
    scene: '原木餐桌、自然侧光、谷物与新鲜食材点缀的餐桌场景',
    props: ['crumb', 'fabric', 'glow'],
    points: ['真材实料，配料表干净看得见', '独立小包装，随手撕开即食', '0 添加蔗糖，负担更少的日常口粮'],
    attrs: ['原味醇香', '轻负担', '手工现做', '每日一份'],
    audience: ['办公室加餐', '早餐搭配', '全家共享', '健身补给'],
  },
  {
    key: 'home',
    name: '家居日用',
    scene: '暖色客厅一角、柔和窗光、亚麻织物与陶瓷器皿的居家场景',
    props: ['fabric', 'leaf', 'glow'],
    points: ['一物多用，收纳与陈列两不误', '亲肤材质，久用不易变形', '简约配色，百搭任意家装风格'],
    attrs: ['耐用易洁', '柔软亲肤', '简约百搭', '整理有序'],
    audience: ['小户型适用', '租房必备', '全家使用', '送礼体面'],
  },
  {
    key: 'digital',
    name: '数码 3C',
    scene: '深色桌面、冷调轮廓光、玻璃反射与网格光效的科技场景',
    props: ['grid', 'glow'],
    points: ['旗舰级芯片，重载运行依旧稳定', '长效续航，一次充满用一整天', '一碰即连，多设备无缝切换'],
    attrs: ['高性能', '长续航', '极速连接', '轻薄便携'],
    audience: ['通勤办公', '游戏党首选', '学生党友好', '差旅必备'],
  },
  {
    key: 'apparel',
    name: '服饰配件',
    scene: '米色背景墙、柔光影调、亚麻布幔与自然褶皱的时装场景',
    props: ['fabric', 'glow'],
    points: ['精工版型，穿上自带垂顺廓形', '亲肤面料，四季都不挑天气', '基础配色，怎么搭都不会出错'],
    attrs: ['垂顺挺括', '透气舒适', '通勤百搭', '经典版型'],
    audience: ['通勤日常', '约会出街', '四季可穿', '男女同款'],
  },
  {
    key: 'baby',
    name: '母婴用品',
    scene: '奶油色婴儿房、柔和漫射光、棉柔织物与积木点缀的温柔场景',
    props: ['fabric', 'bubble', 'glow'],
    points: ['母婴级安全标准，入口入手都安心', '柔软无刺激，宝宝肌肤放心贴', '细节做圆角处理，减少磕碰风险'],
    attrs: ['安心材质', '柔软亲肤', '易清洁', '贴心设计'],
    audience: ['新手爸妈', '0-3 岁适用', '外出携带', '月子礼盒'],
  },
  {
    key: 'pet',
    name: '宠物用品',
    scene: '浅木地板、暖阳光斑、毛毯与逗猫棒点缀的宠物生活场景',
    props: ['fabric', 'crumb', 'glow'],
    points: ['宠物友好材质，啃咬也不掉屑', '好清洁易打理，毛发一擦就掉', '尺寸贴合，小型犬猫都合适'],
    attrs: ['安全耐咬', '易清洁', '贴合尺寸', '毛孩最爱'],
    audience: ['猫狗通用', '幼宠适用', '居家日常', '外出遛弯'],
  },
  {
    key: 'health',
    name: '保健营养',
    scene: '浅灰岩板、清透晨光、玻璃器皿与水滴质感的健康场景',
    props: ['stone', 'water', 'bubble'],
    points: ['足量活性成分，每日一粒好坚持', '小分子易吸收，肠胃负担更小', '第三方检测报告可查，成分透明'],
    attrs: ['足量配方', '易吸收', '每日一粒', '成分透明'],
    audience: ['熬夜人群', '办公室久坐', '中老年适用', '换季必备'],
  },
];

export const CATEGORY_MAP: Record<CategoryKey, CategorySpec> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategorySpec>;

export interface Palette {
  /** 背景渐变（从上到下） */
  bg: [string, string];
  /** 台面 / 地面颜色 */
  surface: string;
  /** 主强调色（角标、标题下划线） */
  accent: string;
  /** 次强调色 */
  accent2: string;
  /** 场景中主文字颜色 */
  text: string;
  /** 促销图文字底色（半透明遮罩） */
  scrim: string;
  /** 灯光颜色 */
  light: string;
  /** 阴影强度 0-1 */
  shadow: number;
}

export interface StyleSpec {
  key: StyleKey;
  name: string;
  /** 生图 prompt 里的风格描述 */
  prompt: string;
  palette: Palette;
}

export const STYLES: StyleSpec[] = [
  {
    key: 'fresh',
    name: '自然清新',
    prompt: '自然光、清新通透、低饱和绿意、柔和阴影，真实生活质感',
    palette: {
      bg: ['#eef6ef', '#cfe3d6'],
      surface: '#dbe9de',
      accent: '#2f7d5d',
      accent2: '#8fc7a4',
      text: '#173a2c',
      scrim: 'rgba(9,32,22,0.55)',
      light: 'rgba(255,255,255,0.85)',
      shadow: 0.28,
    },
  },
  {
    key: 'premium',
    name: '高级质感',
    prompt: '深色背景、聚光灯、大理石与金属反射，奢侈品级别的高级布光',
    palette: {
      bg: ['#23201d', '#100e0c'],
      surface: '#2b2723',
      accent: '#c8a05a',
      accent2: '#8c6f3f',
      text: '#f4ece0',
      scrim: 'rgba(0,0,0,0.6)',
      light: 'rgba(255,236,200,0.75)',
      shadow: 0.55,
    },
  },
  {
    key: 'bright',
    name: '明亮通透',
    prompt: '高调白色摄影棚、大面积柔光、干净背景、锐利细节',
    palette: {
      bg: ['#ffffff', '#e9eef4'],
      surface: '#f2f5f9',
      accent: '#2563eb',
      accent2: '#8ab4f8',
      text: '#12233d',
      scrim: 'rgba(10,25,45,0.5)',
      light: 'rgba(255,255,255,0.95)',
      shadow: 0.2,
    },
  },
  {
    key: 'warm',
    name: '暖调生活',
    prompt: '午后暖阳、原木与亚麻材质、温暖的琥珀色调，居家生活感',
    palette: {
      bg: ['#f7ead9', '#e2c4a1'],
      surface: '#e8d2b6',
      accent: '#c05621',
      accent2: '#e8a06a',
      text: '#3d2312',
      scrim: 'rgba(46,24,10,0.55)',
      light: 'rgba(255,224,178,0.85)',
      shadow: 0.32,
    },
  },
  {
    key: 'pop',
    name: '潮流撞色',
    prompt: '高饱和撞色背景、硬光投影、几何色块，潮流广告视觉',
    palette: {
      bg: ['#ff5f6d', '#7b2ff7'],
      surface: '#ff8a5c',
      accent: '#ffe459',
      accent2: '#25e5c4',
      text: '#fffdf5',
      scrim: 'rgba(40,0,60,0.45)',
      light: 'rgba(255,255,255,0.7)',
      shadow: 0.4,
    },
  },
  {
    key: 'minimal',
    name: '极简留白',
    prompt: '极简构图、大面积留白、单一柔和背景色、克制的阴影',
    palette: {
      bg: ['#faf9f7', '#ece8e1'],
      surface: '#f1ede6',
      accent: '#1f1f1f',
      accent2: '#b9b2a6',
      text: '#1a1a1a',
      scrim: 'rgba(20,20,20,0.45)',
      light: 'rgba(255,255,255,0.9)',
      shadow: 0.18,
    },
  },
  {
    key: 'oriental',
    name: '国潮东方',
    prompt: '东方美学、宣纸肌理、朱红与墨色、留白与远山意境',
    palette: {
      bg: ['#f6efe3', '#dcc9ad'],
      surface: '#e6d6bb',
      accent: '#b4232a',
      accent2: '#1f4f4a',
      text: '#2b1d14',
      scrim: 'rgba(43,29,20,0.55)',
      light: 'rgba(255,240,214,0.8)',
      shadow: 0.3,
    },
  },
  {
    key: 'tech',
    name: '科技冷感',
    prompt: '深蓝黑背景、冷调边缘光、网格与光晕、玻璃反射的科技感',
    palette: {
      bg: ['#101a2e', '#05070d'],
      surface: '#16203a',
      accent: '#4f8cff',
      accent2: '#25e5c4',
      text: '#e7f0ff',
      scrim: 'rgba(3,8,20,0.6)',
      light: 'rgba(120,180,255,0.7)',
      shadow: 0.5,
    },
  },
];

export const STYLE_MAP: Record<StyleKey, StyleSpec> = Object.fromEntries(
  STYLES.map((s) => [s.key, s]),
) as Record<StyleKey, StyleSpec>;

/** 生成任务的唯一标识：类型 + 比例 */
export function taskId(shot: ShotType, ratio: RatioKey) {
  return `${shot}@${ratio}`;
}

/** 导出文件名：白底商品图_1x1_1080x1080.png */
export function assetFileName(shot: ShotType, ratio: RatioKey) {
  const s = SHOT_MAP[shot];
  const r = RATIO_MAP[ratio];
  return `${s.name}_${r.slug}_${r.width}x${r.height}.${s.format === 'jpeg' ? 'jpg' : 'png'}`;
}
