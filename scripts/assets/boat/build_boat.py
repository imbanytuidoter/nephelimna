import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else os.path.join(HERE, "boat.glb")
PREVIEW = ARGS[1] if len(ARGS) > 1 else None

LENGTH = 7.4
HALF_BEAM = 1.28
COCKPIT_DECK = 0.26
CAP = 0.11

def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def plan(t):
    if t < 0.45:
        return 0.7 + 0.3 * math.sin((t / 0.45) * math.pi * 0.5)
    return max(0.03, 1 - ((t - 0.45) / 0.55) ** 2.1)

def sheer(t):
    bow = max(0.0, (t - 0.35) / 0.65)
    return 0.62 + 0.42 * bow * bow

def keel(t):
    return -0.42 + 0.34 * max(0.0, (t - 0.55) / 0.45) ** 1.7

def chine_z(t):
    return keel(t) + 0.3

def side_point(t, rise):
    cz = chine_z(t)
    return HALF_BEAM * plan(t) * (0.74 + 0.26 * rise), cz + (sheer(t) - cz) * rise

def deck_z(t):
    if t < 0.03:
        return sheer(t)
    fore = smooth(0.685, 0.7, t)
    return COCKPIT_DECK + (sheer(t) - 0.05 - COCKPIT_DECK) * fore

def tx(t):
    return (t - 0.5) * LENGTH

MATS = {}

def mat(name, color, rough=0.5, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 4
    MATS[name] = m
    return m

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def deck_material():
    m = bpy.data.materials.new("deck")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    def tex(file, colorspace):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(HERE, "tex", file))
        try:
            n.image.colorspace_settings.name = colorspace
        except TypeError:
            n.image.colorspace_settings.name = "Linear"
        return n
    d = tex("deck_diff.jpg", "sRGB")
    r = tex("deck_rough.jpg", "Non-Color")
    n = tex("deck_nor.jpg", "Non-Color")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    MATS["deck"] = m

def setup_materials():
    mat("hull_bottom", srgb(0x1d3a40), 0.55)
    mat("hull_stripe", srgb(0xb8342a), 0.4)
    mat("hull_paint", srgb(0xf1ece0), 0.32)
    mat("trim", srgb(0x6b4630), 0.5)
    mat("cabin", srgb(0xf1ece0), 0.35)
    mat("roof", srgb(0xb8342a), 0.4)
    mat("glass", srgb(0x0d1c22), 0.04, 0.85)
    mat("rubber", srgb(0x15181a), 0.8)
    mat("metal", srgb(0xc9cdd1), 0.22, 1.0)
    mat("engine", srgb(0x1a1d21), 0.3)
    mat("accent", srgb(0xf08a2c), 0.45)
    mat("white", srgb(0xf4f2ec), 0.4)
    mat("rope", srgb(0xcdb98a), 0.9)
    mat("fender", srgb(0x1f4f7a), 0.5)
    mat("lamp", srgb(0xffe2a0), 0.3, 0.0, srgb(0xffd27a))
    mat("lamp_red", srgb(0xd0302a), 0.3, 0.0, srgb(0xff2a20))
    mat("lamp_green", srgb(0x2aa860), 0.3, 0.0, srgb(0x20ff70))
    deck_material()

def new_object(name, bm, smooth_angle=38):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(smooth_angle)
    return ob

def assign(ob, names):
    for n in names:
        ob.data.materials.append(MATS[n])

def apply_modifiers(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def bevel(ob, width, segments=2):
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(40)
    m.harden_normals = True
    apply_modifiers(ob)

HULL_MATS = ["hull_bottom", "hull_stripe", "hull_paint", "trim", "cabin", "deck"]

def build_hull():
    stations = sorted(set([0.0, 0.018, 0.03, 0.045] + [i / 46 for i in range(1, 46)] + [0.68, 0.69, 0.7, 0.71, 0.975, 0.99, 1.0]))
    NB, NS = 5, 10
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    rows = []
    for t in stations:
        x = tx(t)
        sec = []
        kz = keel(t)
        cw = HALF_BEAM * plan(t) * 0.74
        for j in range(NB + 1):
            f = j / NB
            sec.append((f * cw, kz + 0.3 * f ** 1.6, 0))
        for k in range(1, NS + 1):
            y, z = side_point(t, k / NS)
            sec.append((y, z, 0 if k <= 3 else 1 if k == 4 else 2))
        sy, sz = side_point(t, 1)
        dz = deck_z(t)
        inner_top = max(sy - CAP, 0.0)
        sec.append((inner_top, sz, 3))
        rise = (dz - chine_z(t)) / max(sheer(t) - chine_z(t), 1e-4)
        wall = min(inner_top, max(side_point(t, min(1, max(0, rise)))[0] - 0.06, 0.0))
        sec.append((wall, dz, 4))
        sec.append((0.0, dz, 5))
        rows.append([bm.verts.new((x, y, z)) for (y, z, _) in sec])
        rows[-1][0].index
    mats = [s[2] for s in sec]
    for a, b in zip(rows[:-1], rows[1:]):
        for j in range(len(a) - 1):
            try:
                f = bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
            except ValueError:
                continue
            f.material_index = mats[j + 1]
    stern = bm.faces.new(list(reversed(rows[0])))
    stern.material_index = 2
    bm.verts.ensure_lookup_table()
    bmesh.ops.mirror(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], axis="Y", merge_dist=0.0005)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0008)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0005, edges=bm.edges[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l.vert.co.y / 1.6, l.vert.co.x / 1.6)
    ob = new_object("hull", bm, 30)
    assign(ob, HULL_MATS)
    return ob

def box(name, size, loc, material, bev=0.0, segs=2, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts[:])
    ob = new_object(name, bm)
    assign(ob, [material])
    if bev:
        bevel(ob, bev, segs)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    return ob

def cyl(name, r, h, loc, material, axis="Z", segs=14, r2=None, bev=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = new_object(name, bm)
    assign(ob, [material])
    if bev:
        bevel(ob, bev, 2)
    if axis == "X":
        ob.rotation_euler = (0, math.pi / 2, 0)
    if axis == "Y":
        ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.location = loc
    return ob

def tube(name, points, radius, material, cyclic=False, res=3):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_cyclic_u = cyclic
    cu.bevel_depth = radius
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob.select_set(False)
    for p in ob.data.polygons:
        p.use_smooth = True
    assign(ob, [material])
    return ob

def torus(name, R, r, loc, material, rot=(0, 0, 0)):
    bm = bmesh.new()
    seg, sub = 28, 10
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(sub):
            b = 2 * math.pi * j / sub
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        verts.append(ring)
    for i in range(seg):
        for j in range(sub):
            bm.faces.new((verts[i][j], verts[(i + 1) % seg][j], verts[(i + 1) % seg][(j + 1) % sub], verts[i][(j + 1) % sub]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = new_object(name, bm, 80)
    assign(ob, [material])
    ob.rotation_euler = rot
    ob.location = loc
    return ob

def pane(name, corners, margins, offset, material):
    a, b, c, d = [Vector(v) for v in corners]
    def at(u, v):
        return a.lerp(b, u).lerp(d.lerp(c, u), v)
    l, r, bt, tp = margins
    pts = [at(l, bt), at(1 - r, bt), at(1 - r, 1 - tp), at(l, 1 - tp)]
    n = (b - a).cross(d - a).normalized()
    bm = bmesh.new()
    vs = [bm.verts.new(p + n * offset) for p in pts]
    bm.faces.new(vs)
    ob = new_object(name, bm)
    assign(ob, [material])
    return ob

def glazing(name, corners, margins, flip=False):
    if flip:
        corners = [corners[1], corners[0], corners[3], corners[2]]
    l, r, b, t = margins
    g = 0.035
    pane(name + "_frame", corners, (l - g, r - g, b - g, t - g), 0.006, "rubber")
    pane(name, corners, margins, 0.012, "glass")

def build_cabin():
    x0, x1 = -0.05, 1.72
    zb, zt = COCKPIT_DECK - 0.02, 2.12
    hb, ht = 0.74, 0.66
    slant = 0.42
    back_in = 0.06
    P = {
        "blb": (x0, hb, zb), "brb": (x0, -hb, zb), "flb": (x1, hb, zb), "frb": (x1, -hb, zb),
        "blt": (x0 + back_in, ht, zt), "brt": (x0 + back_in, -ht, zt), "flt": (x1 - slant, ht, zt), "frt": (x1 - slant, -ht, zt),
    }
    bm = bmesh.new()
    v = {k: bm.verts.new(p) for k, p in P.items()}
    for quad in [("blb", "flb", "flt", "blt"), ("frb", "brb", "brt", "frt"), ("flb", "frb", "frt", "flt"), ("brb", "blb", "blt", "brt"), ("blt", "flt", "frt", "brt"), ("brb", "frb", "flb", "blb")]:
        bm.faces.new([v[k] for k in quad])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = new_object("cabin", bm)
    assign(ob, ["cabin"])
    bevel(ob, 0.05, 3)

    glazing("windshield_port", [P["flb"], (x1, 0, zb), (x1 - slant, 0, zt), P["flt"]], (0.1, 0.05, 0.5, 0.09), flip=True)
    glazing("windshield_star", [(x1, 0, zb), P["frb"], P["frt"], (x1 - slant, 0, zt)], (0.05, 0.1, 0.5, 0.09), flip=True)
    glazing("side_port", [P["blb"], P["flb"], P["flt"], P["blt"]], (0.3, 0.2, 0.52, 0.1), flip=True)
    glazing("side_star", [P["frb"], P["brb"], P["brt"], P["frt"]], (0.2, 0.3, 0.52, 0.1), flip=True)
    glazing("rear", [P["brb"], P["blb"], P["blt"], P["brt"]], (0.56, 0.1, 0.52, 0.1), flip=True)
    pane("door", [P["brb"], P["blb"], P["blt"], P["brt"]], (0.1, 0.5, 0.03, 0.08), 0.008, "trim")
    cyl("door_knob", 0.022, 0.05, (x0 - 0.02, 0.05, zb + 0.95), "metal", "X", 10)

    roof_x0, roof_x1 = x0 - 0.32, x1 - slant + 0.5
    rz = zt + 0.04
    box("roof", (roof_x1 - roof_x0, 1.66, 0.08), ((roof_x0 + roof_x1) / 2, 0, rz), "roof", 0.035, 3)
    for s in (-1, 1):
        tube(f"roof_rail_{s}", [(roof_x0 + 0.25, s * 0.68, rz + 0.04), (roof_x0 + 0.25, s * 0.68, rz + 0.14), (roof_x1 - 0.3, s * 0.68, rz + 0.14), (roof_x1 - 0.3, s * 0.68, rz + 0.04)], 0.014, "metal")
        box(f"nav_{s}", (0.1, 0.05, 0.08), (roof_x1 - 0.42, s * 0.8, rz - 0.01), "lamp_red" if s > 0 else "lamp_green", 0.012)
        tube(f"whip_{s}", [(roof_x0 + 0.45, s * 0.55, rz + 0.04), (roof_x0 + 0.38, s * 0.57, rz + 1.9)], 0.008, "rubber", res=2)
    cyl("radar_base", 0.05, 0.22, (0.55, 0, rz + 0.15), "white", segs=12)
    cyl("radar", 0.27, 0.13, (0.55, 0, rz + 0.3), "white", segs=24, bev=0.04)
    tube("mast", [(0.05, 0, rz + 0.03), (0.02, 0, rz + 1.25)], 0.028, "white")
    tube("mast_yard", [(0.03, -0.38, rz + 0.92), (0.03, 0.38, rz + 0.92)], 0.014, "white")
    cyl("anchor_light", 0.045, 0.09, (0.02, 0, rz + 1.3), "lamp", segs=12, bev=0.012)
    cyl("search_base", 0.03, 0.12, (roof_x1 - 0.3, 0, rz + 0.1), "metal", segs=10)
    cyl("searchlight", 0.085, 0.14, (roof_x1 - 0.28, 0, rz + 0.2), "engine", "X", 16, bev=0.015)
    cyl("search_lens", 0.07, 0.01, (roof_x1 - 0.205, 0, rz + 0.2), "lamp", "X", 16)
    torus("life_ring", 0.25, 0.06, (0.72, hb - 0.012 + 0.05, zb + 0.72), "accent", (math.pi / 2 - 0.045, 0, 0))
    torus("life_ring_s", 0.25, 0.06, (0.72, -(hb - 0.012 + 0.05), zb + 0.72), "accent", (math.pi / 2 + 0.045, 0, 0))

def sheer_xyz(t, s, lift=0.0, inset=0.0):
    y, z = side_point(t, 1)
    return (tx(t), s * max(y - inset, 0.0), z + lift)

def build_rails_and_fittings():
    ts = [0.71 + i * (0.985 - 0.71) / 14 for i in range(15)]
    star = [sheer_xyz(t, -1, 0.5 - 0.1 * smooth(0.9, 0.985, t), 0.07) for t in ts]
    port = [sheer_xyz(t, 1, 0.5 - 0.1 * smooth(0.9, 0.985, t), 0.07) for t in reversed(ts)]
    path = [sheer_xyz(0.71, -1, 0.0, 0.07)] + star + port + [sheer_xyz(0.71, 1, 0.0, 0.07)]
    tube("bow_rail", path, 0.018, "metal")
    mid = [sheer_xyz(t, -1, 0.26 - 0.05 * smooth(0.9, 0.985, t), 0.07) for t in ts] + [sheer_xyz(t, 1, 0.26 - 0.05 * smooth(0.9, 0.985, t), 0.07) for t in reversed(ts)]
    tube("bow_rail_mid", mid, 0.011, "metal")
    for s in (-1, 1):
        for t in (0.78, 0.86, 0.94):
            a = sheer_xyz(t, s, 0.0, 0.07)
            b = sheer_xyz(t, s, 0.5 - 0.1 * smooth(0.9, 0.985, t), 0.07)
            tube(f"stanchion_{s}_{t}", [a, b], 0.014, "metal")
        for t in (0.1, 0.44, 0.9):
            c = sheer_xyz(t, s, 0.035, 0.055)
            box(f"cleat_{s}_{t}", (0.2, 0.035, 0.03), (c[0], c[1], c[2] + 0.03), "metal", 0.012)
            cyl(f"cleat_post_{s}_{t}", 0.018, 0.05, (c[0], c[1], c[2]), "metal", segs=8)
        for t in (0.2, 0.4, 0.6):
            y, z = side_point(t, 0.72)
            top = sheer_xyz(t, s, 0.03, 0.03)
            fx = tx(t)
            f = cyl(f"fender_{s}_{t}", 0.105, 0.46, (fx, s * (y + 0.13), z - 0.06), "fender", segs=16, bev=0.06)
            tube(f"fender_rope_{s}_{t}", [top, (fx, s * (y + 0.13), z + 0.19)], 0.009, "rope", res=2)
        for t in (0.12, 0.24):
            c = sheer_xyz(t, s, 0.0, 0.05)
            cyl(f"rod_holder_{s}_{t}", 0.026, 0.3, (c[0] - 0.03, c[1], c[2] + 0.08), "metal", segs=10).rotation_euler = (s * 0.3, -0.35, 0)
    bow = sheer_xyz(0.955, 0, 0.0)
    cyl("bollard", 0.05, 0.22, (bow[0] - 0.25, 0, sheer(0.92) + 0.05), "metal", segs=12, bev=0.012)
    box("anchor_roller", (0.34, 0.12, 0.06), (bow[0] + 0.02, 0, sheer(0.955) + 0.01), "metal", 0.015)
    box("hatch", (0.62, 0.62, 0.06), (tx(0.8), 0, sheer(0.8) - 0.02), "white", 0.02)
    tube("flag_staff", [(tx(0.02), 0.78, sheer(0.02)), (tx(0.0) - 0.18, 0.8, sheer(0.02) + 1.25)], 0.014, "white")

def build_cockpit():
    d = COCKPIT_DECK
    box("cooler", (0.72, 0.44, 0.4), (-1.35, 0.52, d + 0.2), "white", 0.035, 3)
    box("cooler_lid", (0.74, 0.46, 0.07), (-1.35, 0.52, d + 0.43), "fender", 0.025, 2)
    box("crate", (0.5, 0.38, 0.3), (-0.8, -0.62, d + 0.15), "accent", 0.02)
    box("crate_in", (0.44, 0.32, 0.02), (-0.8, -0.62, d + 0.3), "rubber")
    box("bait_table", (0.5, 1.1, 0.05), (-3.05, 0, d + 0.74), "white", 0.02)
    for s in (-1, 1):
        box(f"bait_leg_{s}", (0.05, 0.05, 0.72), (-3.05, s * 0.45, d + 0.36), "metal", 0.01)
    torus("rope_coil", 0.19, 0.035, (-2.2, -0.6, d + 0.04), "rope")
    torus("rope_coil2", 0.16, 0.035, (-2.2, -0.6, d + 0.1), "rope")
    box("bench", (0.42, 1.3, 0.07), (-0.42, 0, d + 0.46), "trim", 0.02)
    box("bench_base", (0.34, 1.2, 0.44), (-0.4, 0, d + 0.22), "cabin", 0.02)

def build_outboard():
    tz = sheer(0.0)
    x = tx(0.0)
    box("bracket", (0.22, 0.44, 0.34), (x - 0.1, 0, tz - 0.12), "metal", 0.02)
    box("cowl", (0.62, 0.46, 0.48), (x - 0.42, 0, tz + 0.3), "engine", 0.11, 4)
    box("cowl_stripe", (0.5, 0.468, 0.07), (x - 0.42, 0, tz + 0.3), "accent", 0.02)
    box("cowl_base", (0.5, 0.4, 0.12), (x - 0.4, 0, tz + 0.03), "rubber", 0.03)
    box("leg", (0.2, 0.13, 0.95), (x - 0.42, 0, tz - 0.5), "engine", 0.045, 3)
    box("cav_plate", (0.44, 0.3, 0.03), (x - 0.48, 0, tz - 0.86), "engine", 0.012)
    cyl("gearcase", 0.075, 0.46, (x - 0.45, 0, tz - 1.02), "engine", "X", 14, r2=0.03)
    box("skeg", (0.2, 0.025, 0.2), (x - 0.42, 0, tz - 1.15), "engine", 0.01)
    box("tiller", (0.32, 0.05, 0.05), (x - 0.02, 0, tz + 0.28), "engine", 0.015)

def join_all():
    for ob in bpy.context.scene.collection.objects:
        ob.select_set(ob.type == "MESH")
    hull = bpy.data.objects["hull"]
    bpy.context.view_layer.objects.active = hull
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    hull.name = "boat"
    return hull

def render_preview(path):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 40
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = 1100, 620
    sc.render.threads_mode = "FIXED"
    sc.render.threads = 10
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    sky = w.node_tree.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(32)
    sky.sun_rotation = math.radians(140)
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.25
    w.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    sc.world = w
    try:
        sc.view_settings.view_transform = "Filmic"
    except TypeError:
        pass
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    sea = bpy.context.active_object
    m = bpy.data.materials.new("sea")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.01, 0.08, 0.1, 1)
    b.inputs["Roughness"].default_value = 0.12
    sea.data.materials.append(m)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 42
    target = Vector((0.2, 0, 0.9))
    for name, pos in [("a", (-9.5, -6.0, 3.6)), ("b", (8.5, 5.5, 2.6)), ("c", (-1.5, -9.5, 6.5))]:
        cam.location = pos
        cam.rotation_euler = (target - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{path}_{name}.png"
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(sea)

bpy.ops.wm.read_factory_settings(use_empty=True)
setup_materials()
build_hull()
build_cabin()
build_rails_and_fittings()
build_cockpit()
build_outboard()
boat = join_all()
print("TRIS", sum(len(p.vertices) - 2 for p in boat.data.polygons))
if PREVIEW:
    render_preview(PREVIEW)
bpy.ops.object.select_all(action="DESELECT")
boat.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="JPEG")
print("WROTE", OUT)
