/**
 * Rasterises resources/icon.svg into the files electron-builder packages:
 *   resources/icon.png  1024px, macOS safe-area padding (mac .icns, Linux)
 *   resources/icon.ico  16-256px, tighter crop so it fills the Windows taskbar
 *
 * Run with Electron (Chromium does the SVG rendering): pnpm run icons
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, app } from 'electron'

const resources = join(import.meta.dirname, '../resources')
const svg = readFileSync(join(resources, 'icon.svg'), 'utf8')

const PNG_SIZE = 1024
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
// The tile spans 100..924 in the 1024 viewBox; Windows icons are drawn nearly
// edge to edge, so the .ico keeps only a hairline margin around the tile.
const ICO_VIEWBOX = '96 96 832 832'

function withViewBox(source, viewBox) {
  return source.replace(/viewBox="[^"]*"/, `viewBox="${viewBox}"`)
}

async function rasterise(win, source, sizes) {
  const url = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`
  return win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = ${JSON.stringify(url)}
    await img.decode()
    return ${JSON.stringify(sizes)}.map((size) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      const rgba = ctx.getImageData(0, 0, size, size).data
      let binary = ''
      for (let i = 0; i < rgba.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, rgba.subarray(i, i + 0x8000))
      }
      return { size, png: canvas.toDataURL('image/png').split(',')[1], rgba: btoa(binary) }
    })
  })()`)
}

// 32-bit DIB entry: bottom-up BGRA rows followed by a 1-bit AND mask.
// Small sizes stay BMP because some Windows shell paths and NSIS still choke on
// PNG-compressed entries below 256px.
function bmpEntry(size, rgba) {
  const maskStride = Math.ceil(size / 32) * 4
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(size * size * 4 + maskStride * size, 20)

  const pixels = Buffer.alloc(size * size * 4)
  const mask = Buffer.alloc(maskStride * size)
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4
      const dst = (row * size + x) * 4
      pixels[dst] = rgba[src + 2]
      pixels[dst + 1] = rgba[src + 1]
      pixels[dst + 2] = rgba[src]
      pixels[dst + 3] = rgba[src + 3]
      if (rgba[src + 3] === 0) mask[row * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return Buffer.concat([header, pixels, mask])
}

function buildIco(images) {
  const entries = images.map(({ size, png, rgba }) => ({
    size,
    data: size >= 256 ? Buffer.from(png, 'base64') : bmpEntry(size, Buffer.from(rgba, 'base64'))
  }))
  const dir = Buffer.alloc(6 + entries.length * 16)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(entries.length, 4)
  let offset = dir.length
  entries.forEach(({ size, data }, i) => {
    const at = 6 + i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, at)
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
    dir.writeUInt16LE(1, at + 4)
    dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(data.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([dir, ...entries.map(({ data }) => data)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  try {
    await win.loadURL('about:blank')
    const [full] = await rasterise(win, svg, [PNG_SIZE])
    writeFileSync(join(resources, 'icon.png'), Buffer.from(full.png, 'base64'))
    const ico = await rasterise(win, withViewBox(svg, ICO_VIEWBOX), ICO_SIZES)
    writeFileSync(join(resources, 'icon.ico'), buildIco(ico))
    console.log(`icon.png ${PNG_SIZE}px, icon.ico ${ICO_SIZES.join('/')}px -> ${resources}`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    app.quit()
  }
})
