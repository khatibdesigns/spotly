#!/usr/bin/env python3
# Generate VO (macOS `say`), duck the music under it, mux into the silent CUT.
import subprocess, os, wave, sys, numpy as np, imageio_ffmpeg
HERE=os.path.dirname(os.path.abspath(__file__)); SR=44100
FF=imageio_ffmpeg.get_ffmpeg_exe()

VOICE={'en':('Samantha',168),'ar':('Majed',150)}
LINES={
 'en':[(0.45,"Another weekend already."),
       (4.70,"One tap, and the whole day's planned — for your kids, and the weather."),
       (13.45,"Every outing, a memory you keep."),
       (16.55,"Spotly. Coming soon.")],
 'ar':[(0.45,"ويكند ثاني، ووين نوديهم؟"),
       (4.70,"بضغطة وحدة، يومكم كله مرتب، على مزاج العيال وعلى الجو."),
       (13.45,"كل طلعة، ذكرى تبقى."),
       (16.55,"سبوتلي، قريبا.")],
}

def read_wav(p):
    with wave.open(p) as w:
        ch=w.getnchannels(); a=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(np.float32)/32768
    return a.reshape(-1,2) if ch==2 else np.stack([a,a],1)

def say_to_wav(voice,rate,text,out):
    aiff=out+".aiff"
    subprocess.run(["say","-v",voice,"-r",str(rate),"-o",aiff,text],check=True)
    subprocess.run([FF,"-y","-i",aiff,"-ar",str(SR),"-ac","2",out],
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    os.remove(aiff); return read_wav(out)

def build(lang):
    music=read_wav(HERE+"/_music_bed.wav")
    total=music.shape[0]
    vo=np.zeros((total,2),np.float32); duck=np.full(total,0.85,np.float32)
    for i,(ts,text) in enumerate(LINES[lang]):
        tmp=f"{HERE}/_vo_{lang}_{i}.wav"
        clip=say_to_wav(*VOICE[lang],text,tmp)
        clip*= (0.95/ (np.max(np.abs(clip))+1e-6))   # normalize each line
        s=int(ts*SR); e=min(total,s+clip.shape[0])
        vo[s:e]+=clip[:e-s]
        # duck music under this line (with 0.12s ramps)
        r=int(0.12*SR); a=max(0,s-r); b=min(total,e+r)
        seg=np.full(b-a,0.40);
        if s-a>0: seg[:s-a]=np.linspace(0.85,0.40,s-a)
        if b-e>0: seg[-(b-e):]=np.linspace(0.40,0.85,b-e)
        duck[a:b]=np.minimum(duck[a:b],seg)
    mix=music*duck[:,None]+vo*1.0
    mix=np.tanh(mix*1.05); mix/= (np.max(np.abs(mix))+1e-6); mix*=0.96
    outw=f"{HERE}/_mix_{lang}.wav"
    with wave.open(outw,'w') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix*32767).astype('<i2').tobytes())
    out=f"{HERE}/Spotly-Teaser01-{lang.upper()}-VO.mp4"
    subprocess.run([FF,"-y","-i",f"{HERE}/Spotly-Teaser01-{lang.upper()}-CUT.mp4","-i",outw,
                    "-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","192k","-shortest",out],
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    for i in range(len(LINES[lang])): os.remove(f"{HERE}/_vo_{lang}_{i}.wav")
    os.remove(outw); print("✓",os.path.basename(out))

for l in (sys.argv[1:] or ['en','ar']): build(l)
