# App icon sources

- `icon.svg`: square launcher icon (cream `#F0D9B5` field, black knight).
- `icon-round.svg`: round launcher icon.
- `icon-foreground.svg`: transparent adaptive-icon foreground, scaled to fit
  Android's 66dp safe zone.

The Android mipmaps and splash screens are generated from these files with
`./scripts/generate-icons.sh` (needs `rsvg-convert` and ImageMagick `magick`).
The generated PNGs are committed, so the script is only a development helper.
The adaptive background colour lives in
`android/app/src/main/res/values/ic_launcher_background.xml`.

The knight is the black knight from `public/pieces/cburnett/bN.svg`, licensed
CC BY-SA 3.0. See `public/pieces/cburnett/README.md`; the icon is a derivative
work under the same licence.
