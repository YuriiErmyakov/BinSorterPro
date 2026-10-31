# BinSorter Pro

Собственная панель для **Premiere Pro**, **After Effects**, **DaVinci Resolve** и **Unreal Engine**: раскладывает элементы проекта по бинам
(в AE и Unreal Engine по папкам). Файлы на диске не трогает, перемещает только элементы внутри проекта.
Одна панель и одно ядро на все приложения, значок `Pr` / `Ae` / `DR` в шапке показывает, где она открыта.

Бесплатный проект с открытым кодом ([MIT](LICENSE)). Не связан с Adobe, Blackmagic Design и Epic Games;
Premiere Pro, After Effects, DaVinci Resolve и Unreal Engine — торговые марки их владельцев.

> Внутренние имена (папка `ue/AutoSortBinsPro`, ID расширения `com.ourtools.autosortbins`, папка настроек
> `%APPDATA%\AutoSortBinsPro`) остались от рабочего названия проекта. На работу это не влияет.

---

## English

**BinSorter Pro** is a free, open-source panel that sorts your project into bins (folders) automatically.
One panel and one sorting core for **Adobe Premiere Pro**, **After Effects**, **DaVinci Resolve Studio** and **Unreal Engine 5.6**.
It never touches files on disk: only items inside the project are moved.

- **Sort now**: scans the project and moves everything into category bins (Premiere: Video, Audio, Music, SFX, GFX, Mogrt, Proxies, Sequences, Nested Sequences, Other; After Effects: Comps, Precomps, Video, Images, Audio, Music, SFX, Solids, 3D, Other).
- **Undo last sort**: puts items back, restores deleted empty bins and label colors. Keeps the last 5 sorts per project, survives restarts.
- **Export report**: saves a `.txt` of what was moved and from where (or a preview if nothing was sorted yet).
- **Auto-sort**: sorts new items while the panel is open; switched on per project.
- Every category can be switched off, renamed (bin names can be paths like `01 Media/Video`) and given a label color.

**Install (Windows)**

```
powershell -ExecutionPolicy Bypass -File install.ps1
```

Restart the app, then open the panel: *Window > Extensions > BinSorter Pro* (Premiere Pro, After Effects) or
*Workspace > Workflow Integrations > BinSorter Pro* (DaVinci Resolve Studio). For Unreal Engine see `ue/install.bat`
(it needs the Python Editor Script Plugin). Details are in the Russian sections below.

Not affiliated with Adobe, Blackmagic Design or Epic Games. MIT license.

---

## Установка

```
powershell -ExecutionPolicy Bypass -File install.ps1
```

Скрипт ставит две ссылки на папку `ext`:

- `%APPDATA%\Adobe\CEP\extensions\com.ourtools.autosortbins` для Premiere Pro и After Effects;
- `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.ourtools.autosortbins` для Resolve.

После этого нужно перезапустить приложение и открыть панель:

| Приложение | Где |
| --- | --- |
| Premiere Pro, After Effects | Window > Extensions > BinSorter Pro |
| DaVinci Resolve Studio | Workspace > Workflow Integrations > BinSorter Pro |

Правки файлов в `ext` подхватываются после переоткрытия панели, правки манифестов только после перезапуска приложения.
В Resolve панель открывается отдельным окном поверх остальных; нужна версия Studio.

## Что умеет

| Кнопка | Действие |
| --- | --- |
| **Sort now** | Сканирует проект и раскладывает всё по бинам. Число на кнопке показывает, сколько элементов лежит не на месте. |
| **Undo last sort** | Возвращает элементы последней сортировки туда, где они лежали, восстанавливает удалённые пустые бины и цветные метки, убирает созданные бины. Хранит 5 последних сортировок на проект, работает и после перезапуска. |
| **Export report** | Сохраняет `.txt` с отчётом о последней сортировке: что и откуда перемещено. Если сортировок ещё не было, сохраняет предпросмотр. |
| **Auto-sort** | Пока панель открыта, сама сортирует новое. Интервал проверки задаётся в секундах. Включается для каждого проекта отдельно: в другом проекте он сам не начнёт работать. |

В списке у каждого бина видно, сколько таких элементов в проекте и сколько ждут перемещения (`+N`). Галочка справа выключает
категорию: её элементы остаются на месте. Щелчок по строке раскрывает её: имя бина, цвет метки и список того, что будет перемещено.

Имя бина может быть путём: `01 Media/Video` положит Video внутрь `01 Media`.
Элемент, который уже лежит в своём бине или в любом вложенном в него бине, не перемещается.

## Правила: Premiere Pro

Бины: **Video, Audio, Music, SFX, GFX, Mogrt, Proxies, Sequences, Nested Sequences, Other**.

1. Секвенция, которая стоит клипом в другой секвенции, идёт в Nested Sequences, остальные в Sequences.
2. Mogrt: файлы `.mogrt` / `.aegraphic` и всё из служебной папки `Motion Graphics Template Media`.
3. Proxies: имя вида `*_Proxy` или папка `Proxies` на диске.
4. Дальше по расширению файла: видео, аудио, графика (картинки, PSD/AI, EXR, AE-проекты). Элементы без файла
   (Black Video, Color Matte, Adjustment Layer) идут в GFX.
5. Аудио делится на Music, SFX и Audio (см. ниже).
6. Всё прочее идёт в Other.

## Правила: After Effects

Папки: **Comps, Precomps, Video, Images, Audio, Music, SFX, Solids, 3D, Other**.

1. Композиция, которая стоит слоем в другой композиции, идёт в Precomps, остальные в Comps.
2. Солиды, нуль-объекты и источники корректирующих слоёв идут в Solids (обычно они там уже лежат).
3. 3D-модели (GLB, GLTF, OBJ, FBX, C4D, USD) идут в 3D.
4. Футаж с картинкой: неподвижный в Images, движущийся в Video. Секвенция кадров считается видео.
5. Футаж только со звуком делится на Music, SFX и Audio.
6. Плейсхолдеры, файлы данных и всё прочее идут в Other.

Папка со слоями одного файла (так выглядит PSD или AI, импортированный как композиция: `имя Layers`) переезжает в Images
целиком, слои из неё не вынимаются. В списке такая строка помечена косой чертой, в отчёте пометкой `[folder]`.

Сортировка и её отмена в AE идут одним шагом истории: **Edit > Undo** возвращает всё разом, как и кнопка панели.

## Правила: DaVinci Resolve

Бины Media Pool: **Video, Audio, Music, SFX, GFX, Timelines, Nested Timelines, Compound Clips, Fusion, Other**.
Решает столбец Type самого Resolve:

1. Timeline: таймлайн, который стоит клипом в другом таймлайне, идёт в Nested Timelines, остальные в Timelines.
2. Compound и Multicam идут в Compound Clips.
3. Fusion, генераторы и титры идут в Fusion.
4. Audio делится на Music, SFX и Audio.
5. Still идёт в GFX, Video и Video + Audio в Video (секвенция кадров там тоже Video).
6. Субтитры и всё прочее идут в Other.

Цветные метки здесь это Clip Color. У бинов цвета в API нет, поэтому красятся только клипы.
Бин, открытый в Media Pool, после сортировки остаётся открытым. Штатного Undo для таких перемещений в Resolve нет,
возврат делает кнопка **Undo last sort**.

## Unreal Engine

Плагин для Unreal Editor 5.6 лежит в `ue\AutoSortBinsPro` и показывает ту же панель во вкладке редактора, в графитовых
тонах самого Unreal (значок `UE`). «Бины» здесь это папки Content Browser.

Установка (один раз): `ue\build.bat 5.6` собирает C++ (в `C:\UEBuild`, MSVC не любит кириллицу в путях),
`ue\install.bat 5.6` ставит ссылку `UE_5.6\Engine\Plugins\Marketplace\AutoSortBinsPro`; плагин включается во всех
проектах 5.6, нужен включённый Python Editor Script Plugin. После перезапуска редактора: **Window > Tools > BinSorter Pro**,
**Tools > BinSorter Pro** или правый щелчок по папке в Content Browser > **Sort with BinSorter Pro** (эта папка
становится сортируемой и открывается панель). Правки в `ext` и Python подхватываются командой
`import asb_ue; asb_ue.restart()` в Python-консоли редактора, правки C++ только после пересборки и перезапуска.

Папки: **Maps, Blueprints, UI, Meshes, Materials, Textures, Animations, Audio, Music, SFX, FX, Cinematics, Data, Other**.
Решает класс ассета или любой его родительский класс:

1. World в Maps. Категория **выключена по умолчанию**: у карты World Partition вместе с ней переезжают внешние акторы.
2. Widget Blueprint, шрифты, Slate-кисти в UI; Anim Blueprint, Control Rig, IK Rig, анимации, монтажи, blend space в Animations.
   Эти правила стоят раньше Blueprints, остальные Blueprint-классы идут в Blueprints.
3. Niagara и Cascade в FX; Level Sequence, медиа-источники и плееры в Cinematics.
4. Static/Skeletal Mesh, Skeleton, Physics Asset в Meshes; материалы, инстансы, функции, коллекции параметров в Materials;
   текстуры и render target в Textures.
5. Звуки (Sound Wave, Sound Cue, MetaSound) делятся на Music, SFX и Audio, как в других приложениях; длину звука и путь
   к исходному файлу Unreal хранит в ассете. Настройки звука (attenuation, class, mix) идут в Audio.
6. Data Table, кривые, Data Asset, структуры, перечисления, String Table, Input Action и Mapping Context в Data.
7. Всё остальное в Other.

Чем отличается от остальных версий:

- В **Settings > Folder to sort** выбирается папка (по умолчанию `/Game`), папки категорий создаются внутри неё.
  **Current** берёт папку, открытую в Content Browser. По умолчанию сортируются только свободные ассеты в самой папке
  (**Sort > Only loose assets in the folder itself**): проекты Unreal обычно разложены вручную, а шаблоны и паки из
  Marketplace лучше не разбирать. Вариант **Everything inside the folder** раскладывает и вложенные папки.
- `Developers` и `Collections` по умолчанию в списке **Folders to leave alone**, а `__ExternalActors__` /
  `__ExternalObjects__` не трогаются никогда.
- Перемещение это штатный Move/Rename Unreal: ссылки других ассетов обновляются, пакеты сразу сохраняются, оставшиеся
  редиректоры исправляются и удаляются (это делает C++ часть). Ctrl+Z редактора такие перемещения не отменяет, возврат
  делает **Undo last sort**. Ассет, у которого в папке назначения уже есть одноимённый, не перемещается («could not be moved»).
- **Colour the category folders** красит папки категорий (у ассетов цвета нет).
- **Export report** сохраняет отчёт в `<проект>\Saved\AutoSortBinsPro\` и показывает его в Проводнике
  (в веб-вкладке Unreal нет окна сохранения).
- Настройки в `settings_ue.json`, история в `history_ue.json`; история и Auto-sort запоминаются для пары «проект + папка».

Устройство: `ue\AutoSortBinsPro\Source` (C++: вкладка с SWebBrowser, цвета папок, исправление редиректоров,
`unreal.AutoSortBinsLibrary`), `Content\Python\asb_ue.py` (локальный HTTP-сервер панели, все вызовы на игровом потоке,
пункты меню), `Content\Python\asb_ue_host.py` (тот же набор вызовов, что host_ae.jsx и asb_server.lua).
Без C++ части работает всё, кроме вкладки, цветов папок и чистки редиректоров; панель тогда открывается
отдельным окном командой `import asb_ue; asb_ue.open_external()` в Python-консоли редактора.
Вкладка, открытая плавающим окном, после перезапуска редактора сама не появляется (так Unreal обходится с плавающими
окнами): **Tools > BinSorter Pro** или пристыкуйте её к раскладке.

## Аудио: Music, SFX или Audio

Решают слова в имени файла, в двух ближайших папках на диске и в именах бинов. Побеждает самое длинное совпавшее слово,
слова про голос (vo, voice, interview, озвучка) оставляют файл в Audio. Если слов нет, решает длина: короче 10 с это SFX,
длиннее 60 с это Music, остальное Audio.

## Settings

- **Sort**: весь проект или только элементы, лежащие в корне.
- **Remove bins the sort has emptied**: удалять бины, которые опустели из-за сортировки. Бины, пустые с самого начала, не трогаются.
- **Color-label sorted items**: красить перемещённые элементы меткой категории. Имена меток в списке стандартные для приложения.
- Пороги длины для SFX и Music (0 выключает правило), списки слов, список бинов, которые сортировка обходит.

Настройки свои у каждого приложения и общие для всех проектов, лежат в `%APPDATA%\AutoSortBinsPro\`:
`settings.json` (Premiere), `settings_ae.json` (After Effects), `settings_dr.json` (Resolve). История для Undo рядом:
`history.json`, `history_ae.json`, `history_dr.json`.

Если чужой инструмент держит свои элементы в собственном бине (например, `AutoCaptions Pro`), добавьте имя этого бина
в **Bins to leave alone**, иначе сортировка по всему проекту разложит его содержимое по типам.

## Как устроено

- `ext\js\core.js`: четыре профиля (`use("ppro")`, `use("ae")`, `use("dr")`, `use("ue")`), правила, план сортировки, отчёт. Работает без приложений.
- `ext\host.jsx` (Premiere) и `ext\host_ae.jsx` (After Effects): ExtendScript с одинаковым набором вызовов `ASB.run(fn, json)`.
- `ext\dr\asb_server.lua` (Resolve): тот же набор вызовов на Lua. Его запускает `ext\js\dr_link.js` через штатный
  `fuscript.exe` Resolve; процесс живёт, пока открыта панель, и сам завершается через две минуты без команд.
  Обмен идёт двумя файлами во временной папке.
- `ext\js\main.js`, `ext\js\cep.js`, `ext\index.html`, `ext\style.css`: панель. Приложение она узнаёт сама.
- `ext\CSXS\manifest.xml`: расширение Adobe. `ext\manifest.xml`, `ext\dr_main.js`, `ext\package.json`: плагин Resolve (окно Electron).
- `dev\server.js [порт] [ppro|ae|dr] [mock]`: та же панель в обычном браузере. Работает с живым приложением
  (Adobe через Claude MCP Bridge, Resolve напрямую), а с `mock` вообще без приложений, на проекте в памяти (`dev\mock.js`).
  `?still` в адресе отключает опрос.

Auto-sort в Premiere узнаёт о новых элементах по событию `onItemsAddedToProjectSuccess`, в After Effects по числу элементов
проекта, в Resolve по числу клипов в бинах, поэтому весь проект на каждой проверке не перечитывается. Перемещения,
сделанные руками, он находит по отпечатку дерева; если отпечаток считается дольше 150 мс, такая проверка идёт
не чаще раза в минуту.

## Тесты

```
node test/core_test.js                         # правила и план Premiere, без приложений
node test/core_ae_test.js                      # то же для After Effects
node test/core_dr_test.js                      # то же для Resolve
node test/core_ue_test.js                      # то же для Unreal Engine
node test/make_media.js                        # тестовые файлы (ffmpeg)

node test/setup.js                             # Premiere: собрать test\ASB_test.prproj или вернуть в несортированный вид
node test/pr_test.js                           # Premiere: сортировка и Undo вживую

node test/ae_setup.js --switch                 # AE: закрыть открытый проект (только сохранённый) и собрать test\ASB_test.aep
node test/ae_test.js                           # AE: сортировка, Edit > Undo / Redo, Undo панели
node test/ae_setup.js --open "D:\путь\мой.aep" # AE: сохранить тестовый проект и открыть свой обратно

node test/dr_setup.js --switch                 # Resolve: сохранить открытый проект и собрать проект ASB_test
node test/dr_test.js                           # Resolve: сортировка и Undo вживую
node test/dr_setup.js --open "Проект" "Таймлайн"   # Resolve: вернуться в свой проект

node test/dry_run.js [--ae | --dr] [--root] [--items]   # только чтение: что сделала бы сортировка в открытом проекте
```

Для живых тестов Adobe нужен запущенный Claude MCP Bridge и закрытая dev-страница; для Resolve достаточно запущенного Resolve.

Окно плагина Resolve можно открыть и без меню Resolve, его же Electron:

```
"C:\Program Files\Blackmagic Design\DaVinci Resolve\Electron\electron.exe" "C:\Все файлы\AutoSortBinsPro\ext"
```

## Ограничения

- Auto-sort работает, пока панель открыта (в Adobe можно держать её во вкладке за другой панелью, в Resolve свернуть окно).
- Категория Mogrt в Premiere проверена на правилах и на одном реальном проекте; шаблоны, сделанные в самом Premiere,
  элемента в проекте не создают.
- Привязанные прокси (Attach Proxies в Premiere, Set Proxy в AE, Proxy Media в Resolve) отдельными элементами не являются и не сортируются.
- Search-бины Premiere и Smart Bins Resolve пропускаются.
- В несохранённом проекте AE история Undo и включённый Auto-sort живут до закрытия панели.
- В Resolve имена бинов без учёта регистра сравниваются только для латиницы.
