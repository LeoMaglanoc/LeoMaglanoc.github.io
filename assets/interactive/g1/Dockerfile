FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /workspace

# The Unitree checkpoint is TorchScript. Use the CPU-only wheel so the
# reproducibility image does not download an unused CUDA runtime. Install the
# ordinary PyTorch dependencies from PyPI first because the CPU index has
# inconsistent metadata for a few dependency names.
RUN pip install --no-cache-dir \
      filelock==3.18.0 \
      fsspec==2025.3.2 \
      jinja2==3.1.6 \
      networkx==3.4.2 \
      sympy==1.13.3 \
      typing-extensions==4.13.2 && \
    pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu --no-deps torch==2.7.1+cpu
COPY requirements.txt /tmp/g1-requirements.txt
RUN pip install --no-cache-dir -r /tmp/g1-requirements.txt

CMD ["python", "assets/interactive/g1/tools/export_policy.py", "--help"]
