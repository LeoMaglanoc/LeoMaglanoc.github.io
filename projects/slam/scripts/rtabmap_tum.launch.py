"""Minimal headless RTAB-Map launch for the recorded RGB-D benchmark."""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description() -> LaunchDescription:
    return LaunchDescription([
        DeclareLaunchArgument("database_path", default_value="/workspace/outputs/rtabmap.db"),
        Node(
            package="rtabmap_slam",
            executable="rtabmap",
            name="rtabmap",
            output="screen",
            arguments=["--delete_db_on_start"],
            parameters=[{
                "subscribe_depth": True,
                "subscribe_rgb": True,
                "subscribe_stereo": False,
                "subscribe_rgbd": False,
                "frame_id": "camera_link",
                "publish_tf": False,
                # Dataset-player emits a single, exact timestamp for RGB, depth,
                # camera info and external odometry. Exact sync prevents a tuple
                # from being paired with a neighbouring recorded frame.
                "approx_sync": False,
                "qos_image": 1,
                "qos_camera_info": 1,
                "qos_odom": 1,
                "database_path": LaunchConfiguration("database_path"),
                "Rtabmap/DetectionRate": "30.0",
                "RGBD/LinearUpdate": "0.0",
                "RGBD/AngularUpdate": "0.0",
                "Mem/IncrementalMemory": "true",
            }],
            remappings=[
                ("rgb/image", "/camera/rgb/image_rect_color"),
                ("depth/image", "/camera/depth_registered/image_raw"),
                ("rgb/camera_info", "/camera/rgb/camera_info"),
                ("odom", "/odom"),
            ],
        ),
    ])
