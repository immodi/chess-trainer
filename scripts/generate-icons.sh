#!/usr/bin/env bash
# Regenerate the Android launcher icons and splash screens from resources/.
# The generated PNGs are committed; this is a development helper only.
set -euo pipefail

cd "$(dirname "$0")/.."

for tool in rsvg-convert magick; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing $tool. Install librsvg and ImageMagick first." >&2
    exit 1
  fi
done

# Legacy square and round icons, plus the adaptive foreground. The adaptive
# foreground is 108dp at mdpi, i.e. 2.25x the legacy icon size.
for spec in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  density=${spec%%:*}
  size=${spec##*:}
  fg=$((size * 9 / 4))
  out="android/app/src/main/res/mipmap-$density"

  rsvg-convert -w "$size" -h "$size" resources/icon.svg -o "$out/ic_launcher.png"
  rsvg-convert -w "$size" -h "$size" resources/icon-round.svg -o "$out/ic_launcher_round.png"
  rsvg-convert -w "$fg" -h "$fg" resources/icon-foreground.svg -o "$out/ic_launcher_foreground.png"
done

# Browser favicon.
cp resources/icon.svg public/icon.svg

# Splash screens: the dark app background with the square icon centered.
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

for spec in \
  drawable/splash.png:480x320 \
  drawable-land-mdpi/splash.png:480x320 \
  drawable-land-hdpi/splash.png:800x480 \
  drawable-land-xhdpi/splash.png:1280x720 \
  drawable-land-xxhdpi/splash.png:1600x960 \
  drawable-land-xxxhdpi/splash.png:1920x1280 \
  drawable-port-mdpi/splash.png:320x480 \
  drawable-port-hdpi/splash.png:480x800 \
  drawable-port-xhdpi/splash.png:720x1280 \
  drawable-port-xxhdpi/splash.png:960x1600 \
  drawable-port-xxxhdpi/splash.png:1280x1920; do
  rel=${spec%%:*}
  dims=${spec##*:}
  w=${dims%x*}
  h=${dims#*x}
  min=$((w < h ? w : h))
  icon=$((min * 38 / 100))

  rsvg-convert -w "$icon" -h "$icon" resources/icon.svg -o "$tmpdir/icon.png"
  magick -size "${w}x${h}" xc:'#1B1B1F' "$tmpdir/icon.png" \
    -gravity center -composite -alpha off -depth 8 -strip \
    "android/app/src/main/res/$rel"
done
