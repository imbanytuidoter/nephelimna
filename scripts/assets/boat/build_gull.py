import bpy, bmesh, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[sys.argv.index("--") + 1]
MATS = {}

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def mat(name, color, rough=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    MATS[name] = m
    return m

def feather_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(HERE, "tex", "gull.png"))
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.65
    m.blend_method = "CLIP"
    m.alpha_threshold = 0.5
    m.use_backface_culling = False
    MATS[name] = m

def finish(bm, name, materials, angle=180):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    for n in materials:
        me.materials.append(MATS[n])
    return ob

def modifier(ob, kind, **props):
    m = ob.modifiers.new("m", kind)
    for k, v in props.items():
        setattr(m, k, v)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)

def body():
    L, N, SEG = 0.6, 30, 14
    def radius(t):
        if t < 0.1:
            return 0.02 + 0.03 * math.sin(t / 0.1 * math.pi / 2)
        if t < 0.24:
            return 0.05 - 0.008 * math.sin((t - 0.1) / 0.14 * math.pi)
        if t < 0.74:
            return 0.045 + 0.05 * math.sin((t - 0.24) / 0.5 * math.pi) ** 0.75
        return 0.045 * (1 - ((t - 0.74) / 0.26) ** 1.3) + 0.012
    def lift(t):
        return 0.04 * max(0.0, 1 - t / 0.28) ** 1.3
    bm = bmesh.new()
    rings = []
    for i in range(N + 1):
        t = i / N
        r = radius(t)
        flat = 1.0 - 0.5 * max(0.0, (t - 0.74) / 0.26)
        ring = [bm.verts.new((L * (0.5 - t), r * math.cos(2 * math.pi * j / SEG), lift(t) + r * math.sin(2 * math.pi * j / SEG) * flat)) for j in range(SEG)]
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(SEG):
            bm.faces.new((a[j], b[j], b[(j + 1) % SEG], a[(j + 1) % SEG]))
    nose = bm.verts.new((L * 0.5 + 0.006, 0, lift(0)))
    tail = bm.verts.new((-L * 0.5 - 0.006, 0, 0))
    for j in range(SEG):
        bm.faces.new((nose, rings[0][j], rings[0][(j + 1) % SEG]))
        bm.faces.new((tail, rings[-1][(j + 1) % SEG], rings[-1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = finish(bm, "body", ["plumage"])
    modifier(ob, "SUBSURF", levels=2)
    col = ob.data.vertex_colors.new(name="Col")
    white, grey = srgb(0xf7f7f3), srgb(0xa6afb8)
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            v = ob.data.vertices[ob.data.loops[li].vertex_index].co
            t = 0.5 - v.x / L
            back = max(0.0, min(1.0, (v.z - 0.012) / 0.03)) * max(0.0, min(1.0, (t - 0.27) / 0.08)) * max(0.0, min(1.0, (0.86 - t) / 0.1))
            col.data[li].color = (*[white[k] + (grey[k] - white[k]) * back for k in range(3)], 1)
    return ob

def beak():
    bm = bmesh.new()
    pts = [(0.0, 0.016), (0.03, 0.015), (0.055, 0.012), (0.07, 0.006), (0.076, -0.004)]
    SEG = 8
    rings = []
    for (x, r) in pts:
        rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * j / SEG), r * 1.1 * math.sin(2 * math.pi * j / SEG) - 0.012 * (x / 0.076) ** 2)) for j in range(SEG)])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(SEG):
            bm.faces.new((a[j], b[j], b[(j + 1) % SEG], a[(j + 1) % SEG]))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = finish(bm, "beak", ["beak"])
    ob.location = (0.292, 0, 0.036)
    return ob

def ball(name, r, loc, material):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=r)
    ob = finish(bm, name, [material])
    ob.location = loc
    return ob

def wing(side):
    SPAN0, SPAN, NS, NC = 0.03, 0.74, 18, 5
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    grid = []
    for i in range(NS + 1):
        s = i / NS
        row = []
        for j in range(NC + 1):
            c = j / NC
            x = 0.115 - 0.245 * c - 0.05 * s * s
            z = 0.034 + 0.016 * math.sin(math.pi * min(1.0, c * 1.3)) * (1 - 0.6 * s) + 0.01 * math.sin(s * math.pi)
            row.append((bm.verts.new((x, side * (SPAN0 + SPAN * s), z)), s, c))
        grid.append(row)
    for i in range(NS):
        for j in range(NC):
            quad = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            f = bm.faces.new([q[0] for q in quad])
            for loop, q in zip(f.loops, quad):
                loop[uv].uv = (q[1], 1 - 0.6 * q[2])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(bm, f"wing{'L' if side > 0 else 'R'}", ["wing"])

def tail():
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    N = 6
    base, tip = -0.2, -0.4
    U0, U1, V0, V1 = 0.52, 0.96, 1 - 0.62, 1 - 0.98
    rows = []
    for i in range(N + 1):
        a = i / N
        rows.append(((bm.verts.new((base, (a - 0.5) * 0.05, 0.004)), U0 + (U1 - U0) * (0.5 + (a - 0.5) * 0.12), V0),
                     (bm.verts.new((tip, (a - 0.5) * 0.2, 0.0)), U0 + (U1 - U0) * a, V1)))
    for a, b in zip(rows[:-1], rows[1:]):
        f = bm.faces.new((a[0][0], b[0][0], b[1][0], a[1][0]))
        for loop, q in zip(f.loops, (a[0], b[0], b[1], a[1])):
            loop[uv].uv = (q[1], q[2])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(bm, "tail", ["tail"])

bpy.ops.wm.read_factory_settings(use_empty=True)
mat("plumage", (1, 1, 1), 0.6)
mat("beak", srgb(0xe8a628), 0.4)
mat("eye", srgb(0x101214), 0.2)
feather_material("wing")
feather_material("tail")
parts = [body(), beak(), ball("eye_l", 0.0065, (0.255, 0.031, 0.052), "eye"), ball("eye_r", 0.0065, (0.255, -0.031, 0.052), "eye"), wing(1), wing(-1), tail()]
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
parts[0].name = "gull"
print("TRIS", sum(len(p.vertices) - 2 for p in parts[0].data.polygons), [m.name for m in parts[0].data.materials])
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_colors=True)
