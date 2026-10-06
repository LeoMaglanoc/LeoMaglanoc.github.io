FROM mambaorg/micromamba:2.3.2
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential cmake && rm -rf /var/lib/apt/lists/*
COPY environment.lock /tmp/environment.lock
USER $MAMBA_USER
RUN micromamba install -y -n base --file /tmp/environment.lock && micromamba clean --all --yes
USER root
RUN git clone https://github.com/lukasmolnar/wb-mpc-locoman.git /opt/wb-mpc && cd /opt/wb-mpc && git checkout 80e906d35d91783e85e1ef994023ca9082dc40c3
ENV PYTHONUNBUFFERED=1 MPLBACKEND=Agg OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /opt/wb-mpc
