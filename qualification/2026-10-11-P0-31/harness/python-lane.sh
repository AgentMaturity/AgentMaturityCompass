#!/bin/bash
# P0-31 Python installed-wheel lane (AMC-1538). Usage: python-lane.sh <source clone at the RC> <new work dir> [python]
# PyPI supplies only setuptools/wheel (the declared build requirement) and pytest (the declared dev extra);
# the wheel itself declares no dependencies and is installed with --no-index.
set -eu
SRC=$1 W=$2 PY=${3:-python3}
export PYTHONDONTWRITEBYTECODE=1
mkdir "$W"; cd "$W"
"$PY" -m venv build && build/bin/pip install -q "setuptools>=68" wheel
build/bin/pip wheel -q --no-deps --no-build-isolation -w wheel "$SRC/sdk/python"
"$PY" -m venv consumer && consumer/bin/pip install -q --no-index wheel/*.whl
"$PY" -m venv runner && runner/bin/pip install -q "pytest>=8"
echo "== python $("$PY" --version 2>&1)"
echo "== build venv"; build/bin/pip freeze
echo "== runner venv"; runner/bin/pip freeze
echo "== consumer venv"; consumer/bin/pip freeze
echo "== wheel"; (sha256sum wheel/*.whl 2>/dev/null || shasum -a 256 wheel/*.whl)
AMC_PYTHON_INSTALLED="$W/consumer/bin/python" runner/bin/python -m pytest -p no:cacheprovider -q -rA "$SRC/sdk/python/tests/test_validation_installed.py"
