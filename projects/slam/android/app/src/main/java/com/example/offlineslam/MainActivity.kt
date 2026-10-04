package com.example.offlineslam

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.graphics.Rect
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.Image
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.Surface
import android.widget.Button
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.DeadlineExceededException
import com.google.ar.core.exceptions.NotYetAvailableException
import java.io.BufferedWriter
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.sqrt

private const val TAG = "OfflineSlamRecorder"

class MainActivity : Activity(), SensorEventListener {
    private lateinit var glView: GLSurfaceView
    private lateinit var status: TextView
    private lateinit var button: Button
    private lateinit var sensorManager: SensorManager
    private var session: Session? = null
    private var recorder: RecordingWriter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), 10)
            return
        }
        initialize()
    }

    private fun initialize() {
        try {
            if (ArCoreApk.getInstance().requestInstall(this, true) == ArCoreApk.InstallStatus.INSTALL_REQUESTED) return
            session = Session(this)
            session!!.configure(Config(session).apply {
                updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                depthMode = if (session!!.isDepthModeSupported(Config.DepthMode.RAW_DEPTH_ONLY)) Config.DepthMode.RAW_DEPTH_ONLY else Config.DepthMode.DISABLED
            })
        } catch (error: Exception) {
            setContentView(TextView(this).apply { text = "ARCore initialization failed: ${error.message}" })
            return
        }
        status = TextView(this).apply {
            text = "Ready. Raw Depth support: ${session!!.isDepthModeSupported(Config.DepthMode.RAW_DEPTH_ONLY)}"
            setTextColor(0xFFFFFFFF.toInt()); setBackgroundColor(0x99000000.toInt()); setPadding(24, 18, 24, 18)
        }
        button = Button(this).apply { text = "Start recording"; setOnClickListener { toggleRecording() } }
        glView = GLSurfaceView(this).apply {
            setEGLContextClientVersion(2); setRenderer(ArRenderer()); renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }
        setContentView(FrameLayout(this).apply {
            addView(glView)
            addView(status, FrameLayout.LayoutParams(-2, -2).apply { gravity = Gravity.TOP or Gravity.START })
            addView(button, FrameLayout.LayoutParams(-2, -2).apply { gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL })
        })
    }

    private fun toggleRecording() {
        if (recorder == null) {
            recorder = RecordingWriter(File(filesDir, "recordings"))
            startSensors(); button.text = "Stop recording"; status.text = "Recording Raw Depth…"
        } else finishRecording("Saved")
    }

    private fun finishRecording(prefix: String) {
        sensorManager.unregisterListener(this)
        val summary = recorder?.finish() ?: return
        recorder = null; button.text = "Start recording"
        status.text = "$prefix ${summary.directory.name}\n${summary.compact()}"
    }

    private fun startSensors() {
        sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    override fun onSensorChanged(event: SensorEvent) {
        val active = recorder ?: return
        if (event.values.size < 3) return
        when (event.sensor.type) {
            Sensor.TYPE_GYROSCOPE -> active.recordGyroscope(event.timestamp, event.values[0], event.values[1], event.values[2])
            Sensor.TYPE_ACCELEROMETER -> active.recordAccelerometer(event.timestamp, event.values[0], event.values[1], event.values[2])
        }
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    override fun onResume() { super.onResume(); if (::glView.isInitialized) { session?.resume(); glView.onResume() } }
    override fun onPause() { if (recorder != null) finishRecording("Recording stopped on pause:"); if (::glView.isInitialized) glView.onPause(); session?.pause(); super.onPause() }
    override fun onDestroy() { if (recorder != null) finishRecording("Recording stopped:"); session?.close(); super.onDestroy() }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 10 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) initialize()
    }

    private inner class ArRenderer : GLSurfaceView.Renderer {
        private var cameraTexture = 0
        override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
            val textures = IntArray(1); GLES20.glGenTextures(1, textures, 0); cameraTexture = textures[0]
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTexture)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
            session?.setCameraTextureName(cameraTexture)
        }
        override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
            GLES20.glViewport(0, 0, width, height); session?.setDisplayGeometry(display?.rotation ?: Surface.ROTATION_0, width, height)
        }
        override fun onDrawFrame(gl: GL10?) {
            val frame = try { session?.update() ?: return } catch (error: Exception) { Log.e(TAG, "ARCore frame update failed", error); return }
            GLES20.glClearColor(0f, 0f, 0f, 1f); GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            if (frame.camera.trackingState == TrackingState.TRACKING) recorder?.record(frame)
        }
    }
}

private sealed class WriterEvent {
    data class FramePacket(
        val frameId: Int, val rgbTimestampNs: Long, val depthTimestampNs: Long, val poseTimestampNs: Long,
        val yuvNv21: ByteArray, val rgbWidth: Int, val rgbHeight: Int, val depthBytes: ByteArray,
        val depthWidth: Int, val depthHeight: Int, val confidenceBytes: ByteArray,
        val tx: Float, val ty: Float, val tz: Float, val qx: Float, val qy: Float, val qz: Float, val qw: Float,
        val rgbFx: Float, val rgbFy: Float, val rgbCx: Float, val rgbCy: Float,
        val depthFx: Float, val depthFy: Float, val depthCx: Float, val depthCy: Float,
        val textureToImageCorners: FloatArray,
    ) : WriterEvent()
    data class ImuPacket(val timestampNs: Long, val gx: Float?, val gy: Float?, val gz: Float?, val ax: Float?, val ay: Float?, val az: Float?) : WriterEvent()
    data object Stop : WriterEvent()
}

private data class RecordingSummary(
    val directory: File, val attempted: Int, val recorded: Int, val skippedReprojected: Int, val rgbMisses: Int,
    val depthMisses: Int, val queueDrops: Int, val imuSamples: Int, val unexpectedErrors: Int,
) { fun compact() = "depth=$recorded, skipped=$skippedReprojected, drops=$queueDrops, imu=$imuSamples, errors=$unexpectedErrors" }

/** Copies ARCore Images promptly; JPEG encoding and disk I/O run on a bounded background queue. */
private class RecordingWriter(private val root: File) {
    private val directory = File(root, "recording_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()))
    private val rgbDir = File(directory, "rgb")
    private val depthDir = File(directory, "depth")
    private val confidenceDir = File(directory, "confidence")
    private val events = ArrayBlockingQueue<WriterEvent>(24)
    private val accepting = AtomicBoolean(true)
    private val frameIndex = AtomicInteger(0)
    private val attempted = AtomicInteger(0); private val recorded = AtomicInteger(0); private val skippedReprojected = AtomicInteger(0)
    private val rgbMisses = AtomicInteger(0); private val depthMisses = AtomicInteger(0); private val queueDrops = AtomicInteger(0)
    private val imuSamples = AtomicInteger(0); private val unexpectedErrors = AtomicInteger(0); private val lastDepthTimestamp = AtomicLong(Long.MIN_VALUE)
    private val frames: BufferedWriter; private val poses: BufferedWriter; private val imu: BufferedWriter
    private var manifestWritten = false
    private val writerThread: Thread

    init {
        rgbDir.mkdirs(); depthDir.mkdirs(); confidenceDir.mkdirs()
        frames = BufferedWriter(OutputStreamWriter(FileOutputStream(File(directory, "frames.csv"))))
        poses = BufferedWriter(OutputStreamWriter(FileOutputStream(File(directory, "poses.csv"))))
        imu = BufferedWriter(OutputStreamWriter(FileOutputStream(File(directory, "imu.csv"))))
        frames.write("frame_id,rgb_timestamp_ns,depth_timestamp_ns,pose_timestamp_ns,rgb_path,depth_path,confidence_path,rgb_fx,rgb_fy,rgb_cx,rgb_cy,depth_fx,depth_fy,depth_cx,depth_cy,rgb_width,rgb_height,depth_width,depth_height,is_new_depth,tracking_state,tex_to_image_00_x,tex_to_image_00_y,tex_to_image_10_x,tex_to_image_10_y,tex_to_image_11_x,tex_to_image_11_y,tex_to_image_01_x,tex_to_image_01_y\n")
        poses.write("timestamp_ns,tx,ty,tz,qx,qy,qz,qw,tracking_state\n"); imu.write("timestamp_ns,gx,gy,gz,ax,ay,az\n")
        writerThread = Thread(::writerLoop, "offline-slam-writer").apply { start() }
    }

    fun record(frame: Frame) {
        if (!accepting.get()) return
        attempted.incrementAndGet(); var depth: Image? = null; var confidence: Image? = null; var rgb: Image? = null; var acquiredDepth = false
        try {
            depth = frame.acquireRawDepthImage16Bits(); acquiredDepth = true
            if (depth.timestamp == lastDepthTimestamp.get()) { skippedReprojected.incrementAndGet(); return }
            lastDepthTimestamp.set(depth.timestamp)
            confidence = frame.acquireRawDepthConfidenceImage(); rgb = frame.acquireCameraImage()
            if (!events.offer(buildFramePacket(frame, rgb, depth, confidence))) queueDrops.incrementAndGet()
        } catch (_: NotYetAvailableException) { if (acquiredDepth) rgbMisses.incrementAndGet() else depthMisses.incrementAndGet()
        } catch (_: DeadlineExceededException) { rgbMisses.incrementAndGet()
        } catch (error: Exception) { unexpectedErrors.incrementAndGet(); Log.e(TAG, "Unexpected ARCore recording error", error)
        } finally { rgb?.close(); confidence?.close(); depth?.close() }
    }

    fun recordGyroscope(timestampNs: Long, x: Float, y: Float, z: Float) = offerImu(WriterEvent.ImuPacket(timestampNs, x, y, z, null, null, null))
    fun recordAccelerometer(timestampNs: Long, x: Float, y: Float, z: Float) = offerImu(WriterEvent.ImuPacket(timestampNs, null, null, null, x, y, z))
    private fun offerImu(packet: WriterEvent.ImuPacket) { if (accepting.get() && !events.offer(packet)) queueDrops.incrementAndGet() }

    fun finish(): RecordingSummary {
        if (accepting.compareAndSet(true, false)) { events.put(WriterEvent.Stop); writerThread.join() }
        val summary = RecordingSummary(directory, attempted.get(), recorded.get(), skippedReprojected.get(), rgbMisses.get(), depthMisses.get(), queueDrops.get(), imuSamples.get(), unexpectedErrors.get())
        File(directory, "session_summary.json").writeText("""{"rgb_frames_attempted":${summary.attempted},"new_raw_depth_frames_recorded":${summary.recorded},"reprojected_depth_frames_skipped":${summary.skippedReprojected},"rgb_acquisition_misses":${summary.rgbMisses},"depth_acquisition_misses":${summary.depthMisses},"writer_queue_drops":${summary.queueDrops},"imu_samples":${summary.imuSamples},"unexpected_errors":${summary.unexpectedErrors}}""")
        return summary
    }

    private fun buildFramePacket(frame: Frame, rgb: Image, depth: Image, confidence: Image): WriterEvent.FramePacket {
        val camera = frame.camera; val image = camera.imageIntrinsics; val texture = camera.textureIntrinsics; val textureDims = texture.imageDimensions
        val imageCorners = FloatArray(8)
        frame.transformCoordinates2d(Coordinates2d.TEXTURE_NORMALIZED, floatArrayOf(0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f), Coordinates2d.IMAGE_PIXELS, imageCorners)
        val pose = convertedPose(frame); val q = matrixToQuaternion(pose)
        return WriterEvent.FramePacket(
            frameIndex.getAndIncrement(), frame.timestamp, depth.timestamp, frame.timestamp, yuv420ToNv21(rgb), rgb.width, rgb.height,
            copyRawPlane(depth, 2), depth.width, depth.height, copyRawPlane(confidence, 1), pose[3], pose[7], pose[11], q[0], q[1], q[2], q[3],
            image.focalLength[0], image.focalLength[1], image.principalPoint[0], image.principalPoint[1],
            texture.focalLength[0] * depth.width / textureDims[0], texture.focalLength[1] * depth.height / textureDims[1],
            texture.principalPoint[0] * depth.width / textureDims[0], texture.principalPoint[1] * depth.height / textureDims[1], imageCorners,
        )
    }

    private fun writerLoop() {
        try {
            while (true) when (val event = events.take()) {
                is WriterEvent.FramePacket -> writeFrame(event); is WriterEvent.ImuPacket -> writeImu(event); WriterEvent.Stop -> break
            }
        } catch (error: Exception) { unexpectedErrors.incrementAndGet(); Log.e(TAG, "Writer thread failed", error)
        } finally { frames.flush(); poses.flush(); imu.flush(); frames.close(); poses.close(); imu.close() }
    }

    private fun writeFrame(packet: WriterEvent.FramePacket) {
        val stem = "%09d".format(Locale.US, packet.frameId)
        writeJpeg(packet.yuvNv21, packet.rgbWidth, packet.rgbHeight, File(rgbDir, "$stem.jpg"))
        FileOutputStream(File(depthDir, "$stem.bin")).use { it.write(packet.depthBytes) }; FileOutputStream(File(confidenceDir, "$stem.bin")).use { it.write(packet.confidenceBytes) }
        if (!manifestWritten) {
            File(directory, "manifest.json").writeText("""{"format":"offline-slam-phone-v2","pose_convention":"T_world_camera","pose_camera_axes":"x_right_y_down_z_forward","depth_encoding":"uint16_little_endian_millimeters","depth_scale":0.001,"depth_width":${packet.depthWidth},"depth_height":${packet.depthHeight},"rgb_width":${packet.rgbWidth},"rgb_height":${packet.rgbHeight},"depth_coordinate_system":"texture_intrinsics_scaled_to_raw_depth","rgb_coordinate_system":"cpu_image_pixels","cpu_rgb_mapping":"texture_normalized_to_image_pixels_per_frame","record_new_depth_only":true,"confidence_encoding":"uint8"}""")
            manifestWritten = true
        }
        fun f(value: Float) = "%.9f".format(Locale.US, value)
        val c = packet.textureToImageCorners
        frames.write("${packet.frameId},${packet.rgbTimestampNs},${packet.depthTimestampNs},${packet.poseTimestampNs},rgb/$stem.jpg,depth/$stem.bin,confidence/$stem.bin,${f(packet.rgbFx)},${f(packet.rgbFy)},${f(packet.rgbCx)},${f(packet.rgbCy)},${f(packet.depthFx)},${f(packet.depthFy)},${f(packet.depthCx)},${f(packet.depthCy)},${packet.rgbWidth},${packet.rgbHeight},${packet.depthWidth},${packet.depthHeight},true,TRACKING,${f(c[0])},${f(c[1])},${f(c[2])},${f(c[3])},${f(c[4])},${f(c[5])},${f(c[6])},${f(c[7])}\n")
        poses.write("${packet.poseTimestampNs},${f(packet.tx)},${f(packet.ty)},${f(packet.tz)},${f(packet.qx)},${f(packet.qy)},${f(packet.qz)},${f(packet.qw)},TRACKING\n")
        recorded.incrementAndGet()
    }
    private fun writeImu(packet: WriterEvent.ImuPacket) {
        fun value(number: Float?) = number?.let { "%.9f".format(Locale.US, it) } ?: ""
        imu.write("${packet.timestampNs},${value(packet.gx)},${value(packet.gy)},${value(packet.gz)},${value(packet.ax)},${value(packet.ay)},${value(packet.az)}\n"); imuSamples.incrementAndGet()
    }
    private fun writeJpeg(nv21: ByteArray, width: Int, height: Int, file: File) { FileOutputStream(file).use { android.graphics.YuvImage(nv21, ImageFormat.NV21, width, height, null).compressToJpeg(Rect(0, 0, width, height), 90, it) } }
    private fun copyRawPlane(image: Image, bytesPerPixel: Int): ByteArray {
        val plane = image.planes[0]; val source = plane.buffer.duplicate(); val output = ByteArray(image.width * image.height * bytesPerPixel); var destination = 0
        for (y in 0 until image.height) for (x in 0 until image.width) { val offset = y * plane.rowStride + x * plane.pixelStride; for (byte in 0 until bytesPerPixel) output[destination++] = source.get(offset + byte) }
        return output
    }
    private fun yuv420ToNv21(image: Image): ByteArray {
        val width = image.width; val height = image.height; val output = ByteArray(width * height * 3 / 2); copyPlane(image.planes[0], width, height, output, 0)
        val u = image.planes[1]; val v = image.planes[2]; val ub = u.buffer.duplicate(); val vb = v.buffer.duplicate(); var index = width * height
        for (y in 0 until height / 2) for (x in 0 until width / 2) { output[index++] = vb.get(y * v.rowStride + x * v.pixelStride); output[index++] = ub.get(y * u.rowStride + x * u.pixelStride) }
        return output
    }
    private fun copyPlane(plane: Image.Plane, width: Int, height: Int, output: ByteArray, start: Int) { val source = plane.buffer.duplicate(); var index = start; for (y in 0 until height) for (x in 0 until width) output[index++] = source.get(y * plane.rowStride + x * plane.pixelStride) }
    private fun convertedPose(frame: Frame): FloatArray {
        val ar = FloatArray(16); frame.camera.pose.toMatrix(ar, 0); val rowMajor = FloatArray(16)
        for (row in 0..3) for (column in 0..3) rowMajor[row * 4 + column] = ar[column * 4 + row]
        val converted = rowMajor.copyOf(); for (row in 0..2) { converted[row * 4 + 1] = -rowMajor[row * 4 + 1]; converted[row * 4 + 2] = -rowMajor[row * 4 + 2] }; return converted
    }
    private fun matrixToQuaternion(matrix: FloatArray): FloatArray {
        val trace = matrix[0] + matrix[5] + matrix[10]; val q = FloatArray(4)
        if (trace > 0f) { val s = sqrt(trace + 1f) * 2f; q[3] = .25f * s; q[0] = (matrix[9] - matrix[6]) / s; q[1] = (matrix[2] - matrix[8]) / s; q[2] = (matrix[4] - matrix[1]) / s
        } else if (matrix[0] > matrix[5] && matrix[0] > matrix[10]) { val s = sqrt(1f + matrix[0] - matrix[5] - matrix[10]) * 2f; q[3] = (matrix[9] - matrix[6]) / s; q[0] = .25f * s; q[1] = (matrix[1] + matrix[4]) / s; q[2] = (matrix[2] + matrix[8]) / s
        } else if (matrix[5] > matrix[10]) { val s = sqrt(1f + matrix[5] - matrix[0] - matrix[10]) * 2f; q[3] = (matrix[2] - matrix[8]) / s; q[0] = (matrix[1] + matrix[4]) / s; q[1] = .25f * s; q[2] = (matrix[6] + matrix[9]) / s
        } else { val s = sqrt(1f + matrix[10] - matrix[0] - matrix[5]) * 2f; q[3] = (matrix[4] - matrix[1]) / s; q[0] = (matrix[2] + matrix[8]) / s; q[1] = (matrix[6] + matrix[9]) / s; q[2] = .25f * s }
        return q
    }
}
