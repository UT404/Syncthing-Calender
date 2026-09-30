import esbuild from "esbuild";
await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  platform: "browser",
  outfile: "main.js",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  logLevel: "info",
  sourcemap: false,
  treeShaking: true,
});
