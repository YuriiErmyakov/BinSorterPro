-- Rebuilds the DaVinci Resolve test project from nothing. Run by test/dr_setup.js, which puts a table T in front:
-- T = { name, media, files = { {file, {bin path}} }, empty = { {bin path} } }. Refuses to touch any other project.
local pm = resolve:GetProjectManager()
local p = pm:GetCurrentProject()
if not p or p:GetName() ~= T.name then return "not the test project" end
local mp = p:GetMediaPool()
local root = mp:GetRootFolder()
local log = {}

-- empty it: timelines, bins with all they hold, loose clips
local tls = {}
for i = 1, p:GetTimelineCount() do tls[#tls + 1] = p:GetTimelineByIndex(i) end
if #tls > 0 then mp:DeleteTimelines(tls) end
local subs = root:GetSubFolderList()
if #subs > 0 then mp:DeleteFolders(subs) end
local loose = root:GetClipList()
if #loose > 0 then mp:DeleteClips(loose) end

local function folder(path)
    local parent = root
    for _, name in ipairs(path) do
        local found = nil
        for _, f in ipairs(parent:GetSubFolderList()) do if f:GetName() == name then found = f end end
        parent = found or mp:AddSubFolder(parent, name)
    end
    return parent
end

local by = {}
for _, f in ipairs(T.files) do
    mp:SetCurrentFolder(root)
    local got = mp:ImportMedia({ T.media .. "\\" .. f[1]:gsub("/", "\\") })
    local item = got and got[1]
    if item then
        by[item:GetName()] = item
        if #f[2] > 0 then mp:MoveClips({ item }, folder(f[2])) end
    else
        log[#log + 1] = "import failed: " .. f[1]
    end
end
for _, path in ipairs(T.empty) do folder(path) end
mp:SetCurrentFolder(root)

-- Nested Intro sits inside Main Edit; Social Cut is turned into a compound clip; FX Shot into a Fusion clip
local function mpiOf(tl)
    local ok, item = pcall(function () return tl:GetMediaPoolItem() end)
    if ok and item then return item end
    for _, c in ipairs(root:GetClipList()) do if c:GetName() == tl:GetName() and c:GetClipProperty("Type") == "Timeline" then return c end end
end
local intro = mp:CreateTimelineFromClips("Nested Intro", { by["clip_b.mp4"] })
local main = mp:CreateTimelineFromClips("Main Edit", { by["clip_a.mp4"] })
p:SetCurrentTimeline(main)
local nested = mp:AppendToTimeline({ mpiOf(intro) })
log[#log + 1] = "nested: " .. tostring(nested and #nested)

local social = mp:CreateTimelineFromClips("Social Cut", { by["clip_c.mp4"], by["broll_02.mp4"] })
p:SetCurrentTimeline(social)
local ok, comp = pcall(function () return social:CreateCompoundClip(social:GetItemListInTrack("video", 1), { name = "Combo" }) end)
log[#log + 1] = "compound: " .. tostring(ok and comp ~= nil)

local fx = mp:CreateTimelineFromClips("FX Shot", { by["interview_cam1.mov"] })
p:SetCurrentTimeline(fx)
local ok2, fus = pcall(function () return fx:CreateFusionClip(fx:GetItemListInTrack("video", 1)) end)
log[#log + 1] = "fusion: " .. tostring(ok2 and fus ~= nil)

p:SetCurrentTimeline(main)
mp:SetCurrentFolder(root)
pm:SaveProject()

local n = 0
local function count(f) n = n + #f:GetClipList(); for _, s in ipairs(f:GetSubFolderList()) do count(s) end end
count(root)
return "built " .. n .. " items; " .. table.concat(log, "; ")
