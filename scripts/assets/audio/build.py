import json, os, re, subprocess, sys

MANIFEST, OUT = sys.argv[1], sys.argv[2]
PLAN = {
    "sea": ("amb_sea_hull", 4, 26, 2, "96k"),
    "wind": ("amb_wind_light", 2, 20, 2, "64k"),
    "gulls": ("seagull", 0, 12, 1, "64k"),
    "engine": ("engine_run", 10, 8, 1, "64k"),
    "wash": ("water_bow_wash", 10, 10, 1, "64k"),
    "cast": ("cast_swish", 0, 1.6, 1, "64k"),
    "plop": ("float_plop", 0, 1.5, 1, "64k"),
    "splash_small": ("splash_small", 0, 2, 1, "64k"),
    "splash_medium": ("splash_medium", 0, 2.5, 1, "64k"),
    "splash_big": ("splash_big", 0, 3, 1, "64k"),
    "reel": ("reel_fast", 2, 4, 1, "64k"),
    "drag": ("reel_drag", 0, 3, 1, "64k"),
    "snap": ("line_snap", 0, 1.2, 1, "64k"),
    "bite": ("bite_alert", 0, 1, 1, "64k"),
    "catch": ("catch_jingle", 0, 4, 1, "64k"),
    "rare": ("rare_jingle", 0, 4, 1, "64k"),
    "chest": ("chest_open", 0, 3, 1, "64k"),
    "coins": ("coins", 0, 2, 1, "64k"),
    "click": ("ui_click", 0, 0.6, 1, "64k"),
    "deny": ("ui_error", 0, 0.8, 1, "64k"),
    "step": ("footstep_wood", 0, 0.6, 1, "64k"),
    "anchor": ("anchor_chain", 2, 4, 1, "64k"),
    "creak": ("boat_creak", 20, 6, 1, "64k"),
    "bump": ("hull_bump", 0, 0.78, 1, "64k"),
}
PEAK = -3.0

sounds = json.load(open(MANIFEST))["sounds"]
os.makedirs(OUT, exist_ok=True)
credits = {}
for name, (key, start, length, channels, rate) in PLAN.items():
    entry = sounds[key][0]
    src = entry["file"]
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-ss", str(start), "-t", str(length), "-i", src, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    peak = re.search(r"max_volume: (-?[\d.]+) dB", probe)
    gain = PEAK - float(peak.group(1)) if peak else 0
    fade = min(0.25, length / 4)
    dst = os.path.join(OUT, name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-t", str(length), "-i", src, "-ac", str(channels), "-ar", "44100",
                    "-af", f"volume={gain:.1f}dB,afade=t=in:d=0.02,areverse,afade=t=in:d={fade},areverse", "-b:a", rate, dst], check=True)
    credits[name] = {"source": entry.get("source_page"), "author": entry.get("author"), "licence": entry.get("licence", "CC0"), "original": entry.get("name")}
    print(name, os.path.getsize(dst), f"gain {gain:+.1f} dB")
json.dump(credits, open(os.path.join(OUT, "credits.json"), "w"), indent=1)
