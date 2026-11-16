"""HR-SETPIECE-B: Quiet Shore shelter (timber frame, plank deck, sagging corrugated roof) and the
GD110 mirror heads (plastic shell, rim, glass).

  blender -b --python tools/assets/blender/hr-setpiece-b-build.py -- [--preview]

Original geometry (CC0 by the project). It reuses the modelling helpers, swatches and the graded
Poly Haven CC0 maps of hr-fix-setpiece.py / hr-fix-setpiece-prepare.mjs (tmp/hr-fix-setpiece/tex),
so the packaged KTX2 files are byte-identical to the ones already shipped. No logos or lettering.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
source = (HERE / 'hr-fix-setpiece.py').read_text(encoding='utf8')
head, tail = source.split('# ---------------------------------------------------------------- A17 signposts', 1)
exec(compile(head, 'hr-fix-setpiece.py (helpers)', 'exec'))
exec(compile('def preview' + tail.split('def preview', 1)[1].split('inventory = []', 1)[0], 'hr-fix-setpiece.py (preview)', 'exec'))

OUT_B = ROOT / 'tmp/hr-setpiece-b'
(OUT_B / 'glb').mkdir(parents=True, exist_ok=True)
MAT['tin'] = material('setpiece-roof-tin', 'metal-paint-color', 'metal-paint-normal', 'metal-paint-orm', tint=(.5, .53, .54))
MAT['glass'] = material('setpiece-mirror-glass', base=(.92, .93, .94), rough=.025, metal=1)
TILE['tin'] = 1.3

def build_porch():
    p = Piece('porch')  # origin: shelter centre at deck level; +X is the high eave, the step is at -X
    rng = random.Random(1505)
    slope = .06
    # Deck: eleven boards across the joists, each a little different, nailed at both bearers.
    for i in range(11):
        z = -1.65 + .3 * (i + .5)
        length = 2.9 - rng.random() * .03
        board = tex(box(length, .04, .29, .007, 3), 'timber', 'x', seed=i)
        p.add(board, T((rng.random() - .5) * .014, -.02 - rng.random() * .004, z) @ RY((rng.random() - .5) * .006))
        for x in (-1.24, 0, 1.24):
            for dz in (-.08, .08): bolt(p, (x + (rng.random() - .5) * .01, -.001, z + dz), 'y', .006, 'steel')
    for z in (-1.6, 0, 1.6): p.add(tex(box(2.86, .14, .07, .006, 2), 'timber', 'x'), T(0, -.11, z))
    for x in (-1.41, -.47, .47, 1.41): p.add(tex(box(.07, .14, 3.27, .006, 2), 'timber', 'z'), T(x, -.115, 0))
    for x in (-1.3, 0, 1.3):
        for z in (-1.5, 1.5): p.add(tex(box(.17, 1.3, .17, .012, 2), 'timber', 'y'), T(x, -.83, z))
    # Frame: chamfered posts let into the deck, plates, ties and pegged knee braces.
    for sx in (-1, 1):
        x, top = sx * 1.24, 2.48 + sx * 1.24 * slope
        for sz in (-1, 1):
            z = sz * 1.42
            p.add(tex(box(.2, top + 1.3, .2, .018, 3), 'timber', 'y'), T(x, (top - 1.3) / 2, z))
            p.add(tex(box(.26, .05, .26, .008, 2), 'timber', 'x'), T(x, .025, z))
            brace = tex(box(.075, .78, .075, .008, 2), 'timber', 'y')
            p.add(brace, T(x - sx * .29, top - .46, z) @ RZ(sx * math.pi / 4))
            for along in (-.3, .3):
                peg = swatch(cyl(.011, .011, .1, 8), 'soot')
                p.add(peg, T(x - sx * .29, top - .46, z) @ RZ(sx * math.pi / 4) @ T(0, along, 0) @ RX(math.pi / 2))
            brace2 = tex(box(.075, .7, .075, .008, 2), 'timber', 'y')
            p.add(brace2, T(x, top - .42, z - sz * .26) @ RX(-sz * math.pi / 4))
            for dy in (-.2, -.34): bolt(p, (x, top + dy, z + sz * .102), 'z' if sz > 0 else '-z', .011, 'steel')
        p.add(tex(box(.17, .2, 3.3, .012, 3), 'timber', 'z'), T(x, top - .16, 0))
    for sz in (-1, 1):
        p.add(tex(box(2.75, .18, .13, .01, 3), 'timber', 'x'), T(0, 2.31, sz * 1.42) @ RZ(slope))
    for i in range(6):
        z = -1.68 + i * .672
        p.add(tex(box(3.62, .11, .06, .006, 2), 'timber', 'x'), T(0, 2.475, z) @ RZ(slope))
    purlins = (-1.6, -.55, .55, 1.6)
    for x in purlins: p.add(tex(box(.06, .045, 3.72, .005, 2), 'timber', 'z'), T(x, 2.552 + x * slope, 0))
    # Corrugated sheets: 76 mm pitch, sagging between purlins, laps and lifted corners.
    pitch, depth = .076, .0085
    def height(x, z, lift):
        nearest = min(abs(x - q) for q in purlins)
        sag = -.014 * min(1, nearest / .5) ** 1.5
        droop = -.03 * max(0, abs(x) - 1.62) / .25
        wave = noise.noise(Vector((x * .9, z * .7, 3.1))) * .012
        return 2.596 + x * slope + depth * math.cos(z / pitch * TAU) + sag + droop + wave + lift
    sheets = [(-1.9, -.61, 0.0, -.03), (-.685, .685, .004, .02), (.61, 1.9, .0, -.015)]
    for index, (z0, z1, lift, shift) in enumerate(sheets):
        for face in (1, -1):
            bm = bmesh.new()
            nx, nz = 22, int(round((z1 - z0) / pitch * 6))
            grid = []
            for i in range(nx + 1):
                x = -1.86 + shift + 3.72 * i / nx
                row = []
                for j in range(nz + 1):
                    z = z0 + (z1 - z0) * j / nz
                    corner = max(0, (abs(x) - 1.5) / .36) * max(0, (abs(z) - 1.55) / .35) if index != 1 else 0
                    row.append(bm.verts.new(B(x, height(x, z, lift + corner * .05) - (0 if face > 0 else .0016), z)))
                grid.append(row)
            for i in range(nx):
                for j in range(nz):
                    quad = [grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]]
                    bm.faces.new(quad if face > 0 else list(reversed(quad)))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            if face < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
            sheet = shade(obj(bm, 'tin'), 80)
            layer = uv_layer(sheet.data)
            for loop, data in zip(sheet.data.loops, layer.data):
                co = sheet.data.vertices[loop.vertex_index].co
                data.uv = (co.y / TILE['tin'] + index * .37, co.x / TILE['tin'])
            sheet.data.materials.append(MAT['tin'])
            p.add(sheet)
        for x in purlins:
            for k in range(int((z1 - z0) / (pitch * 3))):
                z = (math.floor(z0 / pitch) + 1 + k * 3) * pitch
                if z0 + .02 < z < z1 - .02: bolt(p, (x, height(x, z, lift) - .001, z), 'y', .007, 'steel')
    return p.finish()

def build_stepdeck():
    p = Piece('stepdeck')  # origin: centre of the step's top face (the old 0.68 x 2.0 m landing)
    for i, x in enumerate((-.225, 0, .225)):
        p.add(tex(box(.218, .05, 2.0 - i * .012, .008, 3), 'timber', 'z', seed=40 + i), T(x, -.025 - i * .002, 0))
        for z in (-.8, .8): bolt(p, (x, -.001, z), 'y', .006, 'steel')
    for z in (-.8, 0, .8): p.add(tex(box(.66, 1.1, .1, .008, 2), 'timber', 'y'), T(0, -.6, z))
    return p.finish()

def build_mirror():
    p = Piece('mirror')  # origin: centre of the old 52 mm disc; +Z is the bike's forward direction
    along = RX(math.pi / 2)  # lathe axis Y -> +Z
    shell = [(0, .036), (.018, .0352), (.036, .03), (.05, .02), (.058, .008), (.0615, -.004), (.0615, -.011), (.059, -.0135)]
    p.add(swatch(lathe(shell, 40), 'rubber'), along)
    # Soft rim that grips the glass, then the glass itself, set back 1.5 mm and facing the rider.
    p.add(swatch(lathe([(.059, -.0135), (.0575, -.0155), (.0548, -.0155), (.0535, -.0128)], 40), 'rubber'), along)
    glass = lathe([(.0537, -.0122), (.03, -.0128), (0, -.013)], 40)
    uv_layer(glass.data); glass.data.materials.append(MAT['glass'])
    p.add(glass, along)
    # Ball joint and boot where the chrome stalk meets the shell.
    p.add(swatch(ball(.0125, level=2), 'chrome'), T(0, -.058, .012))
    p.add(swatch(lathe([(.0075, -.085), (.0095, -.074), (.013, -.066), (.0135, -.058)], 16), 'rubber'), T(0, 0, .012))
    p.add(swatch(lathe([(.016, -.062), (.022, -.05), (.02, -.04)], 16), 'rubber'), T(0, 0, .012))
    return p.finish()

PREVIEW_B = '--preview' in ARGS
inventory = []
if PREVIEW_B:
    (WORK / 'preview').mkdir(exist_ok=True); setup_preview()
for group, builders in {'porch': [build_porch, build_stepdeck], 'mirror': [build_mirror]}.items():
    pieces = [build() for build in builders]
    if PREVIEW_B:
        for piece in pieces: preview(piece, group)
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        for ob in piece.objects: ob.hide_render = False; ob.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0].objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT_B / 'glb' / f'hr-prop-setpiece-{group}.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_tangents=True, export_apply=True, export_image_format='AUTO')
    inventory.append({'id': f'hr-prop-setpiece-{group}', 'file': f'hr-prop-setpiece-{group}.glb',
                      'pieces': [{'name': piece.name, 'triangles': piece.triangles, 'draws': len(piece.objects) - 1} for piece in pieces]})
    for piece in pieces:
        for ob in piece.objects: bpy.data.objects.remove(ob, do_unlink=True)
    print('HR-SETPIECE-B', group, [(piece.name, piece.triangles) for piece in pieces])
(OUT_B / 'inventory.json').write_text(json.dumps(inventory, indent=2))
print('HR-SETPIECE-B authored', [entry['id'] for entry in inventory])
