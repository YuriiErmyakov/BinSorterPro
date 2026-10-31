// Generates the small media files of the test project with ffmpeg.
//   node test/make_media.js
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { MEDIA, FILES } = require("./fixture.js");

function ffmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return "ffmpeg"; } catch (e) {}
  const base = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
  const stack = fs.existsSync(base) ? [base] : [];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full); else if (e.name.toLowerCase() === "ffmpeg.exe") return full;
    }
  }
  throw new Error("ffmpeg not found");
}

const FF = ffmpeg();
let hue = 0;
for (const [rel, , , recipe] of FILES) {
  const out = path.join(MEDIA, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) continue;
  hue = (hue + 47) % 360;
  let args;
  if (recipe === "v") {
    args = ["-f", "lavfi", "-i", "testsrc2=s=320x180:r=25:d=2,hue=h=" + hue, "-f", "lavfi", "-i", "sine=f=440:d=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"];
  } else if (recipe === "i") {
    args = ["-f", "lavfi", "-i", "testsrc2=s=640x360:d=1,hue=h=" + hue, "-frames:v", "1"];
  } else {
    args = ["-f", "lavfi", "-i", "sine=f=" + (220 + hue) + ":d=" + recipe.split(":")[1], "-ac", "2", "-ar", "48000"];
  }
  execFileSync(FF, ["-y", "-loglevel", "error"].concat(args, [out]));
  console.log("made " + rel);
}
console.log("media ready: " + MEDIA);
