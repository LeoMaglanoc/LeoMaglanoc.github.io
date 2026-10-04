FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV ROS_DISTRO=jazzy
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg lsb-release locales git wget unzip \
    python3 python3-pip python3-venv python3-dev build-essential \
    libgl1 libglib2.0-0 libxrender1 libsm6 libxext6 \
    && locale-gen C.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \
    -o /usr/share/keyrings/ros-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu noble main" \
    > /etc/apt/sources.list.d/ros2.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       ros-jazzy-ros-base ros-jazzy-rtabmap-ros ros-jazzy-cv-bridge \
       ros-jazzy-image-transport ros-jazzy-tf2-ros ros-jazzy-tf2 \
       ros-jazzy-message-filters ros-jazzy-sensor-msgs ros-jazzy-nav-msgs \
       ros-jazzy-geometry-msgs ros-jazzy-camera-info-manager \
       ros-jazzy-rosbag2-storage-mcap python3-rosdep \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY requirements.txt pyproject.toml /workspace/
RUN python3 -m venv --system-site-packages /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt \
    && /opt/venv/bin/pip install --no-cache-dir -e .

ENV PATH=/opt/venv/bin:$PATH
ENV PYTHONPATH=/workspace/src:$PYTHONPATH
RUN echo 'source /opt/ros/jazzy/setup.bash' >> /etc/bash.bashrc

CMD ["bash"]
