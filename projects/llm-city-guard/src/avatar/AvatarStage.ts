import { AmbientLight, Clock, Color, DirectionalLight, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { AvatarController } from './AvatarController';
import { loadVrm } from './loadVrm';
import type { AvatarLifecycle } from './types';
import type { Emotion } from '../game/types';

export class AvatarStage {
  public readonly canvas = document.createElement('canvas');
  public readonly ready: Promise<void>;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(28, 1, 0.1, 100);
  private readonly renderer: WebGLRenderer;
  private readonly clock = new Clock();
  private controller: AvatarController | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mount: HTMLElement | null = null;
  private frame: number | null = null;
  private emotion: Emotion = 'neutral';
  private lifecycle: AvatarLifecycle = 'idle';

  public constructor(deterministic = false) {
    this.canvas.className = 'avatar-canvas';
    this.canvas.setAttribute('aria-label', 'Rurik, the gatekeeper');
    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color(0x000000), 0);
    this.camera.position.set(0, 1.42, 4.4);
    this.camera.lookAt(0, 1.25, 0);
    this.scene.add(new AmbientLight(0x8298cc, 1.65));
    const key = new DirectionalLight(0xffd69c, 2.8);
    key.position.set(-2, 3.8, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0x7798df, 1.8);
    rim.position.set(3, 2, -3);
    this.scene.add(rim);
    this.ready = loadVrm(`${import.meta.env.BASE_URL}avatar/character.vrm`).then((vrm) => {
      vrm.scene.position.set(0, -1.72, 0);
      vrm.scene.rotation.y = Math.PI;
      this.scene.add(vrm.scene);
      this.controller = new AvatarController(vrm, deterministic);
      this.applyState();
    });
    this.render();
  }

  public attach(mount: HTMLElement): void {
    this.mount = mount;
    mount.replaceChildren(this.canvas);
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
  }

  public setState(emotion: Emotion, lifecycle: AvatarLifecycle): void {
    this.emotion = emotion;
    this.lifecycle = lifecycle;
    this.applyState();
  }

  public dispose(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }

  private applyState(): void {
    this.controller?.setEmotion(this.emotion);
    this.controller?.setLifecycle(this.lifecycle);
  }

  private resize(): void {
    if (!this.mount) return;
    const { width, height } = this.mount.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private render = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.controller?.update(delta, this.clock.elapsedTime);
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.render);
  };
}
