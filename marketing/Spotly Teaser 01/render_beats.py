#!/usr/bin/env python3
# Render the graphics beats as standalone clips to slot between the Veo b-roll.
from render import frame, FPS
import imageio.v2 as imageio, numpy as np, os
HERE=os.path.dirname(os.path.abspath(__file__))

def clip(name,t0,t1,lang):
    out=f"{HERE}/beat-{name}-{lang}.mp4"
    wr=imageio.get_writer(out,fps=FPS,codec='libx264',quality=8,
                          macro_block_size=8,ffmpeg_params=['-pix_fmt','yuv420p'])
    t=t0
    while t<t1:
        wr.append_data(np.asarray(frame(t,lang))); t+=1.0/FPS
    wr.close(); print("  ✓",os.path.basename(out))

for lang in ('en','ar'):
    print(lang.upper())
    clip('sameplaces',3.0,5.05,lang)   # "Same 3 places?" + grey pins  (~2.0s)
    clip('app',5.40,8.15,lang)         # "Planned in one tap" + chips  (~2.7s)
    clip('map',8.40,13.70,lang)        # pins fill + "Every outing…"   (~5.3s, hero)
    clip('logo',15.80,17.18,lang)      # logo + coming soon            (~1.4s)
