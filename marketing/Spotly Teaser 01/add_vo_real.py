#!/usr/bin/env python3
# Swap in the real ElevenLabs VO (_vo/{lang}-N.mp3), duck music, mux into CUT.
import subprocess, os, wave, sys, numpy as np, imageio_ffmpeg
HERE=os.path.dirname(os.path.abspath(__file__)); SR=44100
FF=imageio_ffmpeg.get_ffmpeg_exe(); VO=HERE+"/_vo"
TS={'en':[0.45,4.70,13.55,16.45],'ar':[0.45,4.70,13.55,16.15]}

def read_wav(p):
    with wave.open(p) as w:
        ch=w.getnchannels(); a=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32)/32768
    return a.reshape(-1,2) if ch==2 else np.stack([a,a],1)

def mp3_arr(path):
    wv=path+".wav"
    subprocess.run([FF,"-y","-i",path,"-ar",str(SR),"-ac","2",wv],
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    a=read_wav(wv); os.remove(wv); return a

def build(lang):
    music=read_wav(HERE+"/_music_bed.wav"); total=music.shape[0]
    vo=np.zeros((total,2),np.float32); duck=np.full(total,0.85,np.float32)
    for i,ts in enumerate(TS[lang]):
        clip=mp3_arr(f"{VO}/{lang}-{i+1}.mp3")
        clip*= 0.92/(np.max(np.abs(clip))+1e-6)
        s=int(ts*SR); e=min(total,s+clip.shape[0]); vo[s:e]+=clip[:e-s]
        r=int(0.14*SR); a=max(0,s-r); b=min(total,e+r); seg=np.full(b-a,0.38)
        if s-a>0: seg[:s-a]=np.linspace(0.85,0.38,s-a)
        if b-e>0: seg[-(b-e):]=np.linspace(0.38,0.85,b-e)
        duck[a:b]=np.minimum(duck[a:b],seg)
    mix=music*duck[:,None]+vo
    mix=np.tanh(mix*1.04); mix/=(np.max(np.abs(mix))+1e-6); mix*=0.96
    mw=f"{HERE}/_mixr_{lang}.wav"
    with wave.open(mw,'w') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix*32767).astype('<i2').tobytes())
    out=f"{HERE}/Spotly-Teaser01-{lang.upper()}-VO.mp4"
    subprocess.run([FF,"-y","-i",f"{HERE}/Spotly-Teaser01-{lang.upper()}-CUT.mp4","-i",mw,
                    "-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","192k","-shortest",out],
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    os.remove(mw); print("✓",os.path.basename(out))

for l in (sys.argv[1:] or ['en','ar']): build(l)
