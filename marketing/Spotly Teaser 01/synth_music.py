#!/usr/bin/env python3
# Original warm teaser music bed (pad + arp + bass + soft perc), builds to the map.
import numpy as np, wave, os
SR=44100; HERE=os.path.dirname(os.path.abspath(__file__))
BPM=104.0; beat=60.0/BPM; bar=4*beat; DUR=8*bar+0.5   # ~18.95s
N=int(DUR*SR); t=np.arange(N)/SR
rng=np.random.default_rng(7)
def midi(m): return 440.0*2**((m-69)/12.0)

def env(start,dur,a,d,s,r,sus=0.7):
    e=np.zeros(N); i0=int(start*SR); i1=min(N,int((start+dur)*SR))
    if i1<=i0: return e
    L=i1-i0; tt=np.arange(L)/SR; seg=np.ones(L)*s*sus
    ai=int(a*SR); di=int(d*SR); ri=int(r*SR)
    if ai>0: seg[:ai]=np.linspace(0,1,ai)
    if di>0: seg[ai:ai+di]=np.linspace(1,s*sus,min(di,L-ai))
    if ri>0 and L-ri>0: seg[L-ri:]*=np.linspace(1,0,ri)
    e[i0:i1]=seg; return e

def tone(freq,start,dur,a,d,s,r,harm=(1.0,0.25,0.08),sus=0.7,detune=0.004):
    e=env(start,dur,a,d,s,r,sus); ph=2*np.pi*freq*t
    w=np.zeros(N)
    for k,amp in enumerate(harm,1):
        w+=amp*np.sin(ph*k + 0.6*np.sin(2*np.pi*(freq*(1+detune))*t)*0.0)
    w+=0.5*np.sin(2*np.pi*freq*(1+detune)*t)  # gentle detuned layer
    return w*e

# progression C G Am F  x2  (close voicings)
PAD={0:[52,55,60],1:[50,55,59],2:[52,57,60],3:[53,57,60]}
ARP={0:[60,64,67,72],1:[59,62,67,71],2:[60,64,69,72],3:[60,65,69,72]}
BASS={0:36,1:31,2:33,3:29}
seq=[0,1,2,3,0,1,2,3]

mix=np.zeros(N)
# section gain over time (intro→build→peak→resolve)
def secgain(x):
    g=np.interp(x,[0,4.6,9.2,13.8,16.1,DUR],[0.0,0.55,0.8,1.0,1.0,0.6])
    return g
SG=secgain(t)

for b,ch in enumerate(seq):
    bs=b*bar
    # pad (sustained, warm)
    for m in PAD[ch]:
        mix+=0.10*tone(midi(m),bs,bar+0.2,0.35,0.4,0.85,0.5,harm=(1,0.2,0.05))
    # bass on beats 1 and 3
    for bt in (0,2):
        mix+=0.16*tone(midi(BASS[ch]),bs+bt*beat,beat*1.4,0.01,0.25,0.7,0.25,harm=(1,0.15))
    # arpeggio eighth notes
    arp=ARP[ch]
    for n in range(8):
        if b<1 and n%2==1: continue   # sparse in intro
        nm=arp[n%4]+ (12 if n>=4 else 0)
        st=bs+n*(beat/2)
        mix+=0.05*tone(midi(nm),st,beat*0.5,0.005,0.3,0.4,0.05,harm=(1,0.3,0.12),sus=0.6)

# percussion from bar 2
def kick(st):
    L=int(0.16*SR); i0=int(st*SR);
    if i0+L>N: L=N-i0
    tt=np.arange(L)/SR; f=110*np.exp(-tt*22)+45
    w=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*16)
    mix[i0:i0+L]+=0.5*w
def hat(st,g=0.12):
    L=int(0.05*SR); i0=int(st*SR)
    if i0+L>N: L=N-i0
    n=rng.standard_normal(L); n=np.diff(n,prepend=0)
    mix[i0:i0+L]+=g*n*np.exp(-np.arange(L)/SR*60)
def clap(st):
    L=int(0.12*SR); i0=int(st*SR)
    if i0+L>N: L=N-i0
    n=rng.standard_normal(L)*np.exp(-np.arange(L)/SR*30)
    mix[i0:i0+L]+=0.28*n

for b in range(2,8):
    bs=b*bar
    for bt in (0,2): kick(bs+bt*beat)
    for o in range(8): hat(bs+o*(beat/2), 0.10 if b<4 else 0.14)
    if b in (5,6):                      # claps at the peak
        for bt in (1,3): clap(bs+bt*beat)

# soft chime at the app-tap (~4.8s) + gentle pops at the map (13.3–16s)
def bell(st,f,g=0.18):
    e=env(st,1.2,0.005,0.6,0.3,0.5,0.6)
    mix[:]+=g*(np.sin(2*np.pi*f*t)+0.4*np.sin(2*np.pi*2*f*t)+0.2*np.sin(2*np.pi*3.01*f*t))*e
bell(4.8,midi(84),0.16)
for k,st in enumerate(np.linspace(13.3,16.0,6)):
    mix[:]+=0.10*(np.sin(2*np.pi*midi(72+k)*t))*env(st,0.5,0.004,0.3,0.4,0.05,0.6)

# apply section gain
mix*=SG

# cheap reverb (feedback taps)
def delay(sig,ms,g):
    d=int(ms*SR/1000); out=np.zeros(N); out[d:]=sig[:N-d]*g; return out
wet=delay(mix,90,0.25)+delay(mix,130,0.18)+delay(mix,190,0.12)+delay(mix,250,0.08)
out=mix*0.9+wet*0.6

# soft master: gentle tanh + normalize + fade in/out
out=np.tanh(out*1.1)
out/=np.max(np.abs(out))+1e-6; out*=0.92
fi=int(0.15*SR); out[:fi]*=np.linspace(0,1,fi)
fo=int(0.6*SR); out[-fo:]*=np.linspace(1,0,fo)

st=np.stack([out, np.roll(out,80)*0.97+out*0.03],1)  # slight stereo width
st/=np.max(np.abs(st))+1e-6; st*=0.95
pcm=(st*32767).astype('<i2')
path=HERE+"/_music_bed.wav"
with wave.open(path,'w') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("✓ wrote",path, f"({DUR:.1f}s)")
