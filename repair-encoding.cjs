const fs = require("fs");
const path = require("path");

const root = process.cwd();
const source = path.join(root, "src");

const backup = path.join(
  root,
  "backup-encodage-" +
    new Date().toISOString().replace(/[:.]/g, "-")
);

const decoder = new TextDecoder("utf-8", {
  fatal: true
});

const cp1252 = {
  "€": 128, "‚": 130, "ƒ": 131,
  "„": 132, "…": 133, "†": 134,
  "‡": 135, "ˆ": 136, "‰": 137,
  "Š": 138, "‹": 139, "Œ": 140,
  "Ž": 142, "‘": 145, "’": 146,
  "“": 147, "”": 148, "•": 149,
  "–": 150, "—": 151, "˜": 152,
  "™": 153, "š": 154, "›": 155,
  "œ": 156, "ž": 158, "Ÿ": 159
};

function getByte(char) {
  const code = char.charCodeAt(0);

  if (code <= 255) return code;

  return cp1252[char] ?? null;
}

function repairPass(text) {
  let output = "";
  let changes = 0;

  for (let i = 0; i < text.length;) {
    const first = getByte(text[i]);

    if (first !== null && first >= 194 && first <= 244) {
      const length =
        first < 224 ? 2 :
        first < 240 ? 3 : 4;

      if (i + length <= text.length) {
        const chars = text.slice(i, i + length);
        const bytes = [...chars].map(getByte);

        if (bytes.every(b => b !== null)) {
          try {
            const decoded = decoder.decode(
              Uint8Array.from(bytes)
            );

            if (
              decoded !== chars &&
              !/[\u0000-\u001F\u007F-\u009F]/.test(decoded)
            ) {
              output += decoded;
              i += length;
              changes++;
              continue;
            }
          } catch {}
        }
      }
    }

    output += text[i];
    i++;
  }

  return { output, changes };
}

function repair(text) {
  let current = text;
  let total = 0;

  for (let pass = 0; pass < 4; pass++) {
    const result = repairPass(current);

    current = result.output;
    total += result.changes;

    if (result.changes === 0) break;
  }

  return { output: current, changes: total };
}

const extensions = new Set([
  ".ts", ".tsx", ".js", ".jsx",
  ".css", ".json", ".html", ".md"
]);

let fixedFiles = 0;
let fixedCharacters = 0;

function scan(folder) {
  for (const entry of fs.readdirSync(folder, {
    withFileTypes: true
  })) {
    const full = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      scan(full);
      continue;
    }

    if (!extensions.has(path.extname(entry.name))) {
      continue;
    }

    const original = fs.readFileSync(full, "utf8");
    const result = repair(original);

    if (!result.changes) continue;

    const relative = path.relative(source, full);
    const destination = path.join(backup, relative);

    fs.mkdirSync(path.dirname(destination), {
      recursive: true
    });

    fs.copyFileSync(full, destination);

    fs.writeFileSync(full, result.output, "utf8");

    fixedFiles++;
    fixedCharacters += result.changes;

    console.log("CORRIGE :", relative);
  }
}

if (!fs.existsSync(source)) {
  throw new Error("Dossier src introuvable");
}

scan(source);

console.log("");
console.log("=================================");
console.log("NASHRA - REPARATION TERMINEE");
console.log("=================================");
console.log("Fichiers corriges :", fixedFiles);
console.log("Sequences reparees :", fixedCharacters);
console.log("Sauvegarde :", backup);