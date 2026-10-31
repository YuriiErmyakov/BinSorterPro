// Unreal Engine profile: asset rules, the sort folder setting and renamed ids, without the editor.
//   node test/core_ue_test.js
"use strict";
const core = require("../ext/js/core.js").use("ue");

let failed = 0;
function ok(cond, text) { if (!cond) failed++; console.log((cond ? "  ok   " : "  FAIL ") + text); }

const st = core.defaults(), rules = core.rulesOf(st);
const A = (name, cls, anc, more) => Object.assign({ name, cls, anc, path: "", dur: 0 }, more || {});
[
  [A("Lvl_Main", "World", ["Object"]), "map"],
  [A("BP_Door", "Blueprint", ["BlueprintCore", "Object"]), "blueprint"],
  [A("WBP_Menu", "WidgetBlueprint", ["BaseWidgetBlueprint", "Blueprint", "BlueprintCore", "Object"]), "ui"],
  [A("ABP_Hero", "AnimBlueprint", ["Blueprint", "BlueprintCore", "Object"]), "anim"],
  [A("CR_Hero", "ControlRigBlueprint", ["Blueprint", "BlueprintCore", "Object"]), "anim"],
  [A("MM_Run", "AnimSequence", ["AnimSequenceBase", "AnimationAsset", "Object"]), "anim"],
  [A("BS_Walk", "AimOffsetBlendSpace", ["BlendSpace", "AnimationAsset", "Object"]), "anim"],
  [A("SM_Rock", "StaticMesh", ["StreamableRenderAsset", "Object"]), "mesh"],
  [A("SK_Hero", "SkeletalMesh", ["SkinnedAsset", "StreamableRenderAsset", "Object"]), "mesh"],
  [A("MI_Rock", "MaterialInstanceConstant", ["MaterialInstance", "MaterialInterface", "Object"]), "material"],
  [A("MF_Blend", "MaterialFunction", ["MaterialFunctionInterface", "Object"]), "material"],
  [A("T_Rock_D", "Texture2D", ["Texture", "StreamableRenderAsset", "Object"]), "texture"],
  [A("RT_Mirror", "TextureRenderTarget2D", ["TextureRenderTarget", "Texture", "Object"]), "texture"],
  [A("whoosh_01", "SoundWave", ["SoundBase", "Object"], { dur: 1 }), "sfx"],
  [A("Main_Theme", "SoundWave", ["SoundBase", "Object"], { dur: 30 }), "music"],
  [A("long_take", "SoundWave", ["SoundBase", "Object"], { dur: 70 }), "music"],
  [A("Line_017", "SoundWave", ["SoundBase", "Object"], { dur: 20, path: "../../VO/Line_017.wav" }), "audio"],
  [A("SC_Footsteps", "SoundCue", ["SoundBase", "Object"], { path: "" }), "audio"],
  [A("ATT_Default", "SoundAttenuation", ["Object"]), "audio"],
  [A("NS_Sparks", "NiagaraSystem", ["FXSystemAsset", "Object"]), "fx"],
  [A("LS_Intro", "LevelSequence", ["MovieSceneSequence", "MovieSceneSignedObject", "Object"]), "cine"],
  [A("FMS_Clip", "FileMediaSource", ["BaseMediaSource", "MediaSource", "Object"]), "cine"],
  [A("DT_Items", "DataTable", ["Object"]), "data"],
  [A("DA_Weapon", "PDA_Weapon_C", ["PrimaryDataAsset", "DataAsset", "Object"]), "data"],
  [A("IA_Jump", "InputAction", ["DataAsset", "Object"]), "data"],
  [A("BPI_Touch", "Blueprint", ["BlueprintCore", "Object"]), "blueprint"],
  [A("Mystery", "SomethingNew", ["Object"]), "other"]
].forEach(([item, want]) => { const got = core.classify(item, [], rules); ok(got === want, item.name + " (" + item.cls + ") -> " + want + (got === want ? "" : "   got " + got)); });

ok(core.CATS.length === 14 && core.WORD === "folder" && core.HOST === "Unreal Editor", "profile");
ok(st.root === "/Game" && st.scope === "root" && st.cats.map.on === false && st.cats.mesh.on === true, "defaults: /Game, loose assets only, Maps off");
ok(/Developers/.test(st.ignore), "Developers and Collections are left alone by default");
ok(core.labelOf(1)[0] === "Red" && core.labelOf(16)[0] === "White" && core.labelOf(0) === null, "folder colours are numbered from 1");
const n = core.normalize({ root: "Game\\Props/", scope: "all", cats: { map: { on: true } } });
ok(n.root === "/Game/Props" && n.scope === "all" && n.cats.map.on === true, "a saved sort folder is cleaned up, saved choices win over the defaults");
ok(core.normalize({ root: "  " }).root === "/Game", "an empty sort folder falls back to /Game");

(async function () {
  const B = (id, name, parent) => ({ id, name, parent: parent || null, virtual: false });
  const snap = { doc: "P#/Game/T", project: "Proj", bins: [B("/Game/T/Imported", "Imported")],
    items: [{ id: "/Game/T/SM_A", name: "SM_A", cls: "StaticMesh", anc: [], bin: null, label: null },
      { id: "/Game/T/Imported/T_A", name: "T_A", cls: "Texture2D", anc: ["Texture"], bin: "/Game/T/Imported", label: null }] };
  const s = core.defaults();
  s.scope = "all";
  const pl = core.plan(snap, s);
  ok(pl.pending === 2 && pl.emptied.length === 1, "everything inside the folder: both assets move, the emptied folder goes");
  let sent = null;
  const rec = await core.execute((fn, a) => {
    sent = [fn, a];
    return Promise.resolve([{ bins: [], created: [["Meshes"], ["Textures"]] },
      { moved: 2, missing: [], failed: [], ids: { "/Game/T/SM_A": "/Game/T/Meshes/SM_A", "/Game/T/Imported/T_A": "/Game/T/Textures/T_A" } },
      { deleted: 1, kept: 0 }]);
  }, snap, pl, s, {});
  ok(sent[0] === "batch" && sent[1].calls.map(c => c[0]).join() === "ensureBins,move,deleteBins", "a sort is one batch command");
  ok(rec.moves.map(m => m.id).join() === "/Game/T/Meshes/SM_A,/Game/T/Textures/T_A", "the record keeps the new asset paths that Undo needs");
  ok(pl.moves[0].id === "/Game/T/SM_A", "the plan itself is not changed");
  let back = null;
  await core.undo((fn, a) => fn === "snapBegin" ? Promise.resolve({ doc: "P#/Game/T" }) : (back = a, Promise.resolve([{}, { moved: 2, missing: [], failed: [] }])), rec);
  ok(back.calls[1][1].moves.map(m => m.id + ">" + m.path.join("/")).join() === "/Game/T/Meshes/SM_A>,/Game/T/Textures/T_A>Imported", "undo moves them from where they are now back home");
  const r = core.report(rec);
  ok(/Unreal Editor/.test(r) && /Meshes \(1\)/.test(r), "report");
  console.log(failed ? failed + " FAILED" : "all passed");
  process.exit(failed ? 1 : 0);
})();
