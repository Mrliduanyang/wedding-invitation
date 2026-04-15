import { defineConfig } from "vite";

export default defineConfig({
  // Hugo static 目录的访问路径
  base: './',
  build: {
    // 启用压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // 保留 console（配合 vConsole 调试）
        drop_debugger: true, // 移除 debugger
        pure_funcs: [], // 保留 console.log
      },
    },
    // 分包策略
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
        },
      },
    },
    // CSS 代码分割：禁用以让 CSS 内联或单独加载，避免 FOUC
    cssCodeSplit: false,
    // 设置警告阈值
    chunkSizeWarningLimit: 1000,
    // 压缩分析
    reportCompressedSize: true,
  },
  // 优化依赖预构建
  optimizeDeps: {
    include: ['three'],
  },
});
