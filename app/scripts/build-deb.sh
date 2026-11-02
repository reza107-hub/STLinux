#!/usr/bin/env bash
# Builds the .deb and renames the package to "stlinux" (Tauri derives "st-linux" from the product name).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm tauri build --bundles deb
src=$(ls src-tauri/target/release/bundle/deb/*.deb | head -n1)
version=$(dpkg-deb -f "$src" Version)
arch=$(dpkg-deb -f "$src" Architecture)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dpkg-deb -R "$src" "$work/pkg"
sed -i 's/^Package: .*/Package: stlinux/' "$work/pkg/DEBIAN/control"
# the keyring needs the D-Bus client library at run time
if ! grep -q 'libdbus-1-3' "$work/pkg/DEBIAN/control"; then
  sed -i 's/^Depends: \(.*\)$/Depends: \1, libdbus-1-3/' "$work/pkg/DEBIAN/control"
fi
mkdir -p ../dist
out="../dist/stlinux_${version}_${arch}.deb"
dpkg-deb --root-owner-group -b "$work/pkg" "$out" >/dev/null
echo "Built $(cd .. && realpath dist)/$(basename "$out")"
