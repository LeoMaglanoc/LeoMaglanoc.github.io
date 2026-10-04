"""Headless RGB-D odometry plus RTAB-Map mapping for the public TUM demo."""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description() -> LaunchDescription:
    return LaunchDescription([
        DeclareLaunchArgument("database_path", default_value="/workspace/outputs/rtabmap.db"),
        Node(
            package="rtabmap_odom", executable="rgbd_odometry", name="rgbd_odometry", output="screen",
            parameters=[{
                "frame_id": "camera_link", "odom_frame_id": "odom", "publish_tf": True,
                "approx_sync": False, "queue_size": 100, "Odom/Strategy": "0",
                "Odom/ResetCountdown": "0", "OdomF2M/BundleAdjustment": "1",
            }],
            remappings=[
                ("rgb/image", "/camera/rgb/image_rect_color"),
                ("depth/image", "/camera/depth_registered/image_raw"),
                ("rgb/camera_info", "/camera/rgb/camera_info"),
                ("odom", "/odom"),
            ],
        ),
        Node(
            package="rtabmap_slam", executable="rtabmap", name="rtabmap", output="screen",
            arguments=["--delete_db_on_start"],
            parameters=[{
                "subscribe_depth": True, "subscribe_rgb": True, "subscribe_stereo": False,
                "subscribe_rgbd": False, "frame_id": "camera_link", "publish_tf": False,
                "approx_sync": False, "qos_image": 1, "qos_camera_info": 1, "qos_odom": 1,
                "database_path": LaunchConfiguration("database_path"),
                "Rtabmap/DetectionRate": "30.0", "RGBD/LinearUpdate": "0.0",
                "RGBD/AngularUpdate": "0.0", "Mem/IncrementalMemory": "true",
                # Keep RGB observations attached to signatures so the native
                # exporter can later assemble UV textures from this DB.
                "Mem/ImageKept": "true",
            }],
            remappings=[
                ("rgb/image", "/camera/rgb/image_rect_color"),
                ("depth/image", "/camera/depth_registered/image_raw"),
                ("rgb/camera_info", "/camera/rgb/camera_info"), ("odom", "/odom"),
            ],
        ),
    ])
