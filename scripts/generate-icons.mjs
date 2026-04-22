import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1A2A4F"/>
  <circle cx="50" cy="50" r="35" fill="none" stroke="#D4AF37" stroke-width="4"/>
  <text x="50" y="65" font-size="40" text-anchor="middle" fill="#D4AF37" font-family="Arial" font-weight="bold">S</text>
</svg>`

mkdirSync('public/icons', { recursive: true })

await Promise.all(
  sizes.map(async (size) => {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(`public/icons/icon-${size}x${size}.png`)
    console.log(`✓ icon-${size}x${size}.png`)
  })
)
