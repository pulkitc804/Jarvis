// electron-builder drops node_modules from extraResources, so the Next
// standalone server ends up without its runtime deps (node-ical, etc.). Copy
// them back into the packaged app here.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const product = context.packager.appInfo.productFilename; // "Jarvis"
  const src = path.join(process.cwd(), ".next", "standalone", "node_modules");
  const dest = path.join(
    context.appOutDir,
    `${product}.app`,
    "Contents",
    "Resources",
    "app",
    "node_modules",
  );
  if (!fs.existsSync(src)) {
    console.warn("[afterPack] standalone node_modules not found:", src);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log("[afterPack] copied standalone node_modules →", dest);
};
