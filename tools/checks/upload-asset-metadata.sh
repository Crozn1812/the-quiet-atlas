#!/usr/bin/env bash
# Called only by the deploy workflow AFTER upload, BEFORE invalidation.
# No precompression: CloudFront negotiates gzip/br for eligible MIME types.
set -euo pipefail
export AWS_PAGER=''
asset_dir="${1:?Usage: upload-asset-metadata.sh <export-dir> <site-bucket>}"
site_bucket="${2:?Missing site bucket}"
test -s "$asset_dir/index.html"
asset_dir="${asset_dir%/}"

while IFS= read -r -d '' file; do
  case "${file,,}" in
    *.ktx2) content_type='image/ktx2' ;;
    *.glb) content_type='model/gltf-binary' ;;
    *.gltf) content_type='model/gltf+json' ;;
    *.hdr) content_type='application/octet-stream' ;; # Radiance RGBE binary
    *.webm) content_type='video/webm' ;;
    *.woff2) content_type='font/woff2' ;;
    *.woff) content_type='font/woff' ;;
    *.ttf) content_type='font/ttf' ;;
    *.otf) content_type='font/otf' ;;
    *.eot) content_type='application/vnd.ms-fontobject' ;;
    *.wasm) content_type='application/wasm' ;;
    *) continue ;;
  esac
  key="${file#"$asset_dir/"}"
  cache_control='no-cache, max-age=0, must-revalidate'
  if [[ "$key" == _next/static/* ]]; then
    cache_control='public, max-age=31536000, immutable'
  fi
  # cp (not sync) repairs metadata on existing keys and uploads original bytes,
  # so no Content-Encoding is set for KTX2, GLB, HDR, video or compressed fonts.
  aws s3 cp "$file" "s3://$site_bucket/$key" \
    --content-type "$content_type" --cache-control "$cache_control" \
    --no-follow-symlinks --only-show-errors
done < <(find "$asset_dir" -type f -print0)
