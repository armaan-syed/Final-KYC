#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ocr_dir="$(cd -- "$script_dir/.." && pwd)"
repo_root="$(cd -- "$ocr_dir/../../.." && pwd)"
build_dir="$(mktemp -d "$ocr_dir/.build.XXXXXX")"
builder_dir="$build_dir/tesseract-builder"
layer_dir="$build_dir/layer"
image_name="pramana-tesseract-layer:python312-x86_64"
builder_repo="https://github.com/bweigel/aws-lambda-tesseract-layer.git"
builder_revision="0b2d91351b5c7536a0db9e4703e4b85419d7cfc8"

for required_tool in docker git unzip zip; do
    if ! command -v "$required_tool" >/dev/null 2>&1; then
        printf 'Missing required tool: %s\n' "$required_tool" >&2
        exit 1
    fi
done

mkdir -p "$build_dir" "$layer_dir/python"
git clone --quiet "$builder_repo" "$builder_dir"
git -C "$builder_dir" checkout --quiet "$builder_revision"

docker build \
    --platform linux/amd64 \
    --build-arg OCR_LANG=hin \
    --build-arg TESSERACT_DATA_SUFFIX=_fast \
    -f "$builder_dir/Dockerfile.al2023" \
    -t "$image_name" \
    "$builder_dir"

container_id="$(docker create --platform linux/amd64 "$image_name" false)"
docker cp "$container_id:/opt/build-dist/." "$layer_dir/"
docker rm "$container_id" >/dev/null

docker run --rm \
    --platform linux/amd64 \
    --entrypoint /bin/sh \
    -v "$ocr_dir/requirements.txt:/tmp/requirements.txt:ro" \
    -v "$layer_dir/python:/opt/python" \
    public.ecr.aws/lambda/python:3.12 \
    -c 'python -m pip install --disable-pip-version-check -r /tmp/requirements.txt -t /opt/python'

fixture_dir="$build_dir/fixtures"
python3 "$ocr_dir/poc/make_fixtures.py" "$fixture_dir"

docker run --rm \
    --platform linux/amd64 \
    --entrypoint /bin/sh \
    -e 'PATH=/opt/bin:/var/lang/bin:/usr/local/bin:/usr/bin:/bin' \
    -e 'LD_LIBRARY_PATH=/opt/lib:/lib64:/usr/lib64' \
    -e 'TESSDATA_PREFIX=/opt/tesseract/share/tessdata' \
    -e 'PYTHONPATH=/src/infra/ocr/src:/src/infra/ocr/poc' \
    -v "$layer_dir:/opt:ro" \
    -v "$repo_root:/src:ro" \
    -v "$fixture_dir:/fixtures:ro" \
    public.ecr.aws/lambda/python:3.12 \
    -c 'python -c "import cv2, numpy, pypdfium2, pytesseract; print(\"native imports: ok\")" && tesseract --list-langs && python /src/infra/ocr/poc/run_poc.py --fixtures-dir /fixtures'

archive="$build_dir/pramana-ocr-layer.zip"
(cd "$layer_dir" && zip -qr "$archive" .)
unzip -t "$archive" >/dev/null
unzipped_bytes="$(du -sb "$layer_dir" | cut -f1)"
zipped_bytes="$(du -sb "$archive" | cut -f1)"
printf 'Layer archive: %s\n' "$archive"
printf 'Layer size: zipped=%s bytes unzipped=%s bytes\n' "$zipped_bytes" "$unzipped_bytes"
