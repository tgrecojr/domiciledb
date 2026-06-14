// TypeScript 6 requires a type declaration for side-effect imports of
// non-code modules (e.g. `import "./globals.css"`). Next.js handles CSS at
// build time; these declarations exist only to satisfy the type checker.
declare module "*.css";
declare module "*.scss";
declare module "*.sass";
