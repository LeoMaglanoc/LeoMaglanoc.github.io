"""Estimated RGB-D SLAM or explicitly frozen GT-odometry oracle."""
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch_ros.actions import Node


def nodes(context):
    from launch.substitutions import LaunchConfiguration
    oracle = LaunchConfiguration('oracle').perform(context) == 'true'
    remappings=[('rgb/image','/camera/rgb/image_rect_color'),('depth/image','/camera/depth_registered/image_raw'),
                ('rgb/camera_info','/camera/rgb/camera_info'),('odom','/odom')]
    result=[]
    if not oracle:
        result.append(Node(package='rtabmap_odom',executable='rgbd_odometry',name='rgbd_odometry',output='screen',
            parameters=[{'frame_id':'camera_link','odom_frame_id':'odom','publish_tf':True,'approx_sync':False,
                         'queue_size':100,'Odom/Strategy':'0','Odom/ResetCountdown':'0','OdomF2M/BundleAdjustment':'1'}],
            remappings=remappings))
    params={'subscribe_depth':True,'subscribe_rgb':True,'subscribe_stereo':False,'subscribe_rgbd':False,
            'frame_id':'camera_link','publish_tf':False,'approx_sync':False,'qos_image':1,'qos_camera_info':1,
            'qos_odom':1,'queue_size':100,'database_path':LaunchConfiguration('database_path').perform(context),
            'Rtabmap/DetectionRate':'30.0','RGBD/LinearUpdate':'0.0','RGBD/AngularUpdate':'0.0',
            'Mem/IncrementalMemory':'true','Mem/ImageKept':'true'}
    if oracle:
        params['Optimizer/Iterations']='0'
        params['Rtabmap/LoopThr']='1.0'
        params['RGBD/ProximityBySpace']='false'
        params['RGBD/ProximityByTime']='false'
        params['Kp/MaxFeatures']='0'
        params['Mem/RehearsalSimilarity']='1.0'
    result.append(Node(package='rtabmap_slam',executable='rtabmap',name='rtabmap',output='screen',
                       arguments=['--delete_db_on_start'],parameters=[params],remappings=remappings))
    return result


def generate_launch_description():
    return LaunchDescription([DeclareLaunchArgument('database_path'),DeclareLaunchArgument('oracle',default_value='false'),OpaqueFunction(function=nodes)])
