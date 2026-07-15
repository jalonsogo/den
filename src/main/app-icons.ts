import { app, nativeImage, nativeTheme, type NativeImage } from 'electron'
import { join } from 'path'

const iconPath = (name: string): string => join(__dirname, '../../resources/icon', name)

export function createWindowIcon(): NativeImage {
  const iconName = process.platform === 'linux' ? 'linux/512x512.png' : 'dock.png'
  return nativeImage.createFromPath(iconPath(iconName))
}

export function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromPath(iconPath('icon-dark.png')).resize({ width: 16, height: 16 })
  image.setTemplateImage(true)
  return image
}

export function setupThemedAppIcons(): void {
  const apply = (): void => {
    const themedIconPath = iconPath(nativeTheme.shouldUseDarkColors ? 'dock-dark.png' : 'dock.png')
    const image = nativeImage.createFromPath(themedIconPath)
    if (process.platform === 'darwin' && !image.isEmpty()) app.dock?.setIcon(image)
    app.setAboutPanelOptions({
      applicationName: 'den',
      applicationVersion: `Version ${app.getVersion()}`,
      version: '',
      copyright: '© Docker · den.studio',
      iconPath: themedIconPath
    })
  }

  apply()
  nativeTheme.on('updated', apply)
}
