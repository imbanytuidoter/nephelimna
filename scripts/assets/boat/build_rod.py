import bpy, bmesh, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[sys.argv.index("--") + 1]
MATS = {}

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def mat(name, color, rough, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    MATS[name] = m

def cork_material():
    m = bpy.data.materials.new("cork")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(HERE, "tex", "cork.jpg"))
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    MATS["cork"] = m

def finish(bm, name, material, angle=40, uv=None):
    me = bpy.data.meshes.new(name)
    if uv:
        layer = bm.loops.layers.uv.new("UVMap")
        for f in bm.faces:
            for l in f.loops:
                c = l.vert.co
                l[layer].uv = (math.atan2(c.y, c.x) / (2 * math.pi) * uv[0] + 0.5, c.z * uv[1])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(angle)
    me.materials.append(MATS[material])
    return ob

def lathe(name, profile, material, segs=24, uv=None):
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)] for r, z in profile]
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(bm, name, material, 35, uv)

def box(name, size, loc, material, bev=0.0, segs=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts[:])
    ob = finish(bm, name, material)
    if bev:
        m = ob.modifiers.new("b", "BEVEL")
        m.width, m.segments = bev, segs
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier="b")
    ob.location = loc
    return ob

def cyl(name, r, h, loc, material, axis="Z", segs=20, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    ob = finish(bm, name, material, 35)
    if axis == "X":
        ob.rotation_euler = (0, math.pi / 2, 0)
    if axis == "Y":
        ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.location = loc
    return ob

def torus(name, R, r, loc, material, axis="Z", arc=2 * math.pi, segs=28, sub=8):
    bm = bmesh.new()
    n = segs if arc >= 2 * math.pi - 1e-6 else segs + 1
    rings = []
    for i in range(n):
        a = arc * i / segs
        rings.append([bm.verts.new(((R + r * math.cos(2 * math.pi * j / sub)) * math.cos(a), (R + r * math.cos(2 * math.pi * j / sub)) * math.sin(a), r * math.sin(2 * math.pi * j / sub))) for j in range(sub)])
    closed = arc >= 2 * math.pi - 1e-6
    for i in range(segs if closed else segs):
        a, b = rings[i], rings[(i + 1) % n] if closed else rings[min(i + 1, n - 1)]
        if a is b:
            continue
        for j in range(sub):
            bm.faces.new((a[j], b[j], b[(j + 1) % sub], a[(j + 1) % sub]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = finish(bm, name, material, 60)
    if axis == "X":
        ob.rotation_euler = (0, math.pi / 2, 0)
    if axis == "Y":
        ob.rotation_euler = (math.pi / 2, 0, 0)
    ob.location = loc
    return ob

def join(name, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]

def set_origin(ob, point):
    bpy.context.scene.cursor.location = point
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

bpy.ops.wm.read_factory_settings(use_empty=True)
cork_material()
mat("graphite", srgb(0x17191c), 0.35, 0.4)
mat("rubber", srgb(0x0d0e10), 0.85)
mat("anodized", srgb(0x10222f), 0.28, 0.85)
mat("chrome", srgb(0xd6dadd), 0.12, 1.0)
mat("gold", srgb(0xd0a040), 0.25, 0.9)
mat("line", srgb(0xc9e27a), 0.55)
mat("knob", srgb(0x16181b), 0.6)

Y = -0.074
fixed = [
    lathe("butt", [(0.0, -0.275), (0.012, -0.275), (0.0155, -0.268), (0.0155, -0.252), (0.0135, -0.248)], "rubber"),
    lathe("rear_grip", [(0.0135, -0.248), (0.0145, -0.2), (0.0152, -0.13), (0.0145, -0.06), (0.0132, -0.02)], "cork", 28, (3, 6)),
    lathe("seat", [(0.0132, -0.02), (0.0128, -0.012), (0.0128, 0.132), (0.0132, 0.14)], "graphite"),
    lathe("hood_rear", [(0.0128, -0.014), (0.0152, -0.012), (0.0152, 0.012), (0.0128, 0.016)], "gold"),
    lathe("nut", [(0.0128, 0.1), (0.0162, 0.102), (0.0162, 0.128), (0.0128, 0.13)], "anodized", 12),
    lathe("hood_front", [(0.0128, 0.086), (0.0148, 0.088), (0.0148, 0.1), (0.0128, 0.1)], "gold"),
    lathe("fore_grip", [(0.0132, 0.14), (0.0138, 0.17), (0.012, 0.215), (0.0085, 0.238)], "cork", 28, (3, 6)),
    lathe("check", [(0.0085, 0.238), (0.0098, 0.24), (0.0098, 0.247), (0.0062, 0.25)], "gold"),
    box("foot", (0.011, 0.006, 0.092), (0, -0.0145, 0.045), "anodized", 0.002),
    box("stem", (0.008, 0.05, 0.016), (0, -0.04, 0.05), "anodized", 0.003),
    box("body", (0.03, 0.044, 0.05), (0, Y, 0.05), "anodized", 0.011, 4),
    cyl("gear_cover", 0.021, 0.006, (0.0165, Y, 0.05), "gold", "X", 24),
    cyl("gear_cover2", 0.019, 0.004, (-0.0165, Y, 0.05), "anodized", "X", 24),
    cyl("drag_knob", 0.012, 0.012, (0, Y, 0.138), "anodized", "Z", 12),
    lathe("spool", [(0.0, 0.086), (0.0235, 0.086), (0.0245, 0.089), (0.0175, 0.092), (0.0175, 0.122), (0.0245, 0.125), (0.0235, 0.128), (0.0, 0.128)], "chrome", 32),
    lathe("line_on_spool", [(0.0175, 0.093), (0.0215, 0.094), (0.0215, 0.12), (0.0175, 0.121)], "line", 32),
]
for o in fixed[-2:]:
    o.location = (0, Y, 0)
static = join("handle", fixed)

rotor_parts = [
    lathe("rotor_cup", [(0.0, 0.074), (0.0265, 0.074), (0.0275, 0.078), (0.0275, 0.086), (0.0, 0.086)], "anodized", 32),
    box("rotor_arm_a", (0.007, 0.006, 0.05), (0.029, 0, 0.101), "anodized", 0.002),
    box("rotor_arm_b", (0.007, 0.006, 0.05), (-0.029, 0, 0.101), "anodized", 0.002),
    cyl("line_roller", 0.0045, 0.008, (0.029, 0, 0.127), "gold", "Y", 12),
    torus("bail", 0.031, 0.0011, (0, 0, 0.127), "chrome", "X", math.pi, 24, 6),
]
rotor = join("rotor", rotor_parts)
rotor.location = (0, Y, 0)
bpy.ops.object.transform_apply(location=True)
set_origin(rotor, (0, Y, 0.08))

crank_parts = [
    cyl("axle", 0.0035, 0.02, (0.03, Y, 0.05), "chrome", "X", 12),
    box("crank_arm", (0.005, 0.008, 0.05), (0.04, Y, 0.028), "chrome", 0.002),
    cyl("knob_stem", 0.003, 0.016, (0.048, Y, 0.006), "chrome", "X", 10),
    lathe("knob", [(0.0, -0.011), (0.006, -0.011), (0.0085, -0.006), (0.0085, 0.006), (0.006, 0.011), (0.0, 0.011)], "knob", 16),
]
crank_parts[-1].rotation_euler = (0, math.pi / 2, 0)
crank_parts[-1].location = (0.066, Y, 0.006)
crank = join("crank", crank_parts)
set_origin(crank, (0.03, Y, 0.05))

rotor.parent = static
crank.parent = static
print("TRIS", sum(len(p.vertices) - 2 for o in (static, rotor, crank) for p in o.data.polygons))
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="JPEG")
