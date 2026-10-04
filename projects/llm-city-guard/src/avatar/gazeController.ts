import { Vector3 } from 'three';

export class GazeController {
  private readonly target = new Vector3(0, 1.35, 2.2);
  private readonly current = this.target.clone();

  public setThinking(thinking: boolean, elapsed: number): void {
    this.target.set(thinking ? 0.32 + Math.sin(elapsed * 0.7) * 0.15 : 0, thinking ? 1.45 : 1.35, 2.2);
  }

  public update(delta: number): Vector3 {
    this.current.lerp(this.target, 1 - Math.exp(-delta * 4));
    return this.current;
  }
}
