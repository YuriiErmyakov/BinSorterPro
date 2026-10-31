// AutoSortBins Pro - everything that needs no host application: categories, rules, the sort plan, the report.
// Loaded by the panel (window.ASBCore) and by node tests (module.exports).
// One file serves Premiere Pro, After Effects and DaVinci Resolve: use("ppro"), use("ae") or use("dr") picks the profile.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.ASBCore = api;
})(this, function () {
"use strict";

function set(text) { var o = {}; text.split(" ").forEach(function (x) { o[x] = true; }); return o; }
var EXT = {
  video: set("mp4 mov mxf avi mkv m4v mpg mpeg mts m2ts m2t m2v mpv wmv webm r3d braw ari crm 3gp 3g2 vob dv flv f4v ogv mod tod"),
  audio: set("wav mp3 aif aiff aac m4a flac ogg oga wma bwf ac3 amr opus caf mka mp2"),
  gfx:   set("png jpg jpeg tif tiff tga psd psb ai eps exr dpx bmp gif webp heic heif svg ico cin dng arw cr2 cr3 nef raf pdf aep aepx prtl"),
  mogrt: set("mogrt aegraphic"),
  model: set("glb gltf obj fbx c4d usd usdz usda usdc")
};

// ---------------------------------------------------------------- names

function low(s) { return String(s).toLowerCase(); }
// "01 Media / Video" -> ["01 Media", "Video"]
function splitPath(text) {
  return String(text).split(/[\/\\]/).map(function (x) { return x.replace(/^\s+|\s+$/g, ""); }).filter(Boolean);
}
function wordList(text) {
  return low(text).split(/[,;\n]+/).map(function (x) { return x.replace(/^\s+|\s+$/g, ""); }).filter(Boolean);
}
function extOf(path) { var m = /\.([A-Za-z0-9]{1,9})$/.exec(path || ""); return m ? low(m[1]) : ""; }
function stem(name) { return String(name).replace(/\.[A-Za-z0-9]{1,9}$/, ""); }
// "MusicBed_final-02" -> music, bed, final, 02
function tokens(text) {
  return low(String(text).replace(/([a-zа-яё0-9])([A-ZА-ЯЁ])/g, "$1 $2")).split(/[^a-zа-яё0-9]+/).filter(Boolean);
}
// length of the longest word found among the tokens; words of 5+ letters also match as a beginning ("whooshes")
function hit(toks, words) {
  var best = 0, i, j, t, w;
  for (i = 0; i < toks.length; i++) {
    t = toks[i];
    for (j = 0; j < words.length; j++) {
      w = words[j];
      if (w.length > best && (t === w || (w.length >= 5 && t.indexOf(w) === 0))) best = w.length;
    }
  }
  return best;
}
function folders(path) {
  var p = String(path || "").split(/[\/\\]/);
  p.pop();
  return p;
}

// ---------------------------------------------------------------- rules

// voice / sfx / music from a text; the longest matching word wins ("soundtrack" beats "sound")
function audioByWords(toks, rules) {
  var v = hit(toks, rules.voice), s = hit(toks, rules.sfx), m = hit(toks, rules.music), top = Math.max(v, s, m);
  if (!top) return null;
  return v === top ? "audio" : s === top ? "sfx" : "music";
}
function audioKind(item, binNames, rules) {
  var k = audioByWords(tokens(stem(item.name)), rules);
  if (k) return k;
  // then the folders on disk (nearest two) and the project bins it sits in
  k = audioByWords(tokens(folders(item.path).slice(-2).join(" ") + " " + binNames.join(" ")), rules);
  if (k) return k;
  if (item.dur > 0) {
    if (rules.sfxMax > 0 && item.dur < rules.sfxMax) return "sfx";
    if (rules.musicMin > 0 && item.dur > rules.musicMin) return "music";
  }
  return "audio";
}
function rulesOf(st) {
  return { sfx: wordList(st.sfxWords), music: wordList(st.musicWords), voice: wordList(st.voiceWords), sfxMax: st.sfxMax, musicMin: st.musicMin };
}

// Premiere item: {name, path, seq, mt (Premiere "Media Type"), dur (seconds)}; snap.nested: sequences used in other ones
function classifyPr(item, binNames, rules, snap) {
  if (item.seq) return snap && snap.nested && snap.nested[item.id] ? "nested" : "seq";
  var path = item.path || "", ext = extOf(path) || extOf(item.name), mt = low(item.mt || "");
  if (EXT.mogrt[ext] || /motion graphics template media/i.test(path) ||
      binNames.some(function (b) { return /^motion graphics template media$/i.test(b); })) return "mogrt";
  if (/(^|[ _.\-])prox(y|ies)($|[ _.\-])/i.test(stem(item.name)) ||
      folders(path).some(function (f) { return /^prox(y|ies)$/i.test(f); })) return "proxy";
  var kind = EXT.video[ext] ? "video" : EXT.audio[ext] ? "audio" : EXT.gfx[ext] ? "gfx" : "";
  if (kind === "video" && mt === "audio") kind = "audio";            // an .mxf or .mov that carries sound only
  if (!kind) {
    if (mt === "audio") kind = "audio";
    else if (mt === "video" || mt === "movie") kind = "video";
    else if (mt === "still image" || !path) kind = "gfx";            // mattes, black video and the like have no file
  }
  if (kind === "audio") return audioKind(item, binNames, rules);
  return kind || "other";
}

// After Effects item: {name, kind: comp | footage | other, used (comps it sits in), solid, placeholder, path, still, hasVideo, hasAudio, dur}
function classifyAe(item, binNames, rules) {
  if (item.kind === "comp") return item.used > 0 ? "precomp" : "comp";
  if (item.kind !== "footage" || item.placeholder) return "other";
  if (item.solid) return "solid";
  var ext = extOf(item.path) || extOf(item.name);
  if (EXT.model[ext]) return "model";
  if (item.hasVideo) return item.still ? "image" : "video";          // an image sequence is moving footage
  if (item.hasAudio) return audioKind(item, binNames, rules);
  if (EXT.video[ext]) return "video";                                // no streams known: go by the file name
  if (EXT.audio[ext]) return audioKind(item, binNames, rules);
  if (EXT.gfx[ext]) return "image";
  return "other";                                                    // data files and the like
}

// DaVinci Resolve item: {name, type (the Media Pool "Type": Video, Video + Audio, Audio, Still, Timeline, Compound, Fusion...), path, dur}
function classifyDr(item, binNames, rules, snap) {
  var t = low(item.type || ""), ext = extOf(item.path) || extOf(item.name);
  if (t.indexOf("timeline") >= 0) return snap && snap.nested && snap.nested[item.id] ? "nested" : "seq";
  if (t.indexOf("compound") >= 0 || t.indexOf("multicam") >= 0) return "compound";
  if (t.indexOf("subtitle") >= 0) return "other";
  if (t.indexOf("fusion") >= 0 || t.indexOf("generator") >= 0 || t.indexOf("title") >= 0) return "fusion";
  if (t === "audio") return audioKind(item, binNames, rules);
  if (t.indexOf("still") >= 0) return "gfx";
  if (t.indexOf("video") >= 0) return "video";
  if (EXT.video[ext]) return "video";                                // an unknown type: go by the file name
  if (EXT.audio[ext]) return audioKind(item, binNames, rules);
  if (EXT.gfx[ext]) return "gfx";
  return "other";                                                    // subtitles and the like
}

// Unreal Engine asset: {name, cls (asset class), anc ([its parent classes]), path (source file), dur (sound length)}
// The first rule whose class is the asset's class or one of its parents wins, so the order matters:
// an Animation Blueprint is a Blueprint too, and goes to Animations.
var UE_RULES = [
  ["map",      "World"],
  ["ui",       "WidgetBlueprint EditorUtilityWidgetBlueprint Font FontFace SlateBrushAsset SlateWidgetStyleAsset"],
  ["anim",     "AnimBlueprint AnimationAsset ControlRigBlueprint IKRigDefinition IKRetargeter AnimBoneCompressionSettings AnimCurveCompressionSettings MirrorDataTable"],
  ["fx",       "NiagaraSystem NiagaraEmitter NiagaraScript NiagaraParameterCollection NiagaraParameterCollectionInstance NiagaraEffectType ParticleSystem VectorField"],
  ["cine",     "MovieSceneSequence CameraAnimationSequence MediaSource MediaPlayer MediaPlaylist"],
  ["blueprint","Blueprint BlueprintFunctionLibrary BlueprintMacroLibrary"],
  ["mesh",     "StaticMesh SkeletalMesh Skeleton PhysicsAsset GeometryCollection DestructibleMesh"],
  ["material", "MaterialInterface MaterialFunctionInterface MaterialParameterCollection PhysicalMaterial SubsurfaceProfile SpecularProfile"],
  ["texture",  "Texture"],
  ["sound",    "SoundBase"],
  ["audio",    "SoundAttenuation SoundClass SoundMix SoundConcurrency SoundSubmixBase ReverbEffect SoundEffectPreset"],
  ["data",     "DataTable CurveTable CurveBase DataAsset UserDefinedStruct UserDefinedEnum StringTable InputAction InputMappingContext PlayerMappableInputConfig"]
].map(function (r) { return [r[0], set(r[1])]; });
function classifyUe(item, binNames, rules) {
  var cls = [item.cls].concat(item.anc || []), i, j;
  for (i = 0; i < UE_RULES.length; i++) {
    for (j = 0; j < cls.length; j++) {
      if (!UE_RULES[i][1][cls[j]]) continue;
      if (UE_RULES[i][0] === "sound") return audioKind(item, binNames, rules);   // sound waves, cues, MetaSounds
      return UE_RULES[i][0];
    }
  }
  return "other";
}

// ---------------------------------------------------------------- the hosts

function index(cats) { var o = {}; cats.forEach(function (c) { o[c.id] = c; }); return o; }
var PROFILES = {
  ppro: {
    app: "ppro", host: "Premiere Pro", word: "bin", batch: false, unitCat: null, classify: classifyPr,
    // label = a Premiere label colour (default preference names below), used only with "Color labels" on
    cats: [
      { id: "video",  bin: "Video",            color: "#3BA7F5", label: 9,  desc: "Video files" },
      { id: "audio",  bin: "Audio",            color: "#F5B82E", label: 5,  desc: "Voice, dialogue and any audio that is not music or SFX" },
      { id: "music",  bin: "Music",            color: "#FF8A3D", label: 2,  desc: "Audio named like music, or long audio" },
      { id: "sfx",    bin: "SFX",              color: "#F26D8F", label: 7,  desc: "Audio named like sound effects, or short audio" },
      { id: "gfx",    bin: "GFX",              color: "#3DCB6C", label: 3,  desc: "Stills, layered files, mattes, black video, AE comps" },
      { id: "mogrt",  bin: "Mogrt",            color: "#A77BFF", label: 0,  desc: "Motion Graphics templates" },
      { id: "proxy",  bin: "Proxies",          color: "#8FA3C4", label: 12, desc: "Files named *_Proxy or kept in a Proxies folder" },
      { id: "seq",    bin: "Sequences",        color: "#35D0C4", label: 6,  desc: "Sequences that are not used inside other sequences" },
      { id: "nested", bin: "Nested Sequences", color: "#2FA0B8", label: 11, desc: "Sequences placed as clips in other sequences" },
      { id: "other",  bin: "Other",            color: "#6C7B96", label: 14, desc: "Everything else" }
    ],
    labelBase: 0,             // value of the first entry below
    labels: [
      ["Violet", "#A690E0"], ["Iris", "#729ACC"], ["Caribbean", "#29D698"], ["Lavender", "#E384E3"],
      ["Cerulean", "#2FBFDE"], ["Forest", "#51B858"], ["Rose", "#F76FA4"], ["Mango", "#EDA63B"],
      ["Purple", "#B04DF5"], ["Blue", "#3A6FE8"], ["Teal", "#1E9C8E"], ["Magenta", "#E33BC6"],
      ["Tan", "#D6C296"], ["Green", "#3E8E41"], ["Brown", "#9A6A3A"], ["Yellow", "#E5D52B"]
    ]
  },
  ae: {
    // batch: a sort is one host call inside one undo group, so Edit > Undo takes it back in one step.
    // unitCat: a folder of layers from one layered file (a PSD or AI imported as a comp) moves whole, as this category.
    app: "ae", host: "After Effects", word: "folder", batch: true, unitCat: "image", classify: classifyAe,
    cats: [
      { id: "comp",    bin: "Comps",    color: "#A77BFF", label: 8,  desc: "Compositions that are not used inside other comps" },
      { id: "precomp", bin: "Precomps", color: "#7F8CFF", label: 14, desc: "Compositions used as layers in other comps" },
      { id: "video",   bin: "Video",    color: "#3BA7F5", label: 3,  desc: "Video files and image sequences" },
      { id: "image",   bin: "Images",   color: "#3DCB6C", label: 5,  desc: "Stills, vector files and the layer folders of PSD and AI files" },
      { id: "audio",   bin: "Audio",    color: "#F5B82E", label: 9,  desc: "Voice, dialogue and any audio that is not music or SFX" },
      { id: "music",   bin: "Music",    color: "#FF8A3D", label: 16, desc: "Audio named like music, or long audio" },
      { id: "sfx",     bin: "SFX",      color: "#F26D8F", label: 11, desc: "Audio named like sound effects, or short audio" },
      { id: "solid",   bin: "Solids",   color: "#E8615A", label: 1,  desc: "Solids, nulls and adjustment layer sources" },
      { id: "model",   bin: "3D",       color: "#35D0C4", label: 13, desc: "3D models: GLB, GLTF, OBJ, FBX, C4D, USD" },
      { id: "other",   bin: "Other",    color: "#6C7B96", label: 15, desc: "Data files, placeholders and everything else" }
    ],
    labelBase: 1,             // label 0 is None in After Effects
    labels: [
      ["Red", "#B53838"], ["Yellow", "#E4D84C"], ["Aqua", "#A9CBC7"], ["Pink", "#E5BCC9"],
      ["Lavender", "#A9A9CA"], ["Peach", "#E7C19E"], ["Sea Foam", "#B3C7B3"], ["Blue", "#677DE0"],
      ["Green", "#4AA44C"], ["Purple", "#8E2C9A"], ["Orange", "#E8920D"], ["Brown", "#7F452A"],
      ["Fuchsia", "#F46DD6"], ["Cyan", "#3DA2A5"], ["Sandstone", "#A89677"], ["Dark Green", "#1E401E"]
    ]
  }
};
PROFILES.dr = {
  // batch: a sort is one command to Resolve. Labels are clip colours; bins have none.
  app: "dr", host: "DaVinci Resolve", word: "bin", batch: true, unitCat: null, classify: classifyDr,
  cats: [
    { id: "video",    bin: "Video",            color: "#3BA7F5", label: 9,  desc: "Video clips and image sequences" },
    { id: "audio",    bin: "Audio",            color: "#F5B82E", label: 6,  desc: "Voice, dialogue and any audio that is not music or SFX" },
    { id: "music",    bin: "Music",            color: "#FF8A3D", label: 7,  desc: "Audio named like music, or long audio" },
    { id: "sfx",      bin: "SFX",              color: "#F26D8F", label: 1,  desc: "Audio named like sound effects, or short audio" },
    { id: "gfx",      bin: "GFX",              color: "#3DCB6C", label: 4,  desc: "Stills and graphics" },
    { id: "seq",      bin: "Timelines",        color: "#35D0C4", label: 12, desc: "Timelines that are not used inside other timelines" },
    { id: "nested",   bin: "Nested Timelines", color: "#2FA0B8", label: 8,  desc: "Timelines placed as clips in other timelines" },
    { id: "compound", bin: "Compound Clips",   color: "#7F8CFF", label: 10, desc: "Compound and multicam clips" },
    { id: "fusion",   bin: "Fusion",           color: "#A77BFF", label: 11, desc: "Fusion compositions, generators and titles" },
    { id: "other",    bin: "Other",            color: "#6C7B96", label: 15, desc: "Subtitles and everything else" }
  ],
  labelBase: 1,               // 0 = no clip colour
  labels: [
    ["Orange", "#EB6E01"], ["Apricot", "#FFA833"], ["Yellow", "#E2A91C"], ["Lime", "#9FC615"],
    ["Olive", "#5E9923"], ["Green", "#448F65"], ["Teal", "#00987F"], ["Navy", "#15627B"],
    ["Blue", "#4376A1"], ["Purple", "#996EB7"], ["Violet", "#D0568D"], ["Pink", "#E98CB5"],
    ["Tan", "#B9AF97"], ["Beige", "#C4A07C"], ["Brown", "#996601"], ["Chocolate", "#8C5A3F"]
  ]
};
PROFILES.ue = {
  // batch: a sort is one command to the editor. "Bins" are Content Browser folders inside the sort folder (settings.root);
  // moving an asset renames it, so the host answers with the new ids. Labels are folder colours; assets have none.
  // Category colours follow the asset type colours of the Unreal Content Browser.
  app: "ue", host: "Unreal Editor", word: "folder", batch: true, unitCat: null, classify: classifyUe,
  cats: [
    { id: "map",       bin: "Maps",       color: "#E86A3A", label: 2,  on: false, desc: "Levels. Off by default: moving a World Partition map also moves its external actors" },
    { id: "blueprint", bin: "Blueprints", color: "#4D8DF7", label: 9,  desc: "Blueprint classes, function and macro libraries" },
    { id: "ui",        bin: "UI",         color: "#8C6CF0", label: 10, desc: "Widget Blueprints, fonts, Slate brushes and styles" },
    { id: "mesh",      bin: "Meshes",     color: "#2EC4D6", label: 7,  desc: "Static and skeletal meshes, skeletons, physics assets" },
    { id: "material",  bin: "Materials",  color: "#5BC254", label: 5,  desc: "Materials, instances, functions, parameter collections, physical materials" },
    { id: "texture",   bin: "Textures",   color: "#D9534F", label: 1,  desc: "Textures, cubemaps, render targets" },
    { id: "anim",      bin: "Animations", color: "#4FB3A0", label: 6,  desc: "Animation sequences, montages, blend spaces, Anim Blueprints, Control Rigs, IK Rigs" },
    { id: "audio",     bin: "Audio",      color: "#C9A227", label: 3,  desc: "Voice, dialogue, sound settings and any sound that is not music or SFX" },
    { id: "music",     bin: "Music",      color: "#E0913A", label: 2,  desc: "Sounds named like music, or long sound waves" },
    { id: "sfx",       bin: "SFX",        color: "#E06A9A", label: 13, desc: "Sounds named like sound effects, or short sound waves" },
    { id: "fx",        bin: "FX",         color: "#C05BD6", label: 12, desc: "Niagara systems, emitters and scripts, Cascade particles" },
    { id: "cine",      bin: "Cinematics", color: "#9AA9C0", label: 8,  desc: "Level Sequences, camera animations, media sources and players" },
    { id: "data",      bin: "Data",       color: "#B5A27A", label: 14, desc: "Data tables, curves, data assets, structs, enums, string tables, input actions" },
    { id: "other",     bin: "Other",      color: "#7A7F87", label: 15, desc: "Everything else" }
  ],
  extra: {
    root: "/Game",            // the folder that is sorted; category folders are made inside it
    scope: "root",            // a whole Unreal project is usually laid out by hand: only loose assets by default
    ignore: "Developers, Collections"
  },
  labelBase: 1,               // 0 = no folder colour
  labels: [
    ["Red", "#D9534F"], ["Orange", "#E8873A"], ["Yellow", "#E3C34A"], ["Lime", "#9BCB3B"],
    ["Green", "#5BC254"], ["Teal", "#4FB3A0"], ["Cyan", "#2EC4D6"], ["Steel", "#9AA9C0"],
    ["Blue", "#4D8DF7"], ["Violet", "#8C6CF0"], ["Purple", "#A65BD6"], ["Magenta", "#C05BD6"],
    ["Pink", "#E06A9A"], ["Sand", "#B5A27A"], ["Grey", "#7A7F87"], ["White", "#E2E4E8"]
  ]
};
var P = PROFILES.ppro, api = {};
function use(app) {
  P = PROFILES[app] || PROFILES.ppro;
  api.APP = P.app; api.HOST = P.host; api.WORD = P.word;
  api.CATS = P.cats; api.CAT = index(P.cats); api.LABELS = P.labels; api.LABEL_BASE = P.labelBase;
  return api;
}
// [name, colour] of a label value, or null
function labelOf(value) { return value === null || value === undefined ? null : P.labels[value - P.labelBase] || null; }

// the SFX list of version 1.0: it had "звук" (any sound at all), which sent whole audio tracks to SFX
var SFX_WORDS_1_0 = "sfx, fx, foley, whoosh, swoosh, swish, impact, hit, riser, boom, click, pop, ding, beep, glitch, stinger, ambience, ambient, atmo, звук, звуки, эффект, вжух";
function defaults() {
  var cats = {};
  P.cats.forEach(function (c) { cats[c.id] = { on: c.on !== false, bin: c.bin, label: c.label }; });
  var d = {
    cats: cats,
    scope: "all",             // "all" = the whole project, "root" = only loose items in the project root
    removeEmpty: true,        // delete bins the sort has emptied
    labels: false,            // colour-label what gets sorted
    sfxMax: 10,               // audio shorter than this many seconds is SFX when its name says nothing (0 = off)
    musicMin: 60,             // audio longer than this is music when its name says nothing (0 = off)
    sfxWords: "sfx, fx, foley, whoosh, swoosh, swish, impact, hit, riser, boom, click, pop, ding, beep, glitch, stinger, ambience, ambient, atmo, эффект, вжух",
    musicWords: "music, song, track, bgm, score, soundtrack, theme, instrumental, beat, ost, jingle, музыка, трек, песня, саундтрек",
    voiceWords: "vo, voice, voiceover, dialog, dialogue, interview, narration, speech, podcast, голос, озвучка, диктор, интервью",
    ignore: "",               // bin names the sort never touches, comma-separated
    autoFor: {},              // projects with auto-sort on: project key -> when it was switched on
    interval: 15              // seconds between auto-sort checks
  };
  for (var k in P.extra || {}) d[k] = P.extra[k];
  return d;
}
// "/Game/Props/" or "Game\Props" -> "/Game/Props"
function rootPath(text) {
  var p = splitPath(text);
  return p.length ? "/" + p.join("/") : "/Game";
}

// saved settings over the defaults, so that new options and categories appear in old files
function normalize(saved) {
  var d = defaults(), k;
  if (!saved || typeof saved !== "object") return d;
  for (k in d) if (k !== "cats" && saved[k] !== undefined && typeof saved[k] === typeof d[k]) d[k] = saved[k];
  P.cats.forEach(function (c) {
    var s = saved.cats && saved.cats[c.id];
    if (!s) return;
    if (typeof s.on === "boolean") d.cats[c.id].on = s.on;
    if (typeof s.bin === "string" && splitPath(s.bin).length) d.cats[c.id].bin = s.bin;
    if (s.label === null || (typeof s.label === "number" && labelOf(s.label))) d.cats[c.id].label = s.label;
  });
  if (d.sfxWords === SFX_WORDS_1_0) d.sfxWords = defaults().sfxWords;       // untouched old default: take the new one
  d.interval = Math.max(3, Math.min(3600, Math.round(d.interval) || 15));
  d.sfxMax = Math.max(0, d.sfxMax || 0);
  d.musicMin = Math.max(0, d.musicMin || 0);
  if (d.scope !== "root") d.scope = "all";
  if (typeof d.root === "string") d.root = rootPath(d.root);
  // auto-sort is remembered per project; the 40 most recent stay
  var keys = Object.keys(d.autoFor).filter(function (k) { return typeof d.autoFor[k] === "number"; });
  keys.sort(function (a, b) { return d.autoFor[b] - d.autoFor[a]; });
  var kept = {};
  keys.slice(0, 40).forEach(function (k) { kept[k] = d.autoFor[k]; });
  d.autoFor = kept;
  return d;
}

// ---------------------------------------------------------------- plan

function startsWith(path, head) {
  if (head.length > path.length) return false;
  for (var i = 0; i < head.length; i++) if (path[i] !== head[i]) return false;
  return true;
}

// snap: {bins:[{id,name,parent,virtual,unit,label}], items:[{id,name,bin,label,...}], nested:{id:true}}
// A bin marked `unit` is sorted as one thing; the host does not list what is inside it.
function plan(snap, st) {
  var bins = {}, names = {}, rules = rulesOf(st), ignore = {};
  snap.bins.forEach(function (b) { bins[b.id] = b; });
  wordList(st.ignore).forEach(function (w) { ignore[w] = true; });

  function namesOf(binId) {                       // bin names from the root down to this bin
    if (!binId) return [];
    if (names[binId]) return names[binId];
    var b = bins[binId], p = b ? namesOf(b.parent).concat([b.name]) : [];
    names[binId] = p;
    return p;
  }
  function ignored(path) { return path.some(function (n) { return ignore[low(n)]; }); }

  var target = {}, targetLow = {}, counts = {};
  P.cats.forEach(function (c) {
    target[c.id] = splitPath(st.cats[c.id].bin);
    if (!target[c.id].length) target[c.id] = [c.bin];
    targetLow[c.id] = target[c.id].map(low);
    counts[c.id] = { total: 0, pending: 0 };
  });

  var things = snap.items.slice();
  snap.bins.forEach(function (b) { if (b.unit && P.unitCat) things.push({ id: b.id, name: b.name, bin: b.parent, label: b.label, unit: true }); });

  var out = { moves: [], counts: counts, total: things.length, pending: 0, skipped: 0, target: target, emptied: [], removed: [] };
  things.forEach(function (it) {
    var path = namesOf(it.bin), cat = it.unit ? P.unitCat : P.classify(it, path, rules, snap);
    counts[cat].total++;
    if (ignored(it.unit ? path.concat([it.name]) : path)) { out.skipped++; return; }
    if (!st.cats[cat].on) return;
    if (st.scope === "root" && it.bin) return;
    var lp = path.map(low), mine = targetLow[cat];
    if (startsWith(lp, mine)) {
      // already under its bin, unless it sits in another category's bin nested inside ("Audio/SFX" within "Audio")
      var deeper = P.cats.some(function (c) { return c.id !== cat && targetLow[c.id].length > mine.length && startsWith(lp, targetLow[c.id]); });
      if (!deeper) return;
    }
    counts[cat].pending++;
    out.moves.push({ id: it.id, name: it.name, cat: cat, from: path, fromId: it.bin || null, to: target[cat], label: it.label, folder: !!it.unit });
  });
  out.pending = out.moves.length;

  if (st.removeEmpty && out.moves.length) {
    var left = {}, had = {}, keep = {};
    things.forEach(function (it) { for (var b = it.bin; b && bins[b]; b = bins[b].parent) { left[b] = (left[b] || 0) + 1; had[b] = true; } });
    out.moves.forEach(function (m) { for (var b = m.fromId; b && bins[b]; b = bins[b].parent) left[b]--; });
    // never the category bins themselves, nor what leads to them, nor ignored bins
    snap.bins.forEach(function (b) {
      var lp = namesOf(b.id).map(low);
      if (b.virtual || ignored(namesOf(b.id))) keep[b.id] = true;
      P.cats.forEach(function (c) { if (startsWith(targetLow[c.id], lp)) keep[b.id] = true; });
    });
    var gone = {};
    snap.bins.forEach(function (b) { if (had[b.id] && !left[b.id] && !keep[b.id] && !b.unit) gone[b.id] = true; });
    // a kept bin inside (a search bin, an ignored bin) keeps every bin above it
    snap.bins.forEach(function (b) { if (keep[b.id]) for (var p = b.parent; p && bins[p]; p = bins[p].parent) delete gone[p]; });
    snap.bins.forEach(function (b) {
      var top = null;
      if (b.unit) return;                            // it has moved away, it is not deleted
      for (var p = b.id; p && bins[p]; p = bins[p].parent) if (gone[p]) top = p;
      if (!top) return;
      out.removed.push(namesOf(b.id));               // every bin that disappears, for undo
      if (top === b.id) out.emptied.push(b.id);      // only the topmost ones are deleted explicitly
    });
  }
  return out;
}

// ---------------------------------------------------------------- talking to the host

// call(fn, args) -> Promise; progress(done, total)
function collect(call, progress) {
  return call("snapBegin").then(function (head) {
    var items = [], nested = {}, STEP = 120, seqAt = 0;
    function nextItems() {
      if (items.length >= head.total) return null;
      return call("snapChunk", { doc: head.doc, from: items.length, n: STEP }).then(function (part) {
        if (!part.length) { head.total = items.length; return null; }
        items = items.concat(part);
        if (progress) progress(items.length, head.total);
        return nextItems();
      });
    }
    function nextSeqs() {                           // Premiere only: which sequences are nested
      if (!(seqAt < head.seqs)) return null;
      var from = seqAt;
      seqAt += 4;
      return call("nested", { doc: head.doc, from: from, n: 4 }).then(function (ids) {
        ids.forEach(function (id) { nested[id] = true; });
        return nextSeqs();
      });
    }
    return Promise.resolve(nextItems()).then(nextSeqs).then(function () {
      return { doc: head.doc, project: head.project, path: head.path, bins: head.bins, items: items, nested: nested };
    });
  });
}

function key(path) { return path.map(low).join("/"); }
function uniquePaths(list) {
  var seen = {}, out = [];
  list.forEach(function (p) { var k = key(p); if (p.length && !seen[k]) { seen[k] = true; out.push(p); } });
  return out;
}
function inChunks(list, size, fn) {
  var at = 0;
  function next() {
    if (at >= list.length) return Promise.resolve();
    var part = list.slice(at, at + size);
    at += part.length;
    return Promise.resolve(fn(part, at)).then(next);
  }
  return next();
}
function labelFor(st, cat) { var lab = st.labels ? st.cats[cat].label : null; return lab === null ? -1 : lab; }
function keepMoved(rec, part, res) {
  var bad = {};
  res.missing.concat(res.failed).forEach(function (id) { bad[id] = true; });
  part.forEach(function (m) {
    if (bad[m.id]) { rec.failed++; return; }
    var now = res.ids && res.ids[m.id], c, k;        // Unreal: a moved asset has a new path, which Undo needs
    if (now) { c = {}; for (k in m) c[k] = m[k]; c.id = now; m = c; }
    rec.moves.push(m);
  });
}

// carries out a plan; resolves to the record that Undo and the report use
function execute(call, snap, pl, st, opts) {
  opts = opts || {};
  var rec = { t: opts.time || Date.now(), auto: !!opts.auto, project: snap.project, labels: !!st.labels,
    moves: [], created: [], removed: pl.removed, failed: 0 };
  if (!pl.moves.length) return Promise.resolve(rec);
  var ids = {}, doc = snap.doc, paths = uniquePaths(pl.moves.map(function (m) { return m.to; }));

  if (P.batch) {
    // new category bins take the colour of their category: the host labels the ones it creates
    var labs = paths.map(function (p) {
      var c = P.cats.filter(function (c) { return key(pl.target[c.id]) === key(p); })[0];
      return c ? labelFor(st, c.id) : -1;
    });
    var calls = [
      ["ensureBins", { paths: paths, labels: labs }],
      ["move", { moves: pl.moves.map(function (m) { return { id: m.id, path: m.to, label: labelFor(st, m.cat) }; }) }]
    ];
    if (pl.emptied.length) calls.push(["deleteBins", { ids: pl.emptied }]);
    return call("batch", { doc: doc, name: "AutoSortBins Sort", calls: calls }).then(function (r) {
      rec.created = r[0].created;
      keepMoved(rec, pl.moves, r[1]);
      if (!r[2] || !r[2].deleted) rec.removed = [];
      return rec;
    });
  }

  return call("ensureBins", { doc: doc, paths: paths }).then(function (r) {
    r.bins.forEach(function (b) { ids[key(b.path)] = b.id; });
    rec.created = r.created;
    return inChunks(pl.moves, 80, function (part, done) {
      var send = part.map(function (m) { return { id: m.id, bin: ids[key(m.to)], label: labelFor(st, m.cat) }; });
      return call("move", { doc: doc, moves: send }).then(function (res) {
        keepMoved(rec, part, res);
        if (opts.progress) opts.progress(done, pl.moves.length);
      });
    });
  }).then(function () {
    if (!st.labels || !rec.created.length) return null;
    var labs = [];
    P.cats.forEach(function (c) {
      var k = key(pl.target[c.id]), made = rec.created.some(function (p) { return key(p) === k; });
      if (made && ids[k] && st.cats[c.id].label !== null) labs.push({ id: ids[k], label: st.cats[c.id].label });
    });
    return labs.length ? call("setLabels", { doc: doc, items: labs }) : null;
  }).then(function () {
    if (!pl.emptied.length) { rec.removed = []; return null; }
    return call("deleteBins", { doc: doc, ids: pl.emptied }).then(function (r) { if (!r.deleted) rec.removed = []; });
  }).then(function () { return rec; });
}

// puts everything from a record back where it was
function undo(call, rec, progress) {
  var out = { moved: 0, missing: 0 };
  return call("snapBegin").then(function (head) {
    var doc = head.doc, ids = {};
    var back = uniquePaths(rec.moves.map(function (m) { return m.from; }).concat(rec.removed || []));
    function label(m) { return rec.labels && m.label >= 0 ? m.label : -1; }

    if (P.batch) {
      var calls = [
        ["ensureBins", { paths: back }],
        ["move", { moves: rec.moves.map(function (m) { return { id: m.id, path: m.from, label: label(m) }; }) }]
      ];
      if (rec.created && rec.created.length) calls.push(["deleteBins", { paths: rec.created }]);
      return call("batch", { doc: doc, name: "AutoSortBins Undo", calls: calls }).then(function (r) {
        out.moved = r[1].moved;
        out.missing = r[1].missing.length + r[1].failed.length;
        return out;
      });
    }

    return call("ensureBins", { doc: doc, paths: back }).then(function (r) {
      r.bins.forEach(function (b) { ids[key(b.path)] = b.id; });
      return inChunks(rec.moves, 80, function (part, done) {
        var send = part.map(function (m) { return { id: m.id, bin: m.from.length ? ids[key(m.from)] : null, label: label(m) }; });
        return call("move", { doc: doc, moves: send }).then(function (res) {
          out.moved += res.moved;
          out.missing += res.missing.length + res.failed.length;
          if (progress) progress(done, rec.moves.length);
        });
      });
    }).then(function () {
      // the bins the sort created go away again if nothing else was put into them
      return rec.created && rec.created.length ? call("deleteBins", { doc: doc, paths: rec.created }) : null;
    }).then(function () { return out; });
  });
}

// ---------------------------------------------------------------- report

function pad(n) { return (n < 10 ? "0" : "") + n; }
function stamp(t) {
  var d = new Date(t);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}
function where(path) { return path && path.length ? path.join("/") : P.app === "ue" ? "(sort folder)" : "(project root)"; }
function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

// rec: a sort record, or a plan turned into one by preview()
function report(rec) {
  var L = [], by = {}, bins = {}, W = P.word;
  rec.moves.forEach(function (m) { (by[m.cat] = by[m.cat] || []).push(m); bins[key(m.to)] = true; });
  L.push("AutoSortBins Pro for " + P.host + " - " + (rec.preview ? "sort preview (nothing has been moved)" : "sort report"));
  L.push("Project: " + (rec.project || ""));
  L.push("Date:    " + stamp(rec.t));
  if (!rec.preview) L.push("Mode:    " + (rec.auto ? "auto-sort" : "Sort now"));
  L.push((rec.preview ? "To move: " : "Moved:   ") + plural(rec.moves.length, "item") + " into " + plural(Object.keys(bins).length, W));
  if (rec.failed) L.push("Failed:  " + plural(rec.failed, "item") + " could not be moved");
  P.cats.forEach(function (c) {
    var list = by[c.id];
    if (!list) return;
    L.push("");
    L.push(where(list[0].to) + " (" + list.length + ")");
    list.slice().sort(function (a, b) { return low(a.name) < low(b.name) ? -1 : 1; }).forEach(function (m) {
      L.push("  " + m.name + (m.folder ? " [" + W + "]" : "") + "   <- " + where(m.from));
    });
  });
  if (rec.created && rec.created.length) { L.push(""); L.push("New " + W + "s: " + rec.created.map(where).join(", ")); }
  if (rec.removed && rec.removed.length) { L.push(""); L.push("Empty " + W + "s removed: " + rec.removed.map(where).join(", ")); }
  return L.join("\r\n") + "\r\n";
}
function preview(snap, pl) {
  return { t: Date.now(), preview: true, project: snap.project, moves: pl.moves, created: [], removed: pl.removed, failed: 0 };
}

api.rootPath = rootPath; api.use = use; api.labelOf = labelOf; api.defaults = defaults; api.normalize = normalize; api.splitPath = splitPath; api.tokens = tokens;
api.classify = function (item, binNames, rules, snap) { return P.classify(item, binNames, rules, snap); };
api.rulesOf = rulesOf; api.plan = plan; api.collect = collect; api.execute = execute; api.undo = undo;
api.report = report; api.preview = preview; api.stamp = stamp; api.where = where; api.plural = plural;
return use("ppro");
});
