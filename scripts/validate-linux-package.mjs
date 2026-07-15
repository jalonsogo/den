#!/usr/bin/env node
// Static package/source policy checks used by the pinned Linux release build.
// This proves packaged assets and compiled wiring; it is not a GUI/runtime test.

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import asar from '@electron/asar'

const root = process.argv[2]
if (!root) throw new Error('usage: validate-linux-package.mjs EXTRACTED_PACKAGE_ROOT')
const archive = join(root, 'opt/den/resources/app.asar')
const entries = asar.listPackage(archive).map((entry) => entry.replace(/^\//, ''))
const extractText = (path) => asar.extractFile(archive, path).toString()
const compiledMain = extractText('out/main/index.js')
const compiledPreload = extractText('out/preload/index.js')
const rendererJs = entries.filter((entry) => /^out\/renderer\/assets\/.*\.js$/.test(entry)).map(extractText).join('\n')
const rendererCss = entries.filter((entry) => /^out\/renderer\/assets\/.*\.css$/.test(entry)).map(extractText).join('\n')
const packagedIcon = asar.extractFile(archive, 'resources/icon/linux/512x512.png')
const sourceMain = readFileSync('src/main/index.ts', 'utf8')
const sourceAppIcons = readFileSync('src/main/app-icons.ts', 'utf8')
const sourcePreload = readFileSync('src/preload/index.ts', 'utf8')
const sourceToolbar = readFileSync('src/renderer/src/components/Toolbar.tsx', 'utf8')
const sourceCss = readFileSync('src/renderer/src/styles/main.css', 'utf8')
const installedIcon = join(root, 'usr/share/icons/hicolor/512x512/apps/den.png')
const tempIcon = '/tmp/den-asar-linux-512.png'
writeFileSync(tempIcon, packagedIcon)

function exactly(text, regex, count, label) {
  const found = [...text.matchAll(regex)].length
  if (found !== count) throw new Error(`${label}: expected ${count}, found ${found}`)
}
function requireMatch(text, regex, label) {
  if (!regex.test(text)) throw new Error(`${label} missing`)
}
function rejectMatch(text, regex, label) {
  if (regex.test(text)) throw new Error(`${label} unexpectedly present`)
}

requireMatch(sourceMain, /async function setAppMenu[^]*?process\.platform === 'linux'[^]*?Menu\.setApplicationMenu\(null\)[^]*?return[^]*?Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(template\)\)/, 'source Linux null-menu branch plus non-Linux construction')
requireMatch(sourceMain, /const platformWindowOptions = process\.platform === 'linux'\s*\? \{ frame: false \}\s*: process\.platform === 'darwin'\s*\? \{ titleBarStyle: 'hiddenInset' as const, trafficLightPosition: \{ x: 14, y: 18 \} \}\s*: \{\}/, 'source platform frame/titlebar matrix')
requireMatch(sourceMain, /const win = new BrowserWindow\([^]*?mainWindow = win[^]*?if \(mainWindow === win\) mainWindow = null/, 'source identity-safe main window lifecycle')
requireMatch(sourceMain, /function createWindow[^]*?new BrowserWindow\([^]*?icon: createWindowIcon\(\)/, 'source main-window icon wiring')
requireMatch(sourceMain, /import \{ createTrayIcon, createWindowIcon, setupThemedAppIcons \} from '\.\/app-icons'/, 'source centralized icon API import')
requireMatch(sourceMain, /new Tray\(createTrayIcon\(\)\)/, 'source tray icon API wiring')
requireMatch(sourceMain, /setupThemedAppIcons\(\)/, 'source themed dock/about icon API wiring')
rejectMatch(sourceMain, /nativeImage|dock(?:-dark)?\.png|icon-dark\.png|linux\/512x512\.png|setAboutPanelOptions|setTemplateImage/, 'source icon implementation outside app-icons module')
exactly(sourceMain, /icon: createWindowIcon\(\)/g, 2, 'source BrowserWindow icon wiring')
requireMatch(sourceAppIcons, /process\.platform === 'linux' \? 'linux\/512x512\.png' : 'dock\.png'/, 'source platform window icon policy')
requireMatch(sourceAppIcons, /createFromPath\(iconPath\('icon-dark\.png'\)\)\.resize\(\{ width: 16, height: 16 \}\)[^]*?setTemplateImage\(true\)/, 'source tray template icon policy')
requireMatch(sourceAppIcons, /shouldUseDarkColors \? 'dock-dark\.png' : 'dock\.png'[^]*?process\.platform === 'darwin'[^]*?app\.dock\?\.setIcon\(image\)[^]*?setAboutPanelOptions\([^]*?iconPath: themedIconPath[^]*?nativeTheme\.on\('updated', apply\)/, 'source themed macOS dock/about icon policy')
const editorBlock = sourceMain.match(/ipcMain\.handle\('minipit:open-file-window'[^]*?const win = new BrowserWindow\(\{([^]*?)\n\s*\}\)\n\s*const params/)
if (!editorBlock) throw new Error('source editor BrowserWindow block missing')
rejectMatch(editorBlock[1], /\b(frame|titleBarStyle|trafficLightPosition)\s*:/, 'source editor custom frame option')

for (const channel of ['get-state', 'minimize', 'toggle-maximize', 'close']) {
  exactly(sourceMain, new RegExp(`ipcMain\\.handle\\('minipit:window-${channel}'`, 'g'), 1, `source ${channel} IPC handler`)
  requireMatch(sourcePreload, new RegExp(`ipcRenderer\\.invoke\\('minipit:window-${channel}'\\)`), `source ${channel} preload invoke`)
}
requireMatch(sourceMain, /process\.platform === 'linux'[^]*?senderFrame !== event\.sender\.mainFrame[^]*?BrowserWindow\.fromWebContents\(event\.sender\)[^]*?win !== mainWindow[^]*?isDestroyed/, 'source window IPC validation')
requireMatch(sourceMain, /win\.on\('maximize', sendMaximizedState\)[^]*?win\.on\('unmaximize', sendMaximizedState\)/, 'source maximize event wiring')
requireMatch(sourceMain, /webContents\.send\('minipit:window-maximized-changed', win\.isMaximized\(\)\)/, 'source exact-contents maximize notification')
requireMatch(sourcePreload, /isCustomChrome: process\.platform === 'linux'/, 'source narrow Linux chrome flag')
requireMatch(sourcePreload, /onMaximizedChanged[^]*?ipcRenderer\.on\('minipit:window-maximized-changed', handler\)[^]*?removeListener\('minipit:window-maximized-changed', handler\)/, 'source preload maximize listener cleanup')
rejectMatch(sourcePreload, /windowControls[^]*?(navigator\.userAgent|process\.platform\s*[,}])/, 'generic platform exposure')

requireMatch(sourceToolbar, /onMaximizedChanged[\s\S]*?getState\(\)/, 'renderer subscribe-before-getState ordering')
requireMatch(sourceToolbar, /receivedEvent[\s\S]*?!receivedEvent[\s\S]*?setMaximized/, 'renderer stale getState guard')
requireMatch(sourceToolbar, /mounted = false\s*\n\s*unsubscribe\(\)/, 'renderer unmount cleanup')
requireMatch(sourceToolbar, /role="group" aria-label="Window controls"/, 'renderer window-controls semantics')
for (const label of ['Close', 'Minimize', 'Restore', 'Maximize']) requireMatch(sourceToolbar, new RegExp(`['"]${label}['"]`), `renderer ${label} label`)
requireMatch(sourceCss, /\.toolbar-custom-chrome\s*\{\s*padding-left:\s*10px/, 'Linux/custom toolbar padding')
requireMatch(sourceCss, /\.window-controls[^}]*-webkit-app-region:\s*no-drag/, 'window controls no-drag')
requireMatch(sourceCss, /\.window-control:focus-visible/, 'window control visible focus')
requireMatch(sourceCss, /\.window-control\s*\{[^}]*width:\s*28px[^}]*height:\s*28px/, 'window control dimensions')

requireMatch(compiledMain, /process\.platform === "linux" \? "linux\/512x512\.png" : "dock\.png"/, 'compiled platform icon policy')
requireMatch(compiledMain, /process\.platform === "linux" \? \{ frame: false \}/, 'compiled Linux frameless main window')
requireMatch(compiledMain, /process\.platform === "darwin"[^]{0,300}titleBarStyle:\s*"hiddenInset"[^]{0,200}trafficLightPosition:\s*\{\s*x:\s*14,\s*y:\s*18\s*\}/, 'compiled retained macOS chrome')
requireMatch(compiledMain, /process\.platform === "linux"[^]*?setApplicationMenu\(null\)[^]*?return/, 'compiled Linux null-menu branch')
requireMatch(compiledMain, /setApplicationMenu\([^)]*buildFromTemplate\(template\)\)/, 'compiled non-Linux menu construction')
exactly(compiledMain, /icon: createWindowIcon\(\)/g, 2, 'compiled BrowserWindow icon uses')
for (const channel of ['get-state', 'minimize', 'toggle-maximize', 'close']) {
  requireMatch(compiledMain, new RegExp(`handle\\("minipit:window-${channel}"`), `compiled ${channel} handler`)
  requireMatch(compiledPreload, new RegExp(`invoke\\("minipit:window-${channel}"\\)`), `compiled ${channel} preload invoke`)
}
requireMatch(compiledPreload, /window-maximized-changed[^]*?removeListener\("minipit:window-maximized-changed"/, 'compiled preload listener cleanup')
requireMatch(rendererJs, /Window controls/, 'packaged renderer controls')
for (const label of ['Close', 'Minimize', 'Restore', 'Maximize']) requireMatch(rendererJs, new RegExp(label), `packaged renderer ${label} label`)
requireMatch(rendererCss, /\.window-controls/, 'packaged CSS controls selector')
requireMatch(rendererCss, /app-region:\s*no-drag/, 'packaged CSS no-drag rule')
requireMatch(rendererCss, /\.window-control:focus-visible/, 'packaged CSS focus styling')

execFileSync('file', [tempIcon], { stdio: 'inherit' })
execFileSync('cmp', [tempIcon, installedIcon])
console.log('static packaged icon/menu/window/chrome policy assertions passed')
