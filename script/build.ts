import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const buildStart = Date.now();
  console.log("[build] Starting production build...");

  const timer = setTimeout(() => {
    console.error(`[build] FATAL: Build timed out after ${BUILD_TIMEOUT_MS / 1000}s`);
    process.exit(1);
  }, BUILD_TIMEOUT_MS);

  try {
    await rm("dist", { recursive: true, force: true });

    console.log("[build] Building client (Vite)...");
    const clientStart = Date.now();
    await viteBuild();
    console.log(`[build] Client built in ${((Date.now() - clientStart) / 1000).toFixed(1)}s`);

    console.log("[build] Building server (esbuild)...");
    const serverStart = Date.now();
    const pkg = JSON.parse(await readFile("package.json", "utf-8"));
    const allDeps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
    ];
    const externals = allDeps.filter((dep) => !allowlist.includes(dep));

    await esbuild({
      entryPoints: ["server/index.ts"],
      platform: "node",
      bundle: true,
      format: "cjs",
      outfile: "dist/index.cjs",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      minify: true,
      external: externals,
      logLevel: "info",
    });
    console.log(`[build] Server built in ${((Date.now() - serverStart) / 1000).toFixed(1)}s`);

    console.log(`[build] Production build complete in ${((Date.now() - buildStart) / 1000).toFixed(1)}s`);
  } finally {
    clearTimeout(timer);
  }
}

buildAll().catch((err) => {
  console.error("[build] Build failed:", err);
  process.exit(1);
});
