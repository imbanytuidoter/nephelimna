import bpy, bmesh, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = sys.argv[sys.argv.index("--") + 1]
MATS = {}

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def mat(name, color, rough=0.5, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 5
    MATS[name] = m

def wood_material():
    m = bpy.data.materials.new("planks")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    def tex(file):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(os.path.join(HERE, "tex", file))
        return n
    d = tex("deck_diff.jpg")
    n = tex("deck_nor.jpg")
    n.image.colorspace_settings.name = "Linear"
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.85
    MATS["planks"] = m

def finish(bm, name, materials, angle=50):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(angle)
    for n in materials:
        me.materials.append(MATS[n])
    return ob

def modifier(ob, kind, **props):
    m = ob.modifiers.new("m", kind)
    for k, v in props.items():
        setattr(m, k, v)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)

def box(name, size, loc, material, bev=0.0, rot=None, uv_scale=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, calc_uvs=True)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts[:])
    if uv_scale:
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            n = f.normal
            for l in f.loops:
                c = l.vert.co
                l[uv].uv = ((c.y if abs(n.x) > 0.5 else c.x) / uv_scale, (c.y if abs(n.z) > 0.5 else c.z) / uv_scale)
    ob = finish(bm, name, [material], 40)
    if bev:
        modifier(ob, "BEVEL", width=bev, segments=2, limit_method="ANGLE")
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    return ob

def cyl(name, r, h, loc, material, segs=12, r2=None, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = finish(bm, name, [material], 40)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    return ob

def join(name):
    obs = [o for o in bpy.context.scene.collection.objects if o.type == "MESH"]
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    obs[0].name = name
    return obs[0]

def export(ob, file):
    print("TRIS", file, sum(len(p.vertices) - 2 for p in ob.data.polygons))
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, file), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="JPEG")

def fin(name, outline, thickness, material, plane="XZ", loc=(0, 0, 0), rot=(0, 0, 0)):
    bm = bmesh.new()
    if plane == "XZ":
        vs = [bm.verts.new((x, 0, z)) for x, z in outline]
    else:
        vs = [bm.verts.new((x, y, 0)) for x, y in outline]
    bm.faces.new(vs)
    ob = finish(bm, name, [material], 60)
    modifier(ob, "SOLIDIFY", thickness=thickness, offset=0)
    modifier(ob, "BEVEL", width=thickness * 0.45, segments=2)
    ob.rotation_euler = rot
    ob.location = loc
    return ob

def dolphin():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    mat("back", srgb(0x8693a0), 0.3)
    mat("belly", srgb(0xf2f4f5), 0.34)
    L = 2.4
    N, SEG = 34, 16
    def radius(t):
        if t < 0.1:
            return 0.03 + 0.07 * (t / 0.1) ** 0.6
        if t < 0.2:
            return 0.1 + 0.11 * math.sin((t - 0.1) / 0.1 * math.pi / 2)
        body = 0.21 + 0.035 * math.sin((t - 0.2) / 0.35 * math.pi)
        tail = max(0.0, (t - 0.55) / 0.45)
        return body * (1 - tail ** 1.25) + 0.028 * tail
    def lift(t):
        return 0.02 * math.sin(t * math.pi) - 0.05 * max(0.0, (t - 0.1) / 0.1 if t < 0.2 else 0) * 0
    bm = bmesh.new()
    rings = []
    for i in range(N + 1):
        t = i / N
        x = L * (0.5 - t)
        r = radius(t)
        squash = 1.0 - 0.35 * max(0.0, (t - 0.6) / 0.4)
        tall = 1.0 + 0.25 * max(0.0, (t - 0.6) / 0.4)
        ring = []
        for j in range(SEG):
            a = 2 * math.pi * j / SEG
            ring.append(bm.verts.new((x, r * math.cos(a) * squash, lift(t) + r * math.sin(a) * tall * (1.0 if math.sin(a) > 0 else 0.92))))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(SEG):
            f = bm.faces.new((a[j], b[j], b[(j + 1) % SEG], a[(j + 1) % SEG]))
            mid = (a[j].co.z + a[(j + 1) % SEG].co.z + b[j].co.z + b[(j + 1) % SEG].co.z) / 4
            ref = (a[0].co.z + a[SEG // 2].co.z) / 2
            f.material_index = 0 if mid > ref - 0.05 else 1
    nose = bm.verts.new((L * 0.5 + 0.03, 0, lift(0)))
    tail = bm.verts.new((-L * 0.5 - 0.01, 0, lift(1)))
    for j in range(SEG):
        bm.faces.new((nose, rings[0][j], rings[0][(j + 1) % SEG]))
        bm.faces.new((tail, rings[-1][(j + 1) % SEG], rings[-1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    body = finish(bm, "body", ["back", "belly"], 80)
    modifier(body, "SUBSURF", levels=1)
    fin("dorsal", [(0.22, 0.0), (0.02, 0.3), (-0.12, 0.27), (-0.22, 0.0)], 0.035, "back", "XZ", (-0.05, 0, 0.2))
    for s in (-1, 1):
        fin(f"pec{s}", [(0.16, 0.0), (0.0, 0.34), (-0.1, 0.3), (-0.14, 0.0)], 0.03, "back", "XY", (0.42, s * 0.15, -0.12), (s * 0.5, 0.25, (0 if s > 0 else math.pi) + s * 0.55))
        fin(f"fluke{s}", [(0.12, 0.0), (0.02, 0.36), (-0.14, 0.33), (-0.08, 0.0)], 0.03, "back", "XY", (-L * 0.5 + 0.03, 0, 0.02), (0, 0, (0 if s > 0 else math.pi) + s * 0.35))
    return join("dolphin")

def market():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    wood_material()
    mat("teal", srgb(0x2b6d74), 0.6)
    mat("cream", srgb(0xefe6d2), 0.6)
    mat("red", srgb(0xb3352b), 0.6)
    mat("iron", srgb(0x1c2024), 0.45, 0.8)
    mat("lamp", srgb(0xfff0c0), 0.3, 0.0, srgb(0xffcf80))
    mat("fish", srgb(0x9fb4c2), 0.25, 0.3)
    mat("ice", srgb(0xdfeef2), 0.2)
    mat("rope", srgb(0xcdb98a), 0.9)
    W, D, H = 3.6, 2.4, 2.3
    box("floor", (W + 0.3, D + 0.3, 0.1), (0, 0, 0.05), "planks", 0, None, 1.4)
    box("back", (W, 0.1, H), (0, D / 2 - 0.05, 0.1 + H / 2), "planks", 0, None, 1.4)
    for s in (-1, 1):
        box(f"side{s}", (0.1, D, H), (s * (W / 2 - 0.05), 0, 0.1 + H / 2), "planks", 0, None, 1.4)
        box(f"post{s}", (0.12, 0.12, H + 0.2), (s * (W / 2 - 0.06), -D / 2 - 0.9, 0.1 + (H + 0.2) / 2), "teal", 0.01)
    box("counter", (W - 0.2, 0.7, 0.9), (0, -D / 2 + 0.2, 0.1 + 0.45), "teal", 0.02)
    box("counter_top", (W, 0.85, 0.07), (0, -D / 2 + 0.2, 0.1 + 0.93), "planks", 0.01, None, 1.2)
    box("ice_tray", (1.5, 0.6, 0.12), (-0.8, -D / 2 + 0.2, 0.1 + 1.02), "ice", 0.02)
    for i in range(5):
        f = cyl(f"fish{i}", 0.06, 0.42, (-1.35 + i * 0.27, -D / 2 + 0.2, 0.1 + 1.12), "fish", 8, 0.015, (math.pi / 2, 0, 0.25))
    box("scale", (0.34, 0.3, 0.2), (0.9, -D / 2 + 0.2, 0.1 + 1.07), "cream", 0.02)
    cyl("scale_pan", 0.2, 0.03, (0.9, -D / 2 + 0.2, 0.1 + 1.2), "iron", 16)
    bm = bmesh.new()
    y0, y1, z0, z1, o = D / 2 + 0.2, -D / 2 - 1.15, 0.1 + H + 0.55, 0.1 + H, W / 2 + 0.25
    v = [bm.verts.new(p) for p in [(-o, y0, z0), (o, y0, z0), (o, y1, z1), (-o, y1, z1)]]
    bm.faces.new(v)
    roof = finish(bm, "roof", ["red"])
    modifier(roof, "SOLIDIFY", thickness=0.08, offset=0)
    stripes = 6
    for i in range(stripes):
        if i % 2:
            continue
        x0 = -o + (2 * o) * i / stripes
        bm = bmesh.new()
        e = 0.05
        v = [bm.verts.new(p) for p in [(x0, y0, z0 + e), (x0 + 2 * o / stripes, y0, z0 + e), (x0 + 2 * o / stripes, y1, z1 + e), (x0, y1, z1 + e)]]
        bm.faces.new(v)
        finish(bm, f"stripe{i}", ["cream"])
    box("sign", (2.2, 0.06, 0.5), (0, -D / 2 - 1.1, 0.1 + H - 0.32), "cream", 0.02)
    box("sign_fish", (1.1, 0.08, 0.16), (-0.1, -D / 2 - 1.12, 0.1 + H - 0.32), "teal", 0.06)
    box("sign_tail", (0.3, 0.08, 0.3), (0.58, -D / 2 - 1.12, 0.1 + H - 0.32), "teal", 0.02, (0, math.pi / 4, 0))
    cyl("lamp_cord", 0.01, 0.4, (1.3, -D / 2 - 0.5, 0.1 + H - 0.1), "iron", 6)
    cyl("lamp", 0.1, 0.16, (1.3, -D / 2 - 0.5, 0.1 + H - 0.36), "lamp", 10)
    for i, x in enumerate((-1.2, -0.6)):
        cyl(f"hang_rope{i}", 0.008, 0.5, (x, -D / 2 - 0.6, 0.1 + H - 0.15), "rope", 5)
        cyl(f"hang_fish{i}", 0.08, 0.6, (x, -D / 2 - 0.6, 0.1 + H - 0.65), "fish", 8, 0.02)
    box("crate_a", (0.7, 0.5, 0.4), (W / 2 + 0.6, -0.6, 0.2), "planks", 0.02, (0, 0, 0.2), 0.9)
    box("crate_b", (0.6, 0.5, 0.35), (W / 2 + 0.55, -0.55, 0.58), "planks", 0.02, (0, 0, -0.15), 0.9)
    cyl("barrel", 0.3, 0.85, (-W / 2 - 0.55, -0.3, 0.43), "teal", 14)
    cyl("float_a", 0.14, 0.2, (-W / 2 - 0.02, -D / 2 - 0.3, 1.5), "red", 10, None, (0, math.pi / 2, 0))
    cyl("float_b", 0.14, 0.2, (-W / 2 - 0.02, -D / 2 + 0.2, 1.3), "cream", 10, None, (0, math.pi / 2, 0))
    return join("market")

export(dolphin(), "dolphin.glb")
export(market(), "market.glb")
