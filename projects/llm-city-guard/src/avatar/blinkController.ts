export class BlinkController {
  private nextBlink = 2.2;
  private blinkTime = 0;
  public constructor(private readonly deterministic = false) {}

  public update(delta: number): number {
    this.nextBlink -= delta;
    if (this.nextBlink <= 0 && this.blinkTime <= 0) {
      this.blinkTime = 0.16;
      this.nextBlink = this.deterministic ? 3.6 : 2.8 + Math.random() * 2.4;
    }
    if (this.blinkTime <= 0) return 0;
    this.blinkTime -= delta;
    return Math.max(0, Math.sin((Math.max(0, this.blinkTime) / 0.16) * Math.PI));
  }
}
