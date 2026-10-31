-- BinSorter Pro for DaVinci Resolve - the Resolve side.
-- Started by js/dr_link.js as:  fuscript.exe -l lua asb_server.lua   with ASB_DR_DIR set to a private folder.
-- It stays connected to Resolve and answers one command at a time: dr_link.js writes command.lua
-- (a Lua table: id, fn, args), this script writes result.json ({id, ok, data | error}).
-- Deciding what goes where happens in js/core.js; this file only reads the media pool and moves things.

local DIR = os.getenv("ASB_DR_DIR")
local DEV = os.getenv("ASB_DR_DEV") == "1"
if not DIR or DIR == "" then print("ASB_DR_DIR is not set") return end
local CMD, RES = DIR .. "\\command.lua", DIR .. "\\result.json"
local IDLE_QUIT = 120            -- seconds without a command: the panel is gone

resolve = Resolve and Resolve() or (bmd and bmd.scriptapp and bmd.scriptapp("Resolve"))

-- ---------------------------------------------------------------- JSON out

local ARR = {}
local function arr(t) return setmetatable(t or {}, ARR) end       -- an array even when empty
local function esc(s)
    return '"' .. (s:gsub('[%c"\\]', function (c)
        if c == '"' then return '\\"' elseif c == "\\" then return "\\\\" end
        return string.format("\\u%04x", c:byte())
    end)) .. '"'
end
local function enc(v)
    local t = type(v)
    if t == "boolean" then return v and "true" or "false" end
    if t == "number" then
        if v ~= v or v == math.huge or v == -math.huge then return "null" end
        if v == math.floor(v) then return string.format("%d", v) end
        return string.format("%.6f", v)
    end
    if t == "string" then return esc(v) end
    if t == "table" then
        local o = {}
        if getmetatable(v) == ARR or #v > 0 then
            for i = 1, #v do o[i] = enc(v[i]) end
            return "[" .. table.concat(o, ",") .. "]"
        end
        for k, x in pairs(v) do o[#o + 1] = esc(tostring(k)) .. ":" .. enc(x) end
        return "{" .. table.concat(o, ",") .. "}"
    end
    return "null"
end

-- ---------------------------------------------------------------- project

local COLORS = { "Orange", "Apricot", "Yellow", "Lime", "Olive", "Green", "Teal", "Navy", "Blue", "Purple", "Violet", "Pink", "Tan", "Beige", "Brown", "Chocolate" }
local COLOR_INDEX = {}
for i, n in ipairs(COLORS) do COLOR_INDEX[n] = i end

local map = {}       -- unique id -> MediaPoolItem of the last walk
local fmap = {}      -- unique id -> Folder
local list = {}      -- { id, bin } of the last walk, in order
local kids = {}      -- folder id ("" = root) -> { { name, id } } of its sub-bins
local walked = ""    -- project the tables above belong to

local function proj()
    local pm = resolve and resolve:GetProjectManager()
    local p = pm and pm:GetCurrentProject()
    if not p then error("Open a project in DaVinci Resolve", 0) end
    return p, p:GetMediaPool()
end
-- every call that acts on the tables names the project they were built from
local function same(a)
    local p, mp = proj()
    if not a.doc or a.doc ~= walked or p:GetUniqueId() ~= walked then error("The project changed - press Rescan", 0) end
    return p, mp
end

local API = {}

-- cheap look at the tree: how many clips, and a fingerprint of which bin holds how many
local function census(mp)
    local n, h = 0, 7
    local function mix(text) for k = 1, #text do h = (h * 31 + text:byte(k)) % 2147483629 end end
    local function go(folder)
        local c = #(folder:GetClipList() or {})
        n = n + c
        mix(folder:GetUniqueId() .. ":" .. c .. ";")
        for _, f in ipairs(folder:GetSubFolderList() or {}) do go(f) end
    end
    go(mp:GetRootFolder())
    return n, h
end

-- `adds` is what auto-sort watches; it is counted only when asked for (a.auto)
function API.info(a)
    local pm = resolve and resolve:GetProjectManager()
    local p = pm and pm:GetCurrentProject()
    if not p then return { project = false } end
    local id = p:GetUniqueId()
    local out = { project = p:GetName(), path = "resolve:" .. id, doc = id, adds = 0 }
    if a.auto then out.adds = (census(p:GetMediaPool())) end
    return out
end

function API.sig()
    local t0 = os.clock()
    local p, mp = proj()
    local n, h = census(mp)
    return { sig = p:GetUniqueId() .. ":" .. n .. ":" .. h, ms = math.floor((os.clock() - t0) * 1000) }
end

function API.snapBegin()
    local p, mp = proj()
    local bins = arr()
    map, fmap, list, kids = {}, {}, {}, { [""] = {} }
    local function walk(folder, id)
        for _, c in ipairs(folder:GetClipList() or {}) do
            local cid = c:GetUniqueId()
            if cid and not map[cid] then
                map[cid] = c
                list[#list + 1] = { id = cid, bin = (id ~= "" and id or nil) }
            end
        end
        for _, f in ipairs(folder:GetSubFolderList() or {}) do
            local fid, name = f:GetUniqueId(), f:GetName()
            fmap[fid] = f
            kids[id][#kids[id] + 1] = { name = name, id = fid }
            kids[fid] = {}
            bins[#bins + 1] = { id = fid, name = name, parent = (id ~= "" and id or nil), virtual = false }
            walk(f, fid)
        end
    end
    walk(mp:GetRootFolder(), "")
    walked = p:GetUniqueId()
    return { doc = walked, project = p:GetName(), path = "resolve:" .. walked, bins = bins, total = #list, seqs = p:GetTimelineCount() or 0 }
end

-- "00:01:02:12" at fps -> seconds
local function seconds(tc, fps)
    local h, m, s, f = tostring(tc or ""):match("(%d+):(%d+):(%d+)[:;](%d+)")
    if not h then return 0 end
    fps = tonumber(fps) or 0
    return h * 3600 + m * 60 + s + (fps > 0 and f / fps or 0)
end

-- facts about list[from+1 .. from+n] of the last walk
function API.snapChunk(a)
    same(a)
    local out = arr()
    for i = a.from + 1, math.min(#list, a.from + a.n) do
        local c = map[list[i].id]
        local props = c:GetClipProperty() or {}
        local name = props["Clip Name"]
        if not name or name == "" then name = c:GetName() or "" end
        out[#out + 1] = { id = list[i].id, name = name, bin = list[i].bin, type = props["Type"] or "", path = props["File Path"] or "",
            dur = seconds(props["Duration"], props["FPS"]), label = COLOR_INDEX[props["Clip Color"] or ""] or 0 }
    end
    return out
end

-- ids of the timelines that timelines from+1 .. from+n use as clips
function API.nested(a)
    local p = same(a)
    local out, seen = arr(), {}
    for i = a.from + 1, math.min(p:GetTimelineCount() or 0, a.from + a.n) do
        local tl = p:GetTimelineByIndex(i)
        for _, kind in ipairs({ "video", "audio" }) do
            for tr = 1, (tl and tl:GetTrackCount(kind) or 0) do
                for _, it in ipairs(tl:GetItemListInTrack(kind, tr) or {}) do
                    local ok, mpi = pcall(function () return it:GetMediaPoolItem() end)
                    local id = ok and mpi and mpi:GetUniqueId()
                    if id and not seen[id] then
                        seen[id] = true
                        if tostring(mpi:GetClipProperty("Type") or ""):lower():find("timeline", 1, true) then out[#out + 1] = id end
                    end
                end
            end
        end
    end
    return out
end

-- ---------------------------------------------------------------- bins

local function findKid(parentKey, name)
    local l, low = kids[parentKey] or {}, name:lower()
    for _, k in ipairs(l) do if k.name == name then return k.id end end
    for _, k in ipairs(l) do if k.name:lower() == low then return k.id end end
    return nil
end
-- id of the bin at this path of names ("" = root); with `made` (a list) missing bins are created and listed there
local function binAt(mp, path, made)
    local parentKey = ""
    for i = 1, #path do
        local id = findKid(parentKey, path[i])
        if not id then
            if not made then return nil end
            local parent = parentKey == "" and mp:GetRootFolder() or fmap[parentKey]
            local f = mp:AddSubFolder(parent, path[i])
            if not f then error("Cannot create the bin " .. path[i], 0) end
            id = f:GetUniqueId()
            fmap[id] = f
            kids[parentKey][#kids[parentKey] + 1] = { name = path[i], id = id }
            kids[id] = {}
            local p = arr()
            for k = 1, i do p[k] = path[k] end
            made[#made + 1] = p
        end
        parentKey = id
    end
    return parentKey
end

function API.ensureBins(a)
    local _, mp = same(a)
    local out = { bins = arr(), created = arr() }
    for i = 1, #a.paths do
        out.bins[i] = { path = arr(a.paths[i]), id = binAt(mp, a.paths[i], out.created) }
    end
    return out
end

local function setColor(clip, label)
    if type(label) ~= "number" or label < 0 then return end
    if label == 0 then clip:ClearClipColor() elseif COLORS[label] then clip:SetClipColor(COLORS[label]) end
end

-- moves: { {id, bin (bin id) or path ({names}, {} = root), label (-1 = leave, 0 = none)} }
function API.move(a)
    local _, mp = same(a)
    local r = { moved = 0, missing = arr(), failed = arr() }
    local groups, order = {}, {}
    for _, m in ipairs(a.moves) do
        local clip, destKey = map[m.id], nil
        if m.path then destKey = binAt(mp, m.path, nil) else destKey = m.bin or "" end
        local dest = destKey == "" and mp:GetRootFolder() or (destKey and fmap[destKey])
        if not clip or not dest then
            r.missing[#r.missing + 1] = m.id
        else
            if not groups[destKey] then groups[destKey] = { dest = dest, moves = {} }; order[#order + 1] = destKey end
            table.insert(groups[destKey].moves, m)
        end
    end
    -- one call per destination; if Resolve refuses the lot, clip by clip to find the ones it will not move
    for _, key in ipairs(order) do
        local g, clips = groups[key], {}
        for i, m in ipairs(g.moves) do clips[i] = map[m.id] end
        if mp:MoveClips(clips, g.dest) then
            r.moved = r.moved + #clips
            for _, m in ipairs(g.moves) do setColor(map[m.id], m.label) end
        else
            for _, m in ipairs(g.moves) do
                if mp:MoveClips({ map[m.id] }, g.dest) then r.moved = r.moved + 1; setColor(map[m.id], m.label)
                else r.failed[#r.failed + 1] = m.id end
            end
        end
    end
    return r
end

function API.setLabels() return 0 end        -- bins have no colour in the scripting API

local function holdsNothing(f)
    if #(f:GetClipList() or {}) > 0 then return false end
    for _, s in ipairs(f:GetSubFolderList() or {}) do if not holdsNothing(s) then return false end end
    return true
end
-- Deletes bins given by ids or by paths, deepest first, and only those that hold no clip at any depth.
function API.deleteBins(a)
    local _, mp = same(a)
    local ids, r = {}, { deleted = 0, kept = 0 }
    if a.paths then
        table.sort(a.paths, function (x, y) return #x > #y end)
        for _, p in ipairs(a.paths) do local id = binAt(mp, p, nil); if id and id ~= "" then ids[#ids + 1] = id end end
    else
        ids = a.ids or {}
    end
    for _, id in ipairs(ids) do
        local f = fmap[id]
        local ok, empty = pcall(function () return f and holdsNothing(f) end)
        if ok and empty and mp:DeleteFolders({ f }) then r.deleted = r.deleted + 1; fmap[id] = nil else r.kept = r.kept + 1 end
    end
    return r
end

-- Several of the calls above in one go: calls = { {fn, args}, ... }; returns their results in order.
-- The bin that is open in the Media Pool stays open.
function API.batch(a)
    local _, mp = same(a)
    local cur = mp:GetCurrentFolder()
    local out = arr()
    for i, c in ipairs(a.calls) do
        local args = c[2] or {}
        args.doc = a.doc
        out[i] = API[c[1]](args)
    end
    pcall(function () if cur and cur:GetName() then mp:SetCurrentFolder(cur) end end)
    return out
end

-- tests only: run a piece of Lua with resolve and API at hand
if DEV then
    ASB_API = API
    function API.eval(a)
        local fn, err = loadstring(a.code)
        if not fn then error(err, 0) end
        setfenv(fn, getfenv(1))
        return fn()
    end
end

-- ---------------------------------------------------------------- the loop

local function answer(id, ok, payload)
    local f = io.open(RES .. ".tmp", "wb")
    if not f then return end
    f:write(enc(ok and { id = id, ok = true, data = payload } or { id = id, ok = false, error = tostring(payload) }))
    f:close()
    os.remove(RES)
    os.rename(RES .. ".tmp", RES)
end

local last = os.time()
while true do
    local f = io.open(CMD, "rb")
    if f then
        local text = f:read("*a")
        f:close()
        os.remove(CMD)
        last = os.time()
        local chunk = loadstring(text)
        local ok, cmd = pcall(chunk or function () error("bad command") end)
        if ok and type(cmd) == "table" then
            if cmd.fn == "quit" then answer(cmd.id, true, true) break end
            if not API[cmd.fn] then answer(cmd.id, false, "Unknown call " .. tostring(cmd.fn))
            elseif not resolve then answer(cmd.id, false, "DaVinci Resolve is not running")
            else
                local good, data = pcall(API[cmd.fn], cmd.args or {})
                answer(cmd.id, good, data)
            end
        end
    else
        if os.time() - last > IDLE_QUIT then break end
        bmd.wait(0.03)
    end
end
