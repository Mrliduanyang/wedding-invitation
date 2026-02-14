# 💒 婚礼导航系统

一个基于 Three.js 的 3D 交互式婚礼导航系统，让宾客以有趣的方式了解婚礼相关地点信息。

![Wedding Navigation System](https://img.shields.io/badge/Three.js-black?style=flat-square&logo=three.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

## ✨ 特性

### 🚗 双重出行模式
- **🚖 打车模式**：自动导航，小车沿路径自动行驶
- **🚗 自驾模式**：使用方向键（↑↓←→）手动控制小车

### 🏙️ 3D 城市场景
- **6×6 城市网格**：包含道路、建筑物、路灯等元素
- **法拉利 458 Italia 模型**：使用 Three.js 官方示例模型
- **动态光照效果**：方向光、环境光和建筑顶部发光指示器
- **飘浮气球装饰**：营造节日氛围

### 三个目的地
1. **💒 婚礼现场**
    - 粉金渐变主题
    - LED 显示百年好合倒计时
    - 新人合照展示区

2. **🤵 新郎家**
    - 蓝色渐变主题
    - 浪漫爱情故事展示
    - 新郎个人照片区

3. **👰 新娘家**
    - 粉色渐变主题
    - 温馨回忆展示
    - 新娘个人照片区

### 精美 UI 设计
- **LED 滚动屏幕**：无缝循环滚动的霓虹灯文字效果
- **玻璃态弹窗**：现代化的毛玻璃效果和渐变背景
- **平滑动画**：所有交互都有流畅的过渡动画
- **响应式布局**：适配不同屏幕尺寸

### 导航线特效
- **动态绘制**：路线预览时的动画绘制效果
- **平滑消失**：小车行驶过的路段自动渐变消失
- **自定义 Shader**：使用 WebGL Shader 实现精确的透明度控制

### 语音播报
- **智能导航语音**：使用 Web Speech API 实现中文语音播报
- **实时状态提示**：启动时播报"开始导航"，到达时播报"已到达目的地"
- **自然音效**：平滑的语音合成，提升沉浸式体验

### 真实引擎声浪
- **多层次音效**：使用 Web Audio API 合成真实的汽车引擎声
- **动态声浪变化**：音量脉动效果（多频率叠加）
- **物理同步**：声浪与车速实时同步，转向时保持稳定音调

## 快速开始

### 环境要求
- Node.js >= 20.0.0
- npm 或 yarn

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

访问 `http://localhost:5173` 查看效果

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

## 使用说明

1. **选择出行方式**：点击"打车"或"自驾"按钮
2. **选择目的地**：从下拉菜单选择婚礼现场、新郎家或新娘家
3. **生成路线**：点击"生成导航路线"按钮查看路径预览
4. **开始导航**：点击"开始导航"按钮
    - 打车模式：小车自动行驶
    - 自驾模式：使用方向键控制
5. **到达目的地**：弹出目的地详情弹窗

## 技术栈

- **Three.js** - 3D 渲染引擎
- **Vite** - 现代化的前端构建工具
- **Vanilla JavaScript** - 原生 JavaScript，无框架依赖

## 许可证

本项目采用[MIT](LICENSE) 许可证

## 联系方式

- 邮箱：duanyangchn@gmai.com
