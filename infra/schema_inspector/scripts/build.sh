#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
inspector_dir="$(cd "${script_dir}/.." && pwd)"
package_dir="${inspector_dir}/dist/package"

rm -rf "${package_dir}"
mkdir -p "${package_dir}"
cp "${inspector_dir}/src/handler.py" "${package_dir}/handler.py"

python3 -m pip install \
  --disable-pip-version-check \
  --no-compile \
  --no-deps \
  --only-binary=:all: \
  --target "${package_dir}" \
  --platform manylinux_2_17_x86_64 \
  --python-version 3.12 \
  --implementation cp \
  --abi cp312 \
  -r "${inspector_dir}/requirements.txt"

python3 -m compileall -q "${package_dir}/handler.py"
printf 'Lambda package ready: %s\n' "${package_dir}"
