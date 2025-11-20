# Scripts de Geração de Ícones PWA

Este diretório contém scripts para gerar ícones do PWA a partir do logo do sistema.

## Gerar Ícones do PWA

Para regenerar todos os ícones do PWA a partir do `public/logo.svg`, execute:

```bash
node scripts/generate-pwa-icons.js
```

Este script irá gerar:
- `pwa-192.png` (192x192px) - Ícone principal do PWA
- `pwa-512.png` (512x512px) - Ícone de alta resolução do PWA

## Requisitos

- Node.js
- Sharp (já incluído como dependência do Next.js)

## Tamanhos de Ícones Gerados

| Tamanho | Arquivo | Uso |
|---------|---------|-----|
| 72x72 | icon-72x72.png | Android (ldpi) |
| 96x96 | icon-96x96.png | Android (mdpi) |
| 128x128 | icon-128x128.png | Android (hdpi) |
| 144x144 | icon-144x144.png | Android (xhdpi) |
| 152x152 | icon-152x152.png | iOS iPad |
| 180x180 | apple-touch-icon.png | iOS iPhone |
| 192x192 | pwa-192.png | PWA padrão |
| 384x384 | icon-384x384.png | Android (xxhdpi) |
| 512x512 | pwa-512.png | PWA alta resolução |
