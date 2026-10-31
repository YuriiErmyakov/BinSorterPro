// The test project: what lies where before a sort, and where the default settings must put it.
"use strict";
const path = require("path");

const MEDIA = path.join(__dirname, "media");
const PROJECT = path.join(__dirname, "ASB_test.prproj");
const PROJECT_AE = path.join(__dirname, "ASB_test.aep");
const PROJECT_DR = "ASB_test";                       // a project in the Resolve database, not a file

// [file under test\media, bin path before the sort, expected category, ffmpeg recipe]
//   v = 2 s test video with sound, a:N = N seconds of tone, i = still image
const FILES = [
  ["clip_a.mp4",                 [],                    "video", "v"],
  ["whoosh_01.wav",              [],                    "sfx",   "a:1"],
  ["logo.png",                   [],                    "gfx",   "i"],
  ["Artist - Summer Song.mp3",   [],                    "music", "a:20"],      // "song"
  ["voice_over.wav",             [],                    "audio", "a:4"],       // "voice" beats the short length
  ["clip_a_Proxy.mp4",           [],                    "proxy", "v"],
  ["beep2.wav",                  [],                    "sfx",   "a:2"],       // nothing in the name: short = SFX
  ["long_take.wav",              [],                    "music", "a:70"],      // nothing in the name: long = music
  ["interview_cam1.mov",         ["Footage", "Day 1"],  "video", "v"],
  ["broll_02.mp4",               ["Footage", "Day 1"],  "video", "v"],
  ["photo.jpg",                  ["Footage", "Day 1"],  "gfx",   "i"],
  ["SFX_door.wav",               ["Sounds"],            "sfx",   "a:3"],
  ["ZOOM0007.wav",               ["Sounds"],            "audio", "a:30"],      // 10..60 s, no hint
  ["Proxies/day1_cam.mp4",       ["Sounds"],            "proxy", "v"],         // by its folder on disk
  ["title.png",                  ["Old stuff"],         "gfx",   "i"],
  ["clip_b.mp4",                 ["Video"],             "video", "v"],         // already in place
  ["clip_c.mp4",                 ["Video", "Selects"],  "video", "v"],         // in place, in the user's own sub-bin
  ["impact_low.wav",             ["Video", "Selects"],  "sfx",   "a:12"],      // wrong bin, "impact"
  ["My Music/untitled_03.wav",   [],                    "music", "a:25"]       // by its folder on disk
];
// bins that exist before the sort and hold no item
const EMPTY_BINS = [["Empty before"]];
// where the default sort must leave every bin that existed
const BINS_AFTER = { kept: [["Video"], ["Video", "Selects"], ["Empty before"]], removed: [["Footage"], ["Footage", "Day 1"], ["Sounds"], ["Old stuff"]] };

// After Effects: the same files (proxies are plain video there, GFX is Images) plus what ae_build.jsx creates
const AE_CAT = { proxy: "video", gfx: "image" };
const AE_EXTRA = {
  "Main Comp": [[], "comp"], "Social Cut": [[], "comp"], "Old Comp": [["Old stuff"], "comp"], "Intro Precomp": [[], "precomp"],
  "Red Solid 1": [["Solids"], "solid"], "Null 1": [["Solids"], "solid"], "Loose Solid": [[], "solid"],
  "Missing shot": [[], "other"], "design Layers": [[], "image"]          // a folder that is sorted whole
};

// DaVinci Resolve: the same files (no proxy category there) plus what dr_build.lua creates
const DR_CAT = { proxy: "video" };
const DR_EXTRA = {
  "Main Edit": [[], "seq"], "Social Cut": [[], "seq"], "FX Shot": [[], "seq"], "Nested Intro": [[], "nested"],
  "Combo": [[], "compound"], "Fusion Clip 1": [[], "fusion"]
};

module.exports = { MEDIA, PROJECT, PROJECT_AE, PROJECT_DR, FILES, EMPTY_BINS, BINS_AFTER, AE_CAT, AE_EXTRA, DR_CAT, DR_EXTRA };
