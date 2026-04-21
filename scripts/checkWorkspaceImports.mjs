import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["apps", "src", "packages"];
const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);
const APP_ROOTS = [resolve(ROOT, "apps"), resolve(ROOT, "src")];
const isAppFile = (file) => APP_ROOTS.some((root) => file.includes(root));

const rules = [
  {
    name: "No deep workspace src imports",
    appliesTo: (file) => isAppFile(file) || file.includes(resolve(ROOT, "packages")),
    pattern: /from\s+["']@lpviz\/[^"']+\/src\//,
  },
  {
    name: "Use @/contracts instead of feature-owned result payload imports",
    appliesTo: isAppFile,
    pattern: /from\s+["'][^"']*features\/solver\/resultPayload["']/,
  },
  {
    name: "Use @lpviz/solver-engine instead of legacy solver source imports",
    appliesTo: isAppFile,
    pattern:
      /from\s+["'][^"']*solvers\/(?:centralPath|ipm|pdhg|pdhg_eq|pdhg_ineq|simplex)["']/,
  },
];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry.startsWith(".")
      ) {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }
    if ([...FILE_EXTENSIONS].some((ext) => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = SOURCE_DIRS.flatMap((dir) => {
  const fullPath = resolve(ROOT, dir);
  return existsSync(fullPath) ? walk(fullPath) : [];
});
const violations = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (!rule.appliesTo(file)) continue;
      if (!rule.pattern.test(line)) continue;
      violations.push({
        rule: rule.name,
        file: relative(ROOT, file),
        line: index + 1,
        text: line.trim(),
      });
    }
  });
}

if (violations.length > 0) {
  console.error("Workspace import boundary violations:\n");
  for (const violation of violations) {
    console.error(
      `- [${violation.rule}] ${violation.file}:${violation.line} :: ${violation.text}`,
    );
  }
  process.exit(1);
}

console.log(
  `Workspace import boundary check passed for ${files.length} files.`,
);
