// ESLint 平面配置（flat config）。
// 注意：eslint 本体与 eslint-config-next 不在本项目锁版依赖清单内（清单见 package.json），
// 本文件先行就位、仅使用 ESLint 核心规则；后续任务若装上 eslint，即可直接 `npx eslint .`。
// 在此之前 next.config.ts 已设置 eslint.ignoreDuringBuilds，构建不受影响。
const eslintConfig = [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
