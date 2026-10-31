// Rebuilds the After Effects test project from nothing. Run by test/ae_setup.js, which sets $.global.ASB_TEST
// = { project, media, files: [[file, [folder path]]], empty: [[folder path]] }. Refuses to touch any other project.
(function () {
    var T = $.global.ASB_TEST, p = app.project, i, j, k, by = {};
    if (!T || !p.file || String(p.file.fsName).toLowerCase() != String(new File(T.project).fsName).toLowerCase()) return "not the test project";

    while (p.numItems > 0) p.item(1).remove();

    function folder(path) {
        var parent = p.rootFolder, found;
        for (k = 0; k < path.length; k++) {
            found = null;
            for (j = 1; j <= parent.numItems; j++) if ((parent.item(j) instanceof FolderItem) && parent.item(j).name == path[k]) found = parent.item(j);
            if (!found) { found = p.items.addFolder(path[k]); found.parentFolder = parent; }
            parent = found;
        }
        return parent;
    }
    function bring(rel) { return p.importFile(new ImportOptions(new File(T.media + "/" + rel))); }

    for (i = 0; i < T.files.length; i++) {
        var it = bring(T.files[i][0]);
        it.parentFolder = folder(T.files[i][1]);
        by[it.name] = it;
    }
    for (i = 0; i < T.empty.length; i++) folder(T.empty[i]);

    // Intro Precomp sits in Main Comp, so it is a precomp; the solid and the null make After Effects' own Solids folder
    var intro = p.items.addComp("Intro Precomp", 1280, 720, 1, 4, 25);
    intro.layers.add(by["clip_b.mp4"]);
    var main = p.items.addComp("Main Comp", 1280, 720, 1, 10, 25);
    main.layers.add(by["clip_a.mp4"]);
    main.layers.add(intro);
    main.layers.addSolid([1, 0, 0], "Red Solid 1", 1280, 720, 1);
    main.layers.addNull();
    var loose = main.layers.addSolid([0, 0, 1], "Loose Solid", 1280, 720, 1);
    loose.source.parentFolder = p.rootFolder;
    p.items.addComp("Social Cut", 1080, 1920, 1, 10, 25).layers.add(by["clip_c.mp4"]);
    p.items.addComp("Old Comp", 1280, 720, 1, 5, 25).parentFolder = folder(["Old stuff"]);
    p.importPlaceholder("Missing shot", 1920, 1080, 25, 2);

    // what a PSD imported as a composition leaves behind: a folder of footage that all comes from one file
    var lay = folder(["design Layers"]), a = bring("logo.png"), b = bring("logo.png");
    a.name = "bg/design.psd"; a.parentFolder = lay;
    b.name = "fg/design.psd"; b.parentFolder = lay;

    for (i = 1; i <= p.numItems; i++) p.item(i).label = (p.item(i) instanceof FolderItem) ? 2 : 0;
    p.save();
    return "built " + p.numItems + " items";
})();
