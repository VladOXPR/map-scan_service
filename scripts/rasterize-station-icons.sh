#!/usr/bin/env bash
# Rasterize the station SVG icons (Icon0.svg .. Icon6.svg at the repo root)
# into PNG assets for the Expo mobile app at apps/mobile/assets/stations/.
#
# Why this exists:
#   - The web app loads the SVGs directly via mapbox-gl-js' map.addImage()
#     (apps/web/src/features/map-view/loadStationIcons.ts).
#   - The native Mapbox SDK used by @rnmapbox/maps does NOT render SVG; it
#     only accepts raster bitmaps registered via <Mapbox.Images>. So the
#     mobile app needs pre-rasterized PNGs at three densities (1x/2x/3x).
#
# Why the SVG patch step:
#   The CUUB icons fill their outer hexagonal "card" via a self-referencing
#   white-to-white linearGradient (`fill="url(#paint0_linear_1760_*)"`).
#   ImageMagick's SVG renderer does not follow gradient url() refs reliably
#   and silently drops the path -- which would leave the rasterized icon
#   without its white card background. Inlining the gradient as a literal
#   `fill="white"` before rasterization sidesteps the bug.
#
# Requires: ImageMagick (`brew install imagemagick`).
# Optional: librsvg (`brew install librsvg`) renders gradients natively, in
#   which case the patch step below is a no-op safety net.
#
# Usage:
#   bash scripts/rasterize-station-icons.sh
#
# Output:
#   apps/mobile/assets/stations/icon{0..6}.png       (54x53)
#   apps/mobile/assets/stations/icon{0..6}@2x.png    (108x106)
#   apps/mobile/assets/stations/icon{0..6}@3x.png    (162x159)

set -euo pipefail

if ! command -v magick >/dev/null 2>&1; then
  echo "ERROR: 'magick' (ImageMagick) not found. Install with: brew install imagemagick" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG_DIR="$REPO_ROOT"
OUT_DIR="$REPO_ROOT/apps/mobile/assets/stations"
TMP_DIR="$(mktemp -d -t cuub-svg-patched.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

# 54x53 is the SVG's intrinsic size. We rasterize at 1x/2x/3x so React
# Native's asset density picker chooses the right asset on every device.
BASE_W=54
BASE_H=53

echo "==> Rasterizing 7 icons at 1x/2x/3x into $OUT_DIR"

for i in 0 1 2 3 4 5 6; do
  src="$SVG_DIR/Icon${i}.svg"
  patched="$TMP_DIR/Icon${i}.svg"

  if [[ ! -f "$src" ]]; then
    echo "ERROR: missing source SVG $src" >&2
    exit 1
  fi

  # Inline the white-to-white gradient as a literal fill so ImageMagick
  # does not lose the outer hexagonal card. Safe no-op for SVGs that
  # already use a literal fill.
  sed -E 's/fill="url\(#paint0_linear_[0-9]+_[0-9]+\)"/fill="white"/g' "$src" > "$patched"

  for scale in 1 2 3; do
    w=$((BASE_W * scale))
    h=$((BASE_H * scale))
    density=$((144 * scale))
    if [[ "$scale" == "1" ]]; then
      out="$OUT_DIR/icon${i}.png"
    else
      out="$OUT_DIR/icon${i}@${scale}x.png"
    fi
    magick -background none -density "$density" "$patched" -resize "${w}x${h}" "$out"
    echo "   $(basename "$out")  ${w}x${h}  $(stat -f%z "$out" 2>/dev/null || stat -c%s "$out") bytes"
  done
done

echo "==> Done. ${OUT_DIR#$REPO_ROOT/} now has $(ls "$OUT_DIR" | wc -l | tr -d ' ') files."
