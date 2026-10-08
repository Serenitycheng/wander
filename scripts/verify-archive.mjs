import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../archive/recovery-2026-09-09/", import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, "RECOVERY-MANIFEST.json"), "utf8"));
const failures = [];

for (const item of manifest.files) {
  const target = resolve(root, item.path);
  if (!target.startsWith(resolve(root) + sep)) {
    failures.push(`Unsafe path: ${item.path}`);
    continue;
  }
  try {
    const info = await stat(target);
    const digest = createHash("sha256").update(await readFile(target)).digest("hex");
    if (!info.isFile() || info.size !== item.bytes || digest !== item.sha256) {
      failures.push(`Changed: ${item.path}`);
    }
  } catch {
    failures.push(`Missing: ${item.path}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Recovery snapshot verified: ${manifest.files.length} files, ${manifest.total_bytes} bytes.`);
}
