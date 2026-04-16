import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      animation: {
        blob: "blob 20s infinite alternate cubic-bezier(0.4, 0, 0.2, 1)",
        "parallax-bg": "parallax 30s linear infinite",
      },
      keyframes: {
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
        // 使用 transform 替代 backgroundPosition 驱动视差动画。
        // backgroundPosition 不在浏览器的 GPU 合成属性列表中，每帧都会触发重绘；
        // transform 则完全在合成线程上运行，对主线程和 CPU 零影响。
        // 平移量与 background-size（40px）相等，形成无缝循环；
        // 配合 BackgroundEffects.tsx 中元素向四周扩展 40px 防止边缘露白。
        parallax: {
          "0%": { transform: "translate(0px, 0px)" },
          "100%": { transform: "translate(40px, 40px)" },
        },
      },
    },
  },
  plugins: [
    function ({ addUtilities }: { addUtilities: (utilities: Record<string, Record<string, string>>) => void }) {
      addUtilities({
        '.animation-delay-2000': {
          'animation-delay': '2s',
        },
        '.animation-delay-4000': {
          'animation-delay': '4s',
        },
      })
    }
  ],
};
export default config;