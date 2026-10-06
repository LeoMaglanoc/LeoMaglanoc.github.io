// Preserve the independently validated G1 controller and runtime verbatim.
export class G1RLMode {
  async init(container) {
    this.frame = document.createElement('iframe');
    this.frame.title = 'G1 live reinforcement learning simulation';
    this.frame.src = new URL('../../../g1/index.html', import.meta.url).href;
    this.frame.allow = 'fullscreen';
    container.replaceChildren(this.frame);
  }
  dispose() { this.frame?.remove(); }
}
