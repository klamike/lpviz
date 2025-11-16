import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const asciiArtLines = ["  ___                                   ", " /\\_ \\                   __             ", " \\//\\ \\   ______  __  __/\\_\\  _____     ", "   \\ \\ \\ /\\  __ \\/\\ \\/\\ \\/\\ \\/\\__  \\    ", "    \\_\\ \\\\ \\ \\_\\ \\ \\ \\_/ \\ \\ \\/_/  /_   ", "    /\\____\\ \\  __/\\ \\___/ \\ \\_\\/\\____\\  ", "    \\/____/\\ \\ \\/  \\/__/   \\/_/\\/____/  ", "            \\ \\_\\                       ", "             \\/_/                       ", "                                        "];

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const targetPath = resolve(rootDir, "index.html");
const original = readFileSync(targetPath, "utf8");

const openTag = '<div id="nullStateMessage">';
const closeTag = "</div>";
const openIndex = original.indexOf(openTag);

if (openIndex === -1) {
  console.error('restoreAsciiArt: could not find <div id="nullStateMessage"> in lpviz/index.html');
  process.exitCode = 1;
} else {
  const searchStart = openIndex + openTag.length;
  const closeIndex = original.indexOf(closeTag, searchStart);

  if (closeIndex === -1) {
    console.error("restoreAsciiArt: malformed nullStateMessage block");
    process.exitCode = 1;
  } else {
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const asciiBlock = asciiArtLines.join(newline);

    const indentStart = original.lastIndexOf("\n", openIndex);
    const indent = indentStart === -1 ? "" : original.slice(indentStart + 1, openIndex).replace(/[^\t ]/g, "");

    const replacement = `${openTag}${newline}${asciiBlock}${newline}${indent}${closeTag}`;
    const updated = `${original.slice(0, openIndex)}${replacement}${original.slice(closeIndex + closeTag.length)}`;

    if (updated !== original) {
      writeFileSync(targetPath, updated, "utf8");
      console.log("Restored ASCII art banner in lpviz/index.html");
    }
  }
}
