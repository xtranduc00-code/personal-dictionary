#!/usr/bin/env bash
# Download + decompress the Lichess puzzle dataset (CC0).
# Idempotent: skips work if the CSV already exists.
set -euo pipefail

cd "$(dirname "$0")/.."

CSV_PATH="data/lichess_db_puzzle.csv"
ZST_PATH="data/lichess_db_puzzle.csv.zst"
URL="https://database.lichess.org/lichess_db_puzzle.csv.zst"

if [[ -f "$CSV_PATH" ]]; then
  size=$(wc -c <"$CSV_PATH" | tr -d '[:space:]')
  echo "CSV already present ($CSV_PATH, ${size} bytes). Skipping download."
  echo "To re-download: rm $CSV_PATH"
  exit 0
fi

mkdir -p data

if [[ ! -f "$ZST_PATH" ]]; then
  echo "Downloading $URL → $ZST_PATH"
  curl -fL --progress-bar -o "$ZST_PATH" "$URL"
fi

echo "Decompressing $ZST_PATH → $CSV_PATH"
zstd -d --force "$ZST_PATH" -o "$CSV_PATH"

# Keep the .zst around in case re-import is desired without re-downloading.
echo "Done. CSV is at $CSV_PATH."
