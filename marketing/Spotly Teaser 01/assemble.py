#!/usr/bin/env python3
# Assemble the teaser: Kling b-roll + graphics beats + title text → one MP4.
#   python3 assemble.py en   |   python3 assemble.py ar
import sys, os
import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw
from render import jak, cai, shape_ar

HERE=os.path.dirname(os.path.abspath(__file__)); K=HERE+"/_kling"
W,H,FPS=1080,1920,24; OVER=1.12

def fit_broll(arr):            # upscale + center-crop (kills KlingAI watermark)
    im=Image.fromarray(arr).convert('RGB')
    nh=int(H*OVER); nw=int(im.width*nh/im.height)
    im=im.resize((nw,nh),Image.LANCZOS)
    x=(nw-W)//2; y=(nh-H)//2
    return im.crop((x,y,x+W,y+H))

def fit_gfx(arr):
    im=Image.fromarray(arr).convert('RGB')
    return im if im.size==(W,H) else im.resize((W,H),Image.LANCZOS)

def title(im,lines,font,y,a,isar=False):
    if a<=0.01: return im
    im=im.convert('RGBA'); layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    A=int(255*a); rows=[]
    for ln in lines:
        s=shape_ar(ln) if isar else ln
        bb=d.textbbox((0,0),s,font=font); rows.append((s,bb[2]-bb[0],bb[3]-bb[1],bb[1]))
    lh=max(r[2] for r in rows)*1.14; yy=y-lh*len(rows)/2
    for s,w,h,top in rows:
        x=(W-w)/2
        for ox,oy in ((0,6),(0,3),(4,4)):
            d.text((x+ox,yy-top+oy),s,font=font,fill=(0,0,0,int(A*0.45)))
        d.text((x,yy-top),s,font=font,fill=(255,255,255,A)); yy+=lh
    im.alpha_composite(layer); return im.convert('RGB')

def build(lang):
    isar=(lang=='ar'); L='ar' if isar else 'en'; F=cai if isar else jak
    T_sofa=(["ويكند ثاني..","ووين نوديهم؟"] if isar else ["Another weekend","already…"])
    T_make=(["خلّها تستاهل."] if isar else ["Make them count."])
    tf=F(96,800)
    g=lambda name:f"{HERE}/beat-{name}-{L}.mp4"
    # (kind, path, src_start_s, dur_s(>90=full), title, title_y, hold_frames)
    segs=[
      ('broll',K+'/raw2.mp4',1.2,2.4,T_sofa,470,0),   # sofa / dread
      ('gfx',g('sameplaces'),0,99,None,0,0),
      ('gfx',g('app'),0,99,None,0,0),
      ('broll',K+'/raw1.mp4',1.0,1.9,None,0,0),        # park
      ('broll',K+'/raw3.mp4',1.0,1.9,None,0,0),        # indoor
      ('broll',K+'/raw4.mp4',1.1,2.4,T_make,520,0),    # ice-cream + title
      ('gfx',g('map'),0,3.0,None,0,0),
      ('gfx',g('logo'),0,99,None,0,14),
    ]
    out=f"{HERE}/Spotly-Teaser01-{L.upper()}-CUT.mp4"
    wr=imageio.get_writer(out,fps=FPS,codec='libx264',quality=8,
                          macro_block_size=8,ffmpeg_params=['-pix_fmt','yuv420p'])
    for kind,path,st,dur,tl,ty,hold in segs:
        rd=imageio.get_reader(path); src=[f for f in rd]; rd.close()
        if dur>90: idxs=list(range(len(src)))
        else:
            n=int(dur*FPS); start=int(st*FPS)
            idxs=[min(len(src)-1,start+i) for i in range(n)]
        n=len(idxs)
        for i,si in enumerate(idxs):
            im=fit_gfx(src[si]) if kind=='gfx' else fit_broll(src[si])
            if tl:
                st_=i/FPS; a=min(1.0, st_/0.4, (n/FPS-st_)/0.4)
                im=title(im,tl,tf,ty,max(0,a),isar)
            wr.append_data(np.asarray(im))
        if hold:
            last=fit_gfx(src[-1]) if kind=='gfx' else fit_broll(src[-1])
            for _ in range(hold): wr.append_data(np.asarray(last))
        print(f"  + {os.path.basename(path)}  ({n+hold}f)")
    wr.close(); print("✓",out)

build(sys.argv[1] if len(sys.argv)>1 else 'en')
