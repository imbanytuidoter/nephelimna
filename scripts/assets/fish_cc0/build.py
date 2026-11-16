import bpy, math, os, subprocess
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "apps", "sea", "public", "models", "school-fish.glb"))
FACES = 360
LENGTH = 0.5
TEXTURE = 512
NOSE_TURN = 90

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, "BarramundiFish.glb"))
ob = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
for o in list(bpy.context.scene.objects):
    if o is not ob:
        bpy.data.objects.remove(o)
world = ob.matrix_world.copy()
ob.parent = None
ob.matrix_world = world
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
span = lambda k: max(v.co[k] for v in ob.data.vertices) - min(v.co[k] for v in ob.data.vertices)
print("SPAN", span(0), span(1), span(2))
if span(1) > span(0):
    ob.data.transform(Matrix.Rotation(math.radians(NOSE_TURN), 4, "Z"))
xs = [v.co.x for v in ob.data.vertices]
zs = [v.co.z for v in ob.data.vertices]
scale = LENGTH / (max(xs) - min(xs))
for v in ob.data.vertices:
    v.co.x = (v.co.x - (max(xs) + min(xs)) / 2) * scale
    v.co.y *= scale
    v.co.z = (v.co.z - (max(zs) + min(zs)) / 2) * scale
m = ob.modifiers.new("d", "DECIMATE")
m.ratio = FACES / len(ob.data.polygons)
bpy.ops.object.modifier_apply(modifier=m.name)
mat = ob.data.materials[0]
nt = mat.node_tree
bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
for name in ("Normal", "Metallic", "Roughness"):
    for link in list(bsdf.inputs[name].links):
        nt.links.remove(link)
bsdf.inputs["Metallic"].default_value = 0.35
bsdf.inputs["Roughness"].default_value = 0.35
for link in bsdf.inputs["Base Color"].links:
    node = link.from_node
    big = os.path.join(HERE, "tmp-base.png")
    small = os.path.join(HERE, "tmp-base-small.jpg")
    node.image.filepath_raw = big
    node.image.file_format = "PNG"
    node.image.save()
    subprocess.run(["convert", big, "-resize", f"{TEXTURE}x{TEXTURE}", small], check=True)
    node.image = bpy.data.images.load(small)
    node.image.pack()
    os.remove(big)
keep = {link.from_node for link in bsdf.inputs["Base Color"].links}
for node in list(nt.nodes):
    if node.type == "TEX_IMAGE" and node not in keep:
        nt.nodes.remove(node)
mat.name = "fish"
print("TRIS", sum(len(p.vertices) - 2 for p in ob.data.polygons), "SPANS", span(0), span(1), span(2), "LOC", tuple(ob.location), tuple(ob.rotation_euler), tuple(ob.scale), ob.data.users, len(ob.data.shape_keys.key_blocks) if ob.data.shape_keys else 0)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True, export_image_format="JPEG", export_tangents=False)
os.remove(os.path.join(HERE, "tmp-base-small.jpg"))
