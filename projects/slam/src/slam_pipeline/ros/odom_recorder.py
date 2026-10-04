"""Write RTAB-Map RGB-D odometry samples to an auditable TUM trajectory."""

from __future__ import annotations

import argparse
from pathlib import Path

import rclpy
from nav_msgs.msg import Odometry
from rclpy.node import Node
from rclpy.executors import ExternalShutdownException


class OdomRecorder(Node):
    def __init__(self, output: Path, topic: str) -> None:
        super().__init__("rgbd_odom_recorder")
        output.parent.mkdir(parents=True, exist_ok=True)
        self._stream = output.open("w", encoding="utf-8")
        self._count = 0
        self.create_subscription(Odometry, topic, self._on_odom, 100)

    def _on_odom(self, message: Odometry) -> None:
        stamp = message.header.stamp.sec + message.header.stamp.nanosec / 1e9
        pose = message.pose.pose
        self._stream.write(
            f"{stamp:.9f} {pose.position.x:.9f} {pose.position.y:.9f} {pose.position.z:.9f} "
            f"{pose.orientation.x:.9f} {pose.orientation.y:.9f} {pose.orientation.z:.9f} {pose.orientation.w:.9f}\n"
        )
        self._stream.flush()
        self._count += 1

    def close(self) -> None:
        self.get_logger().info(f"Recorded {self._count} RGB-D odometry poses")
        self._stream.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--topic", default="/odom")
    args = parser.parse_args()
    rclpy.init()
    node = OdomRecorder(args.output, args.topic)
    try:
        rclpy.spin(node)
    except ExternalShutdownException:
        pass
    finally:
        node.close()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
