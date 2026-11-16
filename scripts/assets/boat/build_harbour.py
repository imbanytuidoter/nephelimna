import bpy, bmesh, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT_DIR = ARGS[0]
PREVIEW = ARGS[1] if len(ARGS) > 1 else None
MATS = {}

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def mat(name, color, rough=0.6, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 6
    MATS[name] = m

def wood_material():
    m = bpy.data.materials.new("planks")
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
    MATS["planks"] = m

def finish(bm, name, materials, angle=40):
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

def bevel(ob, width, segments=2):
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(40)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)

def lathe(name, profile, materials, segs=40):
    bm = bmesh.new()
    rings = []
    for (r, z, mi) in profile:
        rings.append(([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)], mi))
    for (a, _), (b, mi) in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            f = bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
            f.material_index = mi
    bm.faces.new(list(reversed(rings[0][0])))
    bm.faces.new(rings[-1][0]).material_index = rings[-1][1]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(bm, name, materials, 30)

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
    ob = finish(bm, name, [material])
    if bev:
        bevel(ob, bev)
    if rot:
        ob.rotation_euler = rot
    ob.location = loc
    return ob

def cyl(name, r, h, loc, material, segs=16, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = finish(bm, name, [material])
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

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    mat("white", srgb(0xf0ece2), 0.55)
    mat("red", srgb(0xb3352b), 0.5)
    mat("stone", srgb(0x7d7a74), 0.9)
    mat("iron", srgb(0x1c2024), 0.45, 0.8)
    mat("glass", srgb(0x16282e), 0.05, 0.8)
    mat("lamp", srgb(0xfff0c0), 0.3, 0.0, srgb(0xffd890))
    mat("roof", srgb(0x3c4a4e), 0.7)
    mat("door", srgb(0x2f4f58), 0.6)
    mat("window", srgb(0xffe2a8), 0.3, 0.0, srgb(0xffc870))
    wood_material()

def lighthouse():
    reset()
    H = 21.0
    bands = 5
    prof = [(4.4, -3.0, 0), (4.4, 0.0, 0), (4.0, 0.6, 0), (3.3, 0.9, 1)]
    for i in range(bands * 3 + 1):
        f = i / (bands * 3)
        z = 0.9 + f * (H - 0.9)
        r = 3.3 - 1.25 * f ** 0.85
        prof.append((r, z, 1 + (int(f * bands - 1e-6) % 2 if f > 0 else 0)))
    prof += [(2.05, H, 3), (3.1, H + 0.25, 3), (3.1, H + 0.5, 3), (1.75, H + 0.5, 3)]
    lathe("tower", prof, ["stone", "white", "red", "iron"], 40)
    lathe("lantern_base", [(1.75, H + 0.5, 0), (1.75, H + 1.3, 0)], ["white"], 16)
    lathe("lantern_glass", [(1.7, H + 1.3, 0), (1.7, H + 3.6, 0)], ["glass"], 16)
    lathe("lens", [(0.55, H + 1.7, 0), (0.75, H + 2.4, 0), (0.55, H + 3.1, 0)], ["lamp"], 12)
    lathe("dome", [(1.95, H + 3.6, 0), (1.95, H + 3.8, 0), (1.5, H + 4.5, 0), (0.7, H + 5.0, 0), (0.12, H + 5.2, 0), (0.12, H + 6.0, 0), (0.03, H + 6.1, 0)], ["red"], 24)
    for i in range(16):
        a = 2 * math.pi * i / 16
        cyl(f"mullion{i}", 0.05, 2.3, (1.72 * math.cos(a), 1.72 * math.sin(a), H + 2.45), "iron", 6)
    for i in range(24):
        a = 2 * math.pi * i / 24
        cyl(f"post{i}", 0.035, 1.1, (3.0 * math.cos(a), 3.0 * math.sin(a), H + 1.05), "iron", 6)
    lathe("rail", [(2.96, H + 1.56, 0), (3.04, H + 1.56, 0), (3.04, H + 1.64, 0), (2.96, H + 1.64, 0)], ["iron"], 32)
    lathe("rail2", [(2.98, H + 1.06, 0), (3.02, H + 1.06, 0), (3.02, H + 1.1, 0), (2.98, H + 1.1, 0)], ["iron"], 32)
    box("door", (0.3, 1.2, 2.2), (3.22, 0, 2.0), "door", 0.03)
    box("door_frame", (0.24, 1.5, 2.5), (3.2, 0, 2.1), "stone", 0.03)
    for (z, a) in [(7.5, 0.0), (12.5, 2.2), (17.0, 4.3)]:
        f = (z - 0.9) / (H - 0.9)
        r = 3.3 - 1.25 * f ** 0.85
        box(f"win{z}", (0.3, 0.6, 1.1), (r * math.cos(a), r * math.sin(a), z), "window", 0.03, (0, 0, a))
    return join("lighthouse")

def shed():
    reset()
    L, W, Hh, R = 7.0, 4.6, 2.9, 1.7
    box("base", (L + 0.4, W + 0.4, 0.5), (0, 0, 0.0), "stone", 0.05)
    box("walls", (L, W, Hh), (0, 0, 0.25 + Hh / 2), "planks", 0.0, None, 1.4)
    bm = bmesh.new()
    y, z0, z1, o = W / 2 + 0.35, 0.25 + Hh, 0.25 + Hh + R, L / 2 + 0.4
    pts = [(-o, -y, z0), (-o, y, z0), (-o, 0, z1), (o, -y, z0), (o, y, z0), (o, 0, z1)]
    v = [bm.verts.new(p) for p in pts]
    for f in [(0, 2, 5, 3), (2, 1, 4, 5), (0, 1, 2), (3, 5, 4), (0, 3, 4, 1)]:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    roof = finish(bm, "roof", ["roof"])
    sol = roof.modifiers.new("s", "SOLIDIFY")
    sol.thickness = 0.12
    bpy.context.view_layer.objects.active = roof
    bpy.ops.object.modifier_apply(modifier="s")
    box("gable_f", (0.1, W - 0.2, R - 0.2), (L / 2 - 0.06, 0, z0 + (R - 0.2) / 2 - 0.05), "planks", 0, None, 1.4).scale = (1, 1, 1)
    box("door", (0.1, 1.5, 2.2), (L / 2 + 0.02, -0.9, 0.25 + 1.1), "door", 0.02)
    box("door2", (0.1, 1.5, 2.2), (L / 2 + 0.02, 0.62, 0.25 + 1.1), "door", 0.02)
    for x in (-2.0, 0.3, 2.3):
        for s in (-1, 1):
            box(f"win{x}{s}", (1.0, 0.1, 0.8), (x, s * (W / 2 + 0.02), 0.25 + 1.75), "window", 0.02)
            box(f"winf{x}{s}", (1.16, 0.06, 0.96), (x, s * (W / 2 + 0.01), 0.25 + 1.75), "white", 0.02)
    cyl("chimney", 0.16, 1.5, (-2.2, 0.8, z1 - 0.2), "iron", 10)
    box("sign", (0.06, 2.2, 0.5), (L / 2 + 0.06, -0.15, 0.25 + 2.6), "white", 0.02)
    cyl("lamp_arm", 0.03, 0.7, (L / 2 + 0.35, 1.9, 0.25 + 2.5), "iron", 6).rotation_euler = (0, math.pi / 2, 0)
    cyl("lamp", 0.11, 0.2, (L / 2 + 0.68, 1.9, 0.25 + 2.38), "lamp", 10)
    for i, (x, yy) in enumerate([(4.4, 1.3), (4.5, 0.75), (4.45, 1.0)]):
        cyl(f"barrel{i}", 0.3, 0.85, (x, yy + (0.0 if i < 2 else 0.02), 0.2 + 0.42 + (0.85 if i == 2 else 0)), "red" if i == 1 else "door", 14)
    box("crate1", (0.8, 0.8, 0.6), (4.6, -1.8, 0.5), "planks", 0.02, (0, 0, 0.3), 0.9)
    box("crate2", (0.6, 0.6, 0.5), (4.5, -1.75, 1.05), "planks", 0.02, (0, 0, -0.2), 0.9)
    return join("shed")

def preview(ob, path, dist, target_z):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 760, 760
    sc.render.threads_mode = "FIXED"
    sc.render.threads = 10
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    sky = w.node_tree.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(30)
    sky.sun_rotation = math.radians(150)
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.25
    w.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    pos = Vector((dist, -dist * 0.7, target_z + dist * 0.25))
    cam.location = pos
    cam.rotation_euler = (Vector((0, 0, target_z)) - pos).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)

for name, build, dist, tz in [("lighthouse", lighthouse, 34, 12), ("shed", shed, 11, 2)]:
    ob = build()
    print("TRIS", name, sum(len(p.vertices) - 2 for p in ob.data.polygons))
    if PREVIEW:
        preview(ob, f"{PREVIEW}_{name}.png", dist, tz)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, name + ".glb"), export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="JPEG")
