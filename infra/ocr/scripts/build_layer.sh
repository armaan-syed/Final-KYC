#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ocr_dir="$(cd -- "$script_dir/.." && pwd)"
repo_root="$(cd -- "$ocr_dir/../.." && pwd)"
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

# GitHub's release and raw data endpoints are slow from this Docker network.
# Use mirrors of the same pinned sources, checking Leptonica's release hash.
python3 - "$builder_dir/Dockerfile.al2023" <<'PY'
from pathlib import Path
import sys

dockerfile = Path(sys.argv[1])
text = dockerfile.read_text()
old = (
    "RUN curl -L https://github.com/DanBloomberg/leptonica/releases/download/${LEPTONICA_VERSION}/leptonica-${LEPTONICA_VERSION}.tar.gz | tar xz && cd ${TMP_BUILD}/leptonica-build/leptonica-${LEPTONICA_VERSION} && \\\n"
)
new = (
    'RUN test "${LEPTONICA_VERSION}" = "1.87.0" && \\\n'
    "    curl -fL https://ftp.kaist.ac.kr/macports/distfiles/leptonica/leptonica-${LEPTONICA_VERSION}.tar.gz -o leptonica.tar.gz && \\\n"
    '    echo "c73363397f96eb1295602bf44d708a994ad42046c791bf03ea0505d829bdb6a7  leptonica.tar.gz" | sha256sum -c - && tar xzf leptonica.tar.gz && \\\n'
    "    cd ${TMP_BUILD}/leptonica-build/leptonica-${LEPTONICA_VERSION} && \\\n"
)
if text.count(old) != 1:
    raise SystemExit("could not uniquely locate the pinned Leptonica download command")
text = text.replace(old, new, 1)

data_url = "https://github.com/tesseract-ocr/tessdata${TESSERACT_DATA_SUFFIX}/raw/${TESSERACT_DATA_VERSION}/"
if text.count(data_url) != 3:
    raise SystemExit("expected three pinned tessdata_fast downloads")
text = text.replace(
    data_url,
    "https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata${TESSERACT_DATA_SUFFIX}@${TESSERACT_DATA_VERSION}/",
)
dockerfile.write_text(text)
PY

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

# The worker uses English and Hindi OCR only; orientation/script detection is
# not part of this pipeline, so omit Tesseract's optional 10 MB OSD model.
python3 - "$layer_dir" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
osd_model = root / "tesseract/share/tessdata/osd.traineddata"
if osd_model.is_file() and osd_model.resolve().is_relative_to(root):
    osd_model.unlink()
readme = root / "TESSERACT-README.md"
if readme.is_file():
    readme.write_text(readme.read_text().replace(
        "TESSERACT_DATA_LANGUAGES=osd,eng,hin",
        "TESSERACT_DATA_LANGUAGES=eng,hin",
    ))
PY

docker run --rm \
    --platform linux/amd64 \
    --entrypoint /bin/sh \
    -e "PIP_INDEX_URL=${PIP_INDEX_URL:-https://pypi.org/simple}" \
    -v "$ocr_dir/requirements.txt:/tmp/requirements.txt:ro" \
    -v "$layer_dir/python:/opt/python" \
    public.ecr.aws/lambda/python:3.12 \
    -c 'python -m pip install --disable-pip-version-check -r /tmp/requirements.txt -t /opt/python'

# Lambda only needs runtime modules. Remove local test suites and bytecode
# caches included by upstream wheels so the combined native/Python layer fits.
python3 - "$layer_dir/python" <<'PY'
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1]).resolve()
for candidate in list(root.rglob("*")):
    if candidate.is_dir() and candidate.name in {"tests", "__pycache__"}:
        if candidate.resolve().is_relative_to(root):
            shutil.rmtree(candidate)

for relative in ("numpy/f2py", "numpy/typing", "numpy/doc", "pypdfium2_cli"):
    candidate = root / relative
    if candidate.is_dir() and candidate.resolve().is_relative_to(root):
        shutil.rmtree(candidate)

for stub in root.rglob("*.pyi"):
    if stub.is_file() and stub.resolve().is_relative_to(root):
        stub.unlink()
PY

fixture_dir="$build_dir/fixtures"
python3 "$ocr_dir/poc/make_fixtures.py" "$fixture_dir"

docker run --rm \
    --platform linux/amd64 \
    --entrypoint /bin/sh \
    -e 'PATH=/opt/bin:/var/lang/bin:/usr/local/bin:/usr/bin:/bin' \
    -e 'LD_LIBRARY_PATH=/opt/lib:/lib64:/usr/lib64' \
    -e 'TESSDATA_PREFIX=/opt/tesseract/share/tessdata' \
    -e 'PYTHONPATH=/opt/python:/src/infra/ocr/src:/src/infra/ocr/poc' \
    -v "$layer_dir:/opt:ro" \
    -v "$repo_root:/src:ro" \
    -v "$fixture_dir:/fixtures:ro" \
    public.ecr.aws/lambda/python:3.12 \
    -c '
set -eu
test -x /opt/bin/tesseract
test -d "$TESSDATA_PREFIX"
test -f "$TESSDATA_PREFIX/eng.traineddata"
test -f "$TESSDATA_PREFIX/hin.traineddata"
case "$PATH" in /opt/bin:*) ;; *) echo "Lambda layer bin path missing" >&2; exit 1 ;; esac
case "$LD_LIBRARY_PATH" in /opt/lib:*) ;; *) echo "Lambda layer library path missing" >&2; exit 1 ;; esac
touch /tmp/pramana-layer-write-check
rm /tmp/pramana-layer-write-check
python -c "import cv2, numpy, pypdfium2, pytesseract, platform, sys; assert sys.version_info[:2] == (3, 12); assert platform.machine() == \"x86_64\"; print(\"runtime imports: ok; python=\" + sys.version.split()[0] + \"; architecture=\" + platform.machine()); print(\"opencv=\" + cv2.__version__ + \"; numpy=\" + numpy.__version__)"
ldd /opt/bin/tesseract > /tmp/tesseract-ldd.txt
ldd /opt/lib/libtesseract.so.5 >> /tmp/tesseract-ldd.txt
if grep -q "not found" /tmp/tesseract-ldd.txt; then cat /tmp/tesseract-ldd.txt >&2; exit 1; fi
tesseract --version
languages="$(tesseract --list-langs)"
printf "%s\n" "$languages"
for language in eng hin; do
    if ! printf "%s\n" "$languages" | grep -qx "$language"; then
        echo "missing Tesseract language data: $language" >&2
        exit 1
    fi
done
python /src/infra/ocr/poc/run_poc.py --fixtures-dir /fixtures
'

archive="$build_dir/pramana-ocr-layer.zip"
(cd "$layer_dir" && zip -qr "$archive" .)
unzip -t "$archive" >/dev/null
unzipped_bytes="$(du -sb "$layer_dir" | cut -f1)"
zipped_bytes="$(du -sb "$archive" | cut -f1)"
if (( unzipped_bytes > 250 * 1024 * 1024 )); then
    printf 'Layer exceeds Lambda unzipped size limit: %s bytes\n' "$unzipped_bytes" >&2
    exit 1
fi
printf 'Layer archive: %s\n' "$archive"
printf 'Layer size: zipped=%s bytes unzipped=%s bytes\n' "$zipped_bytes" "$unzipped_bytes"
if (( zipped_bytes > 50 * 1024 * 1024 )); then
    printf 'Layer ZIP exceeds direct-upload limit; upload it from S3.\n'
fi
