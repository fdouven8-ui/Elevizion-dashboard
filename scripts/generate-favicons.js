import sharp from 'sharp';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_ICON = join(__dirname, '../client/public/app-icon.jpg');
const OUTPUT_DIR = join(__dirname, '../client/public');

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-48x48.png', size: 48 },
  { name: 'favicon.png', size: 64 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateFavicons() {
  console.log('Generating favicons from:', SOURCE_ICON);
  
  for (const { name, size } of sizes) {
    const outputPath = join(OUTPUT_DIR, name);
    await sharp(SOURCE_ICON)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(outputPath);
    console.log(`Generated: ${name} (${size}x${size})`);
  }

  // Generate ICO file (32x32 as base)
  const icoPath = join(OUTPUT_DIR, 'favicon.ico');
  await sharp(SOURCE_ICON)
    .resize(32, 32, { fit: 'cover' })
    .png()
    .toFile(icoPath.replace('.ico', '-temp.png'));
  
  // Copy as ICO (browsers accept PNG with .ico extension)
  await fs.rename(icoPath.replace('.ico', '-temp.png'), icoPath);
  console.log('Generated: favicon.ico (32x32)');

  console.log('All favicons generated successfully!');
}

generateFavicons().catch(console.error);
