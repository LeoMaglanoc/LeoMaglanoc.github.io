# syntax=docker/dockerfile:1
FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1
WORKDIR /work
COPY requirements.lock .
RUN --mount=type=secret,id=proxy_ca,required=false sh -c 'if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; pip install --no-cache-dir -r requirements.lock'
ENV OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
CMD ["python", "tools/evaluate.py"]
