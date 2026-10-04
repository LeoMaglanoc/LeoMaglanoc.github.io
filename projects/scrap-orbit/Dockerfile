FROM debian:bookworm-slim
ARG GODOT_VERSION=4.7.2
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip python3 libx11-6 libxcursor1 libxinerama1 libxi6 libxrandr2 libgl1 libfontconfig1 && rm -rf /var/lib/apt/lists/*
RUN curl -fL --retry 3 "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip" -o /tmp/godot.zip && unzip /tmp/godot.zip -d /tmp && mv /tmp/Godot_v${GODOT_VERSION}-stable_linux.x86_64 /usr/local/bin/godot && chmod +x /usr/local/bin/godot && rm /tmp/godot.zip
RUN curl -fL --retry 3 "https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_export_templates.tpz" -o /tmp/templates.zip && mkdir -p /opt/godot/export_templates/${GODOT_VERSION}.stable && unzip -j /tmp/templates.zip 'templates/web*' -d /opt/godot/export_templates/${GODOT_VERSION}.stable && rm /tmp/templates.zip
ENV GODOT_SILENCE_ROOT_WARNING=1 XDG_DATA_HOME=/opt
WORKDIR /workspace/projects/scrap-orbit
