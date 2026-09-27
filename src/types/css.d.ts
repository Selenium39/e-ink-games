// 裸 CSS side-effect import 的模块声明。
// Next 内置的 next/types/global.d.ts 只声明了 *.module.css；
// 本站样式以纯副作用 import 接入（见 src/app/layout.tsx），
// TypeScript 7 对缺声明的 side-effect import 报 TS2882，故补此通配声明。

declare module "*.css";
