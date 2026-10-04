"""Deterministic original synthesized audio, generated offline (no live synthesis)."""
import wave, random, math, struct
from pathlib import Path
random.seed(37)
out=Path(__file__).resolve().parents[1]/'godot/audio'; out.mkdir(exist_ok=True)
rate=22050
for name,duration in [('wind',8),('hum',4),('pickup',.5),('door',.7),('engine',4)]:
    data=[]; filtered=0
    for i in range(int(rate*duration)):
        t=i/rate; noise=random.uniform(-1,1); filtered=.98*filtered+.02*noise
        if name=='wind': value=filtered*.65*(.7+.3*math.sin(t*math.pi/4))
        elif name=='hum': value=.025*(math.sin(2*math.pi*55*t)+.4*math.sin(2*math.pi*110*t))
        elif name=='pickup': value=.15*math.sin(2*math.pi*(550+400*t)*t)*math.exp(-t*9)
        elif name=='door': value=filtered*.6*math.sin(math.pi*t/duration)
        else: value=(.07*math.sin(2*math.pi*80*t)+filtered*.5)*min(t,1)
        # Seamless quiet loop boundaries and gentle transient fade.
        value*=min(1,t/.05,(duration-t)/.05)
        data.append(struct.pack('<h',int(max(-1,min(1,value))*32767)))
    with wave.open(str(out/f'{name}.wav'),'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate); f.writeframes(b''.join(data))
