# CPU research runtime, pinned base and full Python dependency lock.
FROM python:3.10.16-slim-bookworm@sha256:f9fd9a142c9e3bc54d906053b756eb7e7e386ee1cf784d82c251cf640c502512
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates nodejs && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace/projects/euroguessr
COPY training/research-lock.txt /tmp/research-lock.txt
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r /tmp/research-lock.txt && pip check
ENV PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 HF_HOME=/cache/huggingface TORCH_HOME=/cache/torch
CMD ["python", "training/student_train.py", "--help"]
