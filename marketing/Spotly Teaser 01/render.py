#!/usr/bin/env python3
# Spotly Teaser 01 — motion-graphics animatic renderer (brand spine).
#   python3 render.py en   |   python3 render.py ar
import sys, os, math
from PIL import Image, ImageDraw, ImageFont
import imageio.v2 as imageio
import numpy as np
import arabic_reshaper
from bidi.algorithm import get_display

W, H, FPS = 1080, 1920, 24
DUR = 17.2
HERE = os.path.dirname(os.path.abspath(__file__))
FD = HERE + "/_fonts"
CORAL=(250,121,89); CORAL_D=(227,93,60); CREAM=(252,250,246); INK=(36,26,21)
SAGE=(57,139,119); SUN=(235,170,80); SKY=(120,150,210); GREY=(176,166,156)

def jak(sz,w=800):
    f=ImageFont.truetype(FD+"/Jakarta.ttf",sz)
    try: f.set_variation_by_axes([w])
    except: pass
    return f
DAMASCUS="/System/Library/Fonts/Supplemental/Damascus.ttc"  # full Arabic presentation-form coverage
def cai(sz,w=800):
    # Damascus Bold (idx 6) for headlines, Medium (idx 4) for lighter text.
    return ImageFont.truetype(DAMASCUS,sz,index=(6 if w>=650 else 4))
def shape_ar(s): return get_display(arabic_reshaper.reshape(s))

def clamp(x,a=0.0,b=1.0): return max(a,min(b,x))
def smooth(x): x=clamp(x); return x*x*(3-2*x)
def seg(t,a,b): return smooth((t-a)/(b-a)) if b>a else 0.0
def lerp(a,b,x): return a+(b-a)*x
def pop(x):  # ease-out-back
    x=clamp(x); c1=1.70158; c3=c1+1
    return 1+c3*(x-1)**3+c1*(x-1)**2

def vgrad(top,bot):
    g=Image.new('RGB',(8,256)); px=g.load()
    for y in range(256):
        a=y/255
        c=tuple(int(lerp(top[i],bot[i],a)) for i in range(3))
        for x in range(8): px[x,y]=c
    return g.resize((W,H),Image.BILINEAR)
WARM=vgrad((255,248,241),(255,223,205))
DARK=vgrad((28,21,52),(11,13,31))

def glow(size,color,strength=210):
    g=Image.new('RGBA',(size,size),(0,0,0,0)); px=g.load(); c=size/2
    for y in range(size):
        for x in range(size):
            d=math.hypot(x-c,y-c)/c
            a=max(0.0,1-d); a=a*a
            px[x,y]=(color[0],color[1],color[2],int(strength*a))
    return g
GLOW=glow(360,CORAL)

def pin(scale,color=CORAL,dot=True):
    w=max(6,int(96*scale)); s=int(w*1.32)
    img=Image.new('RGBA',(w+4,s+4),(0,0,0,0)); d=ImageDraw.Draw(img)
    d.ellipse([2,2,w+2,w+2],fill=color)
    d.polygon([(w*0.16+2,w*0.66),(w*0.84+2,w*0.66),(w*0.5+2,s+2)],fill=color)
    if dot: d.ellipse([w*0.33+2,w*0.33+2,w*0.67+2,w*0.67+2],fill=(255,255,255,255))
    return img

def paste_c(base,sp,cx,cy,a=1.0):
    if a<1.0:
        sp=sp.copy(); al=sp.split()[3].point(lambda p:int(p*a)); sp.putalpha(al)
    base.alpha_composite(sp,(int(cx-sp.width/2),int(cy-sp.height/2)))

def text(base,lines,font,fill,a,cy,gap=1.16,isar=False,shadow=False):
    if a<=0.003: return
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    rows=[]
    for ln in lines:
        s=shape_ar(ln) if isar else ln
        bb=d.textbbox((0,0),s,font=font); rows.append((s,bb[2]-bb[0],bb[3]-bb[1],bb[1]))
    lh=max(r[2] for r in rows)*gap; total=lh*len(rows); y=cy-total/2
    A=int(255*clamp(a))
    for s,w,h,top in rows:
        x=(W-w)/2
        if shadow: d.text((x,y-top+3),s,font=font,fill=(0,0,0,int(A*0.28)))
        d.text((x,y-top),s,font=font,fill=(fill[0],fill[1],fill[2],A)); y+=lh
    base.alpha_composite(layer)

def rrect(d,box,r,fill):
    d.rounded_rectangle(box,radius=r,fill=fill)

# ---- copy per language ----
TXT={
 'en':{'s1':["Another weekend","already…"],'s2':["Same three places?"],
       's3':"Planned in one tap.",'chips':[("9:00","Park",SAGE),("12:00","Indoor play",SKY),("5:00","Beach",SUN)],
       's4':"Every outing, a memory you keep.",'s5':["Make them","count."],
       'tag':"All about the family",'soon':"Coming soon  ·  meetspotly.com"},
 'ar':{'s1':["ويكند ثاني..","ووين نوديهم؟"],'s2':["نفس الثلاث أماكن؟"],
       's3':"مرتّب بضغطة وحدة.",'chips':[("9:00","حديقة",SAGE),("12:00","لعب داخلي",SKY),("5:00","بحر",SUN)],
       's4':"كل طلعة.. ذكرى تبقى.",'s5':["خلّها","تستاهل."],
       'tag':"كل ما يخص العائلة",'soon':"قريبًا  ·  meetspotly.com"},
}
PINS=[(540,770,0.0),(372,648,0.42),(706,690,0.86),(300,912,1.3),
      (784,930,1.74),(468,1052,2.18),(628,1150,2.6)]

def frame(t,lang):
    isar=(lang=='ar'); F=cai if isar else jak; T=TXT[lang]
    da=clamp(seg(t,7.9,8.6)-seg(t,15.0,15.7))
    base=Image.blend(WARM,DARK,da).convert('RGBA')
    d=ImageDraw.Draw(base)

    # S1 0–3
    a=seg(t,0.25,0.9)-seg(t,2.6,3.0)
    if a>0: text(base,T['s1'],F(108,800),INK,a,820-lerp(26,0,seg(t,0.25,0.9)),isar=isar)
    # S2 3–5.2  (three dull pins + line)
    a=seg(t,3.15,3.55)-seg(t,4.95,5.2)
    if a>0:
        for i,(dx) in enumerate((-150,0,150)):
            bob=math.sin(t*3+i)*6
            paste_c(base,pin(0.9,GREY),W/2+dx,640+bob,a*0.9)
        text(base,T['s2'],F(96,800),INK,a,900,isar=isar)
    # S3 5.2–8.2 (tap ripple + headline + chips)
    a=seg(t,5.45,5.85)-seg(t,7.95,8.2)
    if a>0:
        rp=seg(t,5.5,6.1)
        if 0<rp<1:
            rr=int(40+rp*230); ar_=int(160*(1-rp))
            d.ellipse([W/2-rr,560-rr,W/2+rr,560+rr],outline=(CORAL[0],CORAL[1],CORAL[2],int(ar_*a)),width=8)
        text(base,[T['s3']],F(98,800),INK,a,560,isar=isar)
        for i,(tm,lb,col) in enumerate(T['chips']):
            prog=seg(t,5.9+i*0.28,6.3+i*0.28); ca=prog*a
            if ca<=0: continue
            cw,ch=560,104; cx=(W-cw)/2; cy=760+i*128-lerp(34,0,prog); mid=cy+ch/2; pad=38
            A=int(255*ca); LB=(92,82,74)
            lay=Image.new('RGBA',(W,H),(0,0,0,0)); dd=ImageDraw.Draw(lay)
            rrect(dd,[cx,cy,cx+cw,cy+ch],ch/2,(255,255,255,int(236*ca)))
            tf=jak(46,800); lf=cai(44,700) if isar else jak(44,600)
            if not isar:
                dd.ellipse([cx+pad,mid-16,cx+pad+32,mid+16],fill=(col[0],col[1],col[2],A))
                dd.text((cx+pad+52,mid),tm,font=tf,fill=(INK[0],INK[1],INK[2],A),anchor='lm')
                dd.text((cx+pad+52+tf.getlength(tm)+22,mid),lb,font=lf,fill=(LB[0],LB[1],LB[2],A),anchor='lm')
            else:
                dd.ellipse([cx+cw-pad-32,mid-16,cx+cw-pad,mid+16],fill=(col[0],col[1],col[2],A))
                rx=cx+cw-pad-52
                dd.text((rx,mid),tm,font=tf,fill=(INK[0],INK[1],INK[2],A),anchor='rm')
                dd.text((rx-tf.getlength(tm)-22,mid),shape_ar(lb),font=lf,fill=(LB[0],LB[1],LB[2],A),anchor='rm')
            base.alpha_composite(lay)
    # S4/S5 map pins (dark) 8.2–15.8
    if 8.2<t<15.85:
        grp=clamp(seg(t,8.3,8.7)-seg(t,15.3,15.75))
        for (px_,py_,tb) in PINS:
            loc=t-8.55-tb
            if loc<=0: continue
            sc=pop(loc/0.5) if loc<0.5 else 1.0
            paste_c(base,GLOW,px_,py_-20,grp*0.55*min(1,loc/0.4))
            paste_c(base,pin(0.95*sc),px_,py_,grp)
        a=seg(t,9.0,9.5)-seg(t,13.4,13.8)
        if a>0: text(base,[T['s4']],F(60,700),CREAM,a,1420,isar=isar,shadow=True)
        a=seg(t,13.95,14.35)-seg(t,15.35,15.7)
        if a>0: text(base,T['s5'],F(140,800),CREAM,a,860,isar=isar,shadow=True)
    # S6 logo 15.8–end
    a=seg(t,15.95,16.45)
    if a>0:
        paste_c(base,GLOW,W/2,690,a*0.5)
        paste_c(base,pin(1.7),W/2,700-lerp(20,0,a),a)
        text(base,["Spotly"],jak(132,800),INK,a,900,isar=False)
        text(base,[T['tag']],F(58,600),(120,108,98),a,1004,isar=isar)
        if isar:
            text(base,["قريبًا"],cai(50,700),CORAL_D,a,1098,isar=True)
            text(base,["meetspotly.com"],jak(40,700),CORAL_D,a,1158,isar=False)
        else:
            text(base,[T['soon']],jak(44,700),CORAL_D,a,1112,isar=False)
    return base.convert('RGB')

def render(lang):
    out=f"{HERE}/Spotly-Teaser01-{lang.upper()}.mp4"
    n=int(DUR*FPS)
    wr=imageio.get_writer(out,fps=FPS,codec='libx264',quality=8,
                          macro_block_size=8,ffmpeg_params=['-pix_fmt','yuv420p'])
    for i in range(n):
        fr=frame(i/FPS,lang)
        wr.append_data(np.asarray(fr))
        if i% int(FPS) ==0: print(f"  {lang}: {i}/{n}",flush=True)
        if i in (int(1.5*FPS),int(6.4*FPS),int(11.5*FPS),int(16.4*FPS)):
            fr.save(f"{HERE}/_preview_{lang}_{i}.png")
    wr.close(); print("✓ wrote",out)

if __name__=="__main__":
    render(sys.argv[1] if len(sys.argv)>1 else 'en')
