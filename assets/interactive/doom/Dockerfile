FROM python:3.10-slim

ARG ARNOLD_REPOSITORY=https://github.com/glample/Arnold.git
ARG ARNOLD_REVISION=86af06d2fdb35c4bf552ecacfe8fe6ac1abd8cd4

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ARNOLD_DIR=/opt/arnold

WORKDIR /workspace

# ViZDoom's interactive renderer needs an X server even when the runner is
# automated. xvfb keeps the native reproduction fully contained in Docker.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      xvfb \
      xauth \
      ffmpeg \
      libgl1 \
      libglib2.0-0 \
      libx11-6 \
      libxext6 \
      libxrender1 \
      libsm6 \
    && rm -rf /var/lib/apt/lists/*

COPY assets/interactive/doom/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir \
      filelock==3.18.0 \
      fsspec==2025.3.2 \
      jinja2==3.1.6 \
      networkx==3.4.2 \
      sympy==1.13.3 \
      typing-extensions==4.13.2 \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu --no-deps torch==2.7.1+cpu \
    && pip install --no-cache-dir -r /tmp/requirements.txt

# Arnold has no explicit licence. This clone is deliberately image-local: it
# is never copied into the website source tree or emitted by the site service.
RUN git clone "$ARNOLD_REPOSITORY" "$ARNOLD_DIR" \
    && cd "$ARNOLD_DIR" \
    && git checkout --detach "$ARNOLD_REVISION"

# The 2018 source targets an old PyTorch API. Apply the documented, local-only
# compatibility patch so its original checkpoint can be inspected on Python 3.
COPY assets/interactive/doom/tools/apply_arnold_compat.py /tmp/apply_arnold_compat.py
RUN python /tmp/apply_arnold_compat.py "$ARNOLD_DIR"

CMD ["bash"]
