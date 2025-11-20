const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [192, 512];
const inputSvg = path.join(__dirname, '../public/logo.svg');
const outputDir = path.join(__dirname, '../public/icons');

// Criar diretório se não existir
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  console.log('🎨 Gerando ícones do PWA a partir do logo.svg...\n');

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `pwa-${size}.png`);

    try {
      await sharp(inputSvg)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toFile(outputPath);

      console.log(`✅ Criado: pwa-${size}.png (${size}x${size})`);
    } catch (error) {
      console.error(`❌ Erro ao criar pwa-${size}.png:`, error.message);
    }
  }

  console.log('\n✨ Ícones do PWA gerados com sucesso!');
}

generateIcons();
