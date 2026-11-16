import bpy, bmesh, math, sys

OUT = sys.argv[sys.argv.index("--") + 1]

def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)

def raw(h):
    return tuple(((h >> s) & 255) / 255 for s in (16, 8, 0))

def lerp(a, b, t):
    return a + (b - a) * t

def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def finish(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob

def modifier(ob, kind, **props):
    m = ob.modifiers.new("m", kind)
    for k, v in props.items():
        setattr(m, k, v)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)

L = 2.5

def girth(t):
    if t < 0.085:
        return lerp(0.042, 0.062, (t / 0.085) ** 0.5)
    if t < 0.16:
        return lerp(0.062, 0.165, smooth(0.085, 0.16, t))
    if t < 0.42:
        return lerp(0.165, 0.245, math.sin((t - 0.16) / 0.26 * math.pi / 2))
    return lerp(0.245, 0.04, ((t - 0.42) / 0.58) ** 1.15)

def crown(t):
    melon = 0.06 * math.exp(-((t - 0.155) / 0.045) ** 2)
    crease = 0.022 * math.exp(-((t - 0.095) / 0.012) ** 2)
    return melon - crease - 0.02 * smooth(0.0, 0.09, 0.09 - t)

def body():
    N, SEG = 56, 20
    bm = bmesh.new()
    rings = []
    for i in range(N + 1):
        t = i / N
        r = girth(t)
        narrow = 1.0 - 0.45 * smooth(0.6, 1.0, t)
        tall = 1.0 + 0.5 * smooth(0.62, 0.96, t)
        ring = []
        for j in range(SEG):
            a = 2 * math.pi * j / SEG
            up = math.sin(a)
            ring.append(bm.verts.new((L * (0.5 - t), r * math.cos(a) * narrow, crown(t) * max(0.0, up) + r * up * tall * (1.0 if up > 0 else 0.9))))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(SEG):
            bm.faces.new((a[j], b[j], b[(j + 1) % SEG], a[(j + 1) % SEG]))
    nose = bm.verts.new((L * 0.5 + 0.012, 0, -0.012))
    tail = bm.verts.new((-L * 0.5 - 0.01, 0, 0))
    for j in range(SEG):
        bm.faces.new((nose, rings[0][j], rings[0][(j + 1) % SEG]))
        bm.faces.new((tail, rings[-1][(j + 1) % SEG], rings[-1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = finish(bm, "body")
    modifier(ob, "SUBSURF", levels=1)
    return ob

def blade(name, outline, thickness, plane, loc, rot):
    bm = bmesh.new()
    if plane == "XZ":
        vs = [bm.verts.new((x, 0, z)) for x, z in outline]
    else:
        vs = [bm.verts.new((x, y, 0)) for x, y in outline]
    face = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[face])
    ob = finish(bm, name)
    modifier(ob, "SOLIDIFY", thickness=thickness, offset=0)
    modifier(ob, "SUBSURF", levels=2)
    ob.rotation_euler = rot
    ob.location = loc
    return ob

def curve(points, steps=6):
    out = []
    n = len(points)
    for i in range(n):
        p0, p1, p2, p3 = points[(i - 1) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]
        for s in range(steps):
            t = s / steps
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t ** 3) for k in range(2)))
    return out

def ball(name, r, loc):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=r)
    ob = finish(bm, name)
    ob.location = loc
    return ob

bpy.ops.wm.read_factory_settings(use_empty=True)
skin = bpy.data.materials.new("skin")
skin.use_nodes = True
bsdf = skin.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
bsdf.inputs["Roughness"].default_value = 0.28

EYE_X, EYE_Z = 0.84, 0.0
parts = [body()]
dorsal = curve([(0.3, 0.0), (0.12, 0.14), (-0.06, 0.3), (-0.2, 0.33), (-0.17, 0.2), (-0.16, 0.08), (-0.24, 0.0), (0.0, -0.05)], 5)
parts.append(blade("dorsal", dorsal, 0.03, "XZ", (-0.02, 0, 0.215), (0, 0, 0)))
flipper = curve([(0.13, 0.0), (0.08, 0.2), (-0.06, 0.4), (-0.15, 0.42), (-0.13, 0.26), (-0.11, 0.1), (-0.13, 0.0), (0.0, -0.04)], 5)
fluke = curve([(0.1, 0.0), (0.06, 0.2), (-0.08, 0.4), (-0.2, 0.43), (-0.17, 0.3), (-0.12, 0.14), (-0.06, 0.02), (0.0, -0.03)], 5)
for s in (-1, 1):
    half = 0 if s > 0 else math.pi
    parts.append(blade(f"flipper{s}", flipper, 0.028, "XY", (0.52, s * 0.16, -0.13), (s * 0.55, 0.3, half + s * 0.5)))
    parts.append(blade(f"fluke{s}", [(x * 1.25, y * 1.25) for x, y in fluke], 0.026, "XY", (-L * 0.5 + 0.08, s * 0.005, 0.0), (0, 0, half + s * 0.2)))
    eye_t = 0.5 - EYE_X / L
    eye_y = girth(eye_t) * math.sqrt(max(0.0, 1 - (EYE_Z / (girth(eye_t) * 1.0)) ** 2)) - 0.006
    parts.append(ball(f"eyering{s}", 0.03, (EYE_X, s * (eye_y - 0.004), EYE_Z)))
    parts.append(ball(f"eye{s}", 0.02, (EYE_X + 0.004, s * (eye_y + 0.012), EYE_Z)))
back, flank, belly, dark, fin, ring = raw(0x6c7780), raw(0xa8b2b9), raw(0xeef1f1), raw(0x101315), raw(0x5d666e), raw(0x434b52)

def paint(ob, colour_at):
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    col = ob.data.vertex_colors.new(name="Col")
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            col.data[li].color = (*colour_at(ob.data.vertices[ob.data.loops[li].vertex_index].co), 1)

def skin_colour(v):
    t = min(1.0, max(0.0, 0.5 - v.x / L))
    r = max(girth(t), 0.03)
    h = v.z / r
    c = [lerp(belly[k], flank[k], smooth(-0.7, -0.1, h)) for k in range(3)]
    cape = 0.35 - 0.3 * math.exp(-((t - 0.45) / 0.18) ** 2)
    c = [lerp(c[k], back[k], smooth(cape - 0.2, cape + 0.25, h)) for k in range(3)]
    if t < 0.09:
        c = [lerp(c[k], back[k], 0.35) for k in range(3)]
    return c

for o in parts:
    name = o.name
    if name == "body":
        paint(o, skin_colour)
    elif name.startswith("eyering"):
        paint(o, lambda v: ring)
    elif name.startswith("eye"):
        paint(o, lambda v: dark)
    else:
        paint(o, lambda v: fin)
bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
ob = parts[0]
ob.name = "dolphin"
ob.data.materials.append(skin)
print("TRIS", sum(len(p.vertices) - 2 for p in ob.data.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_colors=True)
