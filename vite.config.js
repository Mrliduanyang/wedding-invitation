import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // 启用压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 移除 console
        drop_debugger: true, // 移除 debugger
        pure_funcs: ['console.log'], // 移除 console.log
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
    // CSS 代码分割
    cssCodeSplit: true,
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
