"""Original, unbranded 110cc motorcycle. Geometry and generated maps: CC0.

blender -b --factory-startup -t 2 -P tools/assets/blender/hr-gd110.py
Then: node tools/assets/blender/hr-gd110-package.mjs
No downloads. Road dust uses checksum-verified, cached Poly Haven sand_01.
Authoring coordinates are the existing runtime's Y-up/+Z, before scale .81.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tmp/hr-gd110'
OUT.mkdir(parents=True, exist_ok=True)
SCALE = .81
TAU = math.tau
SLOTS = ['paint', 'frame', 'rubber', 'leather', 'chrome', 'cast', 'blue', 'gold',
         'glass', 'tail', 'amber', 'linen', 'mirror', 'dust', 'engine', 'steel']


def image(name, pixels, color=False):
    h, w = pixels.shape[:2]
    im = bpy.data.images.new(name, width=w, height=h, alpha=True)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    im.pixels.foreach_set(pixels.astype(np.float32).ravel())
    im.filepath_raw = str(OUT / (name + '.png'))
    im.file_format = 'PNG'
    im.save()
    return im


def make_atlas():
    """1K shared PBR atlas: pores, milling, cloth and continuous road film.

    Analytic height derivatives bake tangent normals, not runtime noise shaders.
    Each detail occupies 256px with padded borders. No alpha cutouts or specks.
    """
    records = json.loads((ROOT / 'tools/assets/textures/cc0-sources.json').read_text())['sources']
    record = next(s for s in records if s['id'] == 'sand_01')
    source = record['maps']['diff']
    cached = ROOT / 'tmp/gfx-p2' / source['file']
    if hashlib.sha256(cached.read_bytes()).hexdigest() != source['sha256']:
        raise ValueError('CC0 source checksum mismatch')
    photo = bpy.data.images.load(str(cached), check_existing=True)
    photo.scale(256, 256)
    sand = np.array(photo.pixels[:], dtype=np.float32).reshape(256, 256, 4)[:, :, :3]
    rng = np.random.default_rng(110)
    y, x = np.mgrid[0:256, 0:256] / 255
    fine = rng.random((256, 256)) - .5
    broad = (np.sin(x * TAU * 7 + np.sin(y * TAU * 5)) + np.cos(y * TAU * 11)) / 2
    colors = [( .82,.80,.74),(.055,.059,.056),(.042,.045,.043),(.048,.039,.032),
              (.69,.71,.70),(.46,.47,.45),(.24,.29,.40),(.49,.36,.16),
              (.67,.72,.70),(.47,.018,.012),(.62,.25,.018),(.62,.57,.46),
              (.79,.83,.84),(.31,.25,.16),(.12,.13,.12),(.26,.28,.26)]
    rough = [.19,.47,.88,.63,.075,.68,.13,.16,.18,.24,.23,.94,.045,.22,.70,.48]
    metal = [0,.75,0,0,1,1,1,1,.6,0,0,0,1,0,.85,1]
    base = np.ones((1024, 1024, 4), np.float32)
    normal = base.copy()
    orm = base.copy()
    for i, slot in enumerate(SLOTS):
        height = fine * .05
        variation = fine * .018 + broad * .01
        if slot == 'leather':
            pores = np.sin((x + .002 * broad) * TAU * 125) * np.sin(y * TAU * 119)
            height = pores * .11 + fine * .13 + broad * .03
            variation = pores * .009 + fine * .012
        elif slot in ('chrome', 'steel', 'cast', 'blue', 'gold', 'mirror'):
            height = fine * (.06 if slot == 'cast' else .008) + np.sin(y * TAU * 180) * .014
            variation += np.sin(y * TAU * 180) * .008
        elif slot == 'linen':
            height = (np.sin(x * TAU * 115) + np.sin(y * TAU * 115)) * .10
            variation += height * .12
        elif slot == 'rubber':
            height = fine * .08 + np.sin(x * TAU * 100) * .018
        elif slot == 'glass':
            height = np.cos(x * TAU * 30) * .08
        elif slot == 'paint':
            # Orange peel and fine clear-coat scuffs, restrained at bike scale.
            height = fine * .012 + broad * .007
        rgb = np.clip(np.array(colors[i])[None, None, :] + variation[:, :, None], .002, .98)
        film = np.zeros_like(x)
        if slot == 'dust':
            # UV y follows the wheel arc, x spans the fender. Dirt builds up
            # at the trailing lower edge and fades smoothly into clean paint.
            arc = np.clip((y-.035)/.93, 0, 1)
            width = np.clip((x-.035)/.93, 0, 1)
            edge = np.abs(width-.5)*2
            trailing = np.clip((arc-.46)/.54, 0, 1)**2
            streak = (.5+.5*np.cos(width*TAU*7+arc*3))**12
            film = np.clip(trailing*(.42+.32*edge)+streak*trailing*.13, 0, .84)
            earth = np.array([.24,.19,.125]) + (sand.mean(axis=2)-.45)[:,:,None]*.035
            rgb = np.array(colors[0])[None,None,:]*(1-film[:,:,None])+earth*film[:,:,None]
            height = broad*.002 + film*.004
        dy, dx = np.gradient(height)
        n = np.stack((-dx * 4, -dy * 4, np.ones_like(dx)), axis=-1)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        row, col = divmod(i, 4)
        region = np.s_[row * 256:(row + 1) * 256, col * 256:(col + 1) * 256]
        base[region][:, :, :3] = rgb
        normal[region][:, :, :3] = n * .5 + .5
        orm[region][:, :, :3] = np.stack((np.clip(.96 + broad * .04, .82, 1),
            np.clip(rough[i] + fine * (.008 if slot in ('paint','chrome','mirror','dust') else .035) + film*.64, .04, 1), np.full_like(x, metal[i])), axis=-1)
    mat = bpy.data.materials.new('GD110 CC0 baked paint leather cast alloy chrome road dust')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = 1
    shader.inputs['Roughness'].default_value = 1
    for name, pixels in [('basecolor', base), ('normal', normal), ('orm', orm)]:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image(name, pixels, name == 'basecolor')
        if name == 'basecolor':
            links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        elif name == 'normal':
            bump = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'], bump.inputs['Color'])
            links.new(bump.outputs['Normal'], shader.inputs['Normal'])
        else:
            split = nodes.new('ShaderNodeSeparateColor')
            links.new(tex.outputs['Color'], split.inputs['Color'])
            links.new(split.outputs['Green'], shader.inputs['Roughness'])
            links.new(split.outputs['Blue'], shader.inputs['Metallic'])
    coat = mat.copy()
    coat.name = 'Gloss enamel clearcoat'
    shader = coat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Coat Weight'].default_value = 1
    shader.inputs['Coat Roughness'].default_value = .075
    amber = mat.copy()
    amber.name = 'Translucent amber moulded lens'
    shader = amber.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Transmission Weight'].default_value = .35
    shader.inputs['IOR'].default_value = 1.49
    return [mat, coat, amber]


def point(p):
    return (p[0] * SCALE, -p[2] * SCALE, p[1] * SCALE)


class Batch:
    def __init__(self, name, origin=(0, 0, 0)):
        self.name, self.origin = name, np.array(origin)
        self.vertices, self.faces, self.uvs, self.parts, self.materials = [], [], [], [], []

    def surface(self, name, rows, slot, flip=False):
        rows = np.array(rows)
        a, b = rows.shape[:2]
        start = len(self.vertices)
        self.vertices.extend(rows.reshape(-1, 3).tolist())
        tile = SLOTS.index(slot)
        # Faces carry loop UVs to keep atlas boundaries and primitive seams exact.
        for i in range(a - 1):
            for j in range(b - 1):
                ids = [i*b+j, i*b+j+1, (i+1)*b+j+1, (i+1)*b+j]
                uv = [(j/(b-1), i/(a-1)), ((j+1)/(b-1), i/(a-1)),
                      ((j+1)/(b-1), (i+1)/(a-1)), (j/(b-1), (i+1)/(a-1))]
                if flip:
                    ids.reverse()
                    uv.reverse()
                self.faces.append(tuple(start+k for k in ids))
                self.materials.append(1 if slot == 'paint' else 2 if slot == 'amber' else 0)
                self.uvs.extend([((tile % 4 + .035 + .93*u)/4,
                                  (tile // 4 + .035 + .93*v)/4) for u, v in uv])
        self.parts.append(name)

    def finish(self, material, parent):
        data = bpy.data.meshes.new(self.name)
        data.from_pydata([point(np.array(p) - self.origin) for p in self.vertices], [], self.faces)
        data.update()
        uv = data.uv_layers.new(name='PBR Atlas')
        uv.data.foreach_set('uv', np.array(self.uvs).ravel())
        for polygon, material_index in zip(data.polygons, self.materials):
            polygon.use_smooth = True
            polygon.material_index = material_index
        obj = bpy.data.objects.new(self.name, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        for mat in material:
            obj.data.materials.append(mat)
        obj['details'] = sorted(set(self.parts))
        return obj


def tube(batch, name, points, radius, slot='chrome', sides=12, caps=True):
    points = np.array(points, float)
    if name in ('exhaust_header', 'scrambler_handlebar', 'mirror_stalk', 'control_cable',
                'ignition_cable', 'helmet_strap', 'tote_handle', 'lever') and len(points) > 2:
        # Centripetal-looking, local cubic bends preserve swept tube silhouettes.
        padded = np.concatenate(([points[0]], points, [points[-1]]))
        smooth = []
        for i in range(len(points)-1):
            a,b,c,d=padded[i:i+4]
            for t in np.linspace(0,1,7,endpoint=False):
                smooth.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
        points=np.array(smooth+[points[-1]])
    rows = []
    for i, p in enumerate(points):
        d = points[min(i+1, len(points)-1)] - points[max(0, i-1)]
        d /= np.linalg.norm(d)
        u = np.cross(d, [1, 0, 0] if abs(d[0]) < .9 else [0, 1, 0])
        u /= np.linalg.norm(u)
        v = np.cross(d, u)
        r = radius[i] if isinstance(radius, list) else radius
        rows.append([p + r * (u*math.cos(t) + v*math.sin(t)) for t in np.linspace(0, TAU, sides+1)])
    batch.surface(name, rows, slot)
    if caps:
        batch.surface(name, [[points[0]]*(sides+1), rows[0]], slot, True)
        batch.surface(name, [rows[-1], [points[-1]]*(sides+1)], slot)


def ellipsoid(batch, name, center, radii, slot, n=32, rings=16, hemisphere=False):
    rows = []
    for a in np.linspace(0, math.pi/2 if hemisphere else math.pi, rings+1):
        rows.append([(center[0]+radii[0]*math.sin(a)*math.cos(t),
                      center[1]+radii[1]*math.cos(a),
                      center[2]+radii[2]*math.sin(a)*math.sin(t)) for t in np.linspace(0, TAU, n+1)])
    batch.surface(name, rows, slot)


def block(batch, name, center, size, slot, bevel=.008, steps=4):
    # Six rounded cube patches give real bevel silhouettes and hard flat centres.
    half = np.array(size)/2
    inner = np.maximum(half-bevel, .0001)
    for axis in range(3):
        other = [k for k in range(3) if k != axis]
        for sign in [-1, 1]:
            rows = []
            for u in np.linspace(-1, 1, steps+1):
                row = []
                for v in np.linspace(-1, 1, steps+1):
                    p = np.zeros(3)
                    p[axis], p[other[0]], p[other[1]] = sign*half[axis], u*half[other[0]], v*half[other[1]]
                    c = np.clip(p, -inner, inner)
                    d = p-c
                    p = c + d/max(np.linalg.norm(d), .000001)*min(bevel, min(half))
                    row.append(np.array(center)+p)
                rows.append(row)
            batch.surface(name, rows, slot, sign == (-1 if axis == 1 else 1))


def ring(batch, name, center, major, minor, slot, n=64, sides=10, axis=0):
    rows = []
    a, b = [k for k in range(3) if k != axis]
    for t in np.linspace(0, TAU, n+1):
        row = []
        for f in np.linspace(0, TAU, sides+1):
            p = np.array(center, float)
            p[a] += (major+minor*math.cos(f))*math.cos(t)
            p[b] += (major+minor*math.cos(f))*math.sin(t)
            p[axis] += minor*math.sin(f)
            row.append(p)
        rows.append(row)
    batch.surface(name, rows, slot, axis != 1)


def bolt(batch, center, radius=.008, axis=0):
    end = np.array(center, float)
    end[axis] += .006
    tube(batch, 'hex_fastener', [center, end], radius, 'steel', 6)


def build(lod, material):
    near = lod == 0
    n = 64 if near else 32
    sides = 12 if near else 8
    root = bpy.data.objects.new('gd110_hr', None)
    bpy.context.collection.objects.link(root)
    steer = bpy.data.objects.new('steering', None)
    bpy.context.collection.objects.link(steer)
    steer.parent = root
    steer.location = point((0, .91, .43))
    body, front = Batch('chassis'), Batch('steering_detail', (0, .91, .43))
    batches = [(body, root), (front, steer)]
    for label, z in [('rear_wheel', -.64), ('front_wheel', .64)]:
        pivot = bpy.data.objects.new(label, None)
        bpy.context.collection.objects.link(pivot)
        pivot.parent = steer if label == 'front_wheel' else root
        offset = (0, .30-.91, z-.43) if label == 'front_wheel' else (0, .30, z)
        pivot.location = point(offset)
        wheel = Batch(label+'_detail', (0, .30, z))
        batches.append((wheel, pivot))
        # Rounded road tyre profile; the central tread is .30m from the axle.
        rows = []
        profile = [(-.042,.235),(-.047,.252),(-.040,.275),(-.025,.293),(0,.298),
                   (.025,.293),(.040,.275),(.047,.252),(.042,.235)]
        for x, r in profile:
            rows.append([(x,.30+r*math.cos(a),z+r*math.sin(a)) for a in np.linspace(0,TAU,n+1)])
        wheel.surface('rubber_sidewall', rows, 'rubber')
        for x in [-.034, .034]:
            ring(wheel, 'rolled_chrome_rim', (x,.30,z), .238,.007,'chrome',n,8)
        tube(wheel,'drum_brake',[(-.063,.30,z),(.063,.30,z)],.069,'cast',n)
        for sign in [-1,1]:
            ring(wheel,'drum_lip',(sign*.065,.30,z),.058,.004,'cast',32,6)
            for j in range(18 if near else 12):
                a=j*TAU/(18 if near else 12)
                for direction in [-1,1]:
                    b=a+direction*.14
                    tube(wheel,'cross_laced_spoke',[(sign*.047,.30+.063*math.cos(a),z+.063*math.sin(a)),
                        (sign*.028,.30+.235*math.cos(b),z+.235*math.sin(b))],.0017,'chrome',6 if near else 4)
            for j in range(6):
                a=j*TAU/6
                bolt(wheel,(sign*.069,.30+.043*math.cos(a),z+.043*math.sin(a)),.006)
        # Recessed channels between raised chevrons, with alternating shoulder blocks.
        for j in range(64 if near else 32):
            a=j*TAU/(64 if near else 32)
            for sign in [-1,1]:
                rows=[]
                for da in [-.019,.019]:
                    rows.append([(x,.30+r*math.cos(a+da+sign*x*.7),z+r*math.sin(a+da+sign*x*.7))
                        for x,r in [(sign*.002,.300),(sign*.019,.298),(sign*.036,.286)]])
                wheel.surface('raised_chevron_tread',rows,'rubber',sign<0)
                # Close the raised blocks against the tyre carcass so grooves
                # retain real shadows and a solid silhouette at grazing angles.
                for k in [0,1]:
                    edge=rows[k]
                    inside=[(p[0],.30+(p[1]-.30)*.986,z+(p[2]-z)*.986) for p in edge]
                    wheel.surface('tread_groove_wall',[edge,inside],'rubber',k==1)
        if near:
            for sign in [-1,1]:
                # Geometric sidewall size marks and mould bars; no manufacturer text.
                for j in range(24):
                    a=j*TAU/24
                    tube(wheel,'sidewall_mould_mark',[(sign*.047,.30+r*math.cos(a),z+r*math.sin(a))
                        for r in [.252,.262]],.0012,'rubber',4)
                for j in range(8):
                    a=.2+j*.045
                    tube(wheel,'embossed_generic_size_glyph',[(sign*.048,.30+.265*math.cos(a+d),z+.265*math.sin(a+d))
                        for d in [-.012,0,.012]],.0015,'rubber',4)
                # Original seven-segment geometry, not a third-party font.
                digits={'2':[0,1,6,4,3],'7':[0,1,2],'5':[0,5,6,2,3],
                        '1':[1,2],'8':list(range(7)),'-':[6],'.':[]}
                segments=[((-1,1),(1,1)),((1,1),(1,0)),((1,0),(1,-1)),
                          ((1,-1),(-1,-1)),((-1,-1),(-1,0)),((-1,0),(-1,1)),((-1,0),(1,0))]
                for j,char in enumerate('2.75-18'):
                    a=2.3+j*.052
                    for segment in digits[char]:
                        pts=[]
                        for u,v in segments[segment]:
                            angle=a+u*.014
                            r=.268+v*.007
                            pts.append((sign*.0478,.30+r*math.cos(angle),z+r*math.sin(angle)))
                        tube(wheel,'embossed_tyre_size',pts,.001,'rubber',4)
        if label == 'rear_wheel':
            ring(wheel,'rear_sprocket',(-.091,.30,z),.078,.010,'steel',40,8)
            for j in range(32 if near else 16):
                a=j*TAU/(32 if near else 16)
                block(wheel,'sprocket_tooth',(-.091,.30+.087*math.cos(a),z+.087*math.sin(a)),(.015,.009,.009),'steel',.002,2)
    # Tapered welded backbone and triangulated swingarm.
    for x in [-.105,.105]:
        tube(body,'tapered_frame',[(x,.30,-.64),(x,.76,-.37),(x,.78,.31),(x,.91,.43)],
             [.016,.022,.026,.029],'frame',sides)
        tube(body,'engine_cradle',[(x,.76,-.37),(x,.31,-.12),(x,.32,.23),(x,.83,.37)],.018,'frame',sides)
        tube(body,'swingarm',[(x,.41,-.04),(x,.30,-.64)],.023,'frame',sides)
        sign = -1 if x < 0 else 1
        ellipsoid(body,'side_cover_gasket',(x,.68,-.22),(.043,.101,.149),'rubber',n,20 if near else 10)
        rows=[]
        for offset, scale in [(.004,1),(.025,1),(.038,.94),(.047,.78),(.050,0)]:
            row=[]
            for a in np.linspace(0,TAU,n+1):
                sy=math.copysign(abs(math.sin(a))**.74,math.sin(a))
                sz=math.copysign(abs(math.cos(a))**.74,math.cos(a))
                row.append((sign*(.105+offset),.68+.095*scale*sy,-.22+.142*scale*sz))
            rows.append(row)
        body.surface('rounded_pressed_side_cover',rows,'paint',sign>0)
        # One slotted retaining screw per cover, with a recessed washer.
        ring(body,'side_cover_screw_seat',(sign*.156,.68,-.22),.007,.0015,'steel',24,6)
        tube(body,'side_cover_single_screw',[(sign*.155,.68,-.22),(sign*.160,.68,-.22)],.0055,'chrome',16)
        tube(body,'side_cover_screw_slot',[(sign*.1602,.677,-.22),(sign*.1602,.683,-.22)],.0007,'frame',4)
        if near:
            for j in range(2):
                tube(body,'light_side_cover_scuff',[(sign*.1555,.714+j*.003,-.28),
                    (sign*.1555,.711+j*.003,-.255)],.00025,'steel',4)
        # Exposed polished piston and real helical spring, not stacked cylinders.
        start=np.array((x,.35,-.61)); end=np.array((x,.72,-.40))
        tube(body,'shock_piston',[start,end],.014,'chrome',sides)
        d=end-start; unit=d/np.linalg.norm(d); u=np.array([1,0,0]); v=np.cross(unit,u)
        spring=[start+d*t+.031*(u*math.cos(t*TAU*10)+v*math.sin(t*TAU*10)) for t in np.linspace(0,1,201 if near else 81)]
        tube(body,'coil_spring',spring,.005,'chrome',6)
        for p in [start,end]:
            tube(body,'shock_collar',[p-unit*.016,p+unit*.016],.037,'steel',sides)
            bolt(body,p,.012)
        tube(front,'fork_lower',[(x,.30,.64),(x,.62,.53)],.029,'cast',sides)
        tube(front,'fork_stanchion',[(x,.59,.54),(x,.94,.42)],.018,'chrome',sides)
        for y in np.linspace(.62,.71,8):
            tube(front,'fork_dust_gaiter',[(x,y,.53-(y-.62)*.34),(x,y+.005,.528-(y-.62)*.34)],.025,'rubber',sides)
    # Sculpted teardrop tank with knee recesses and a real lower rolled weld.
    rows=[]
    for t in np.linspace(0,1,37 if near else 19):
        z=-.19+t*.63
        width=.183*math.sin(math.pi*t)**.55*(1-.17*t)
        row=[]
        for a in np.linspace(0,TAU,n+1):
            yy=.875+.147*math.sin(a)*math.sin(math.pi*t)**.35
            xx=width*math.cos(a)
            if math.sin(a)<-.15:
                xx*=.88+.12*t
            row.append((xx,yy,z))
        rows.append(row)
    body.surface('sculpted_fuel_tank',rows,'paint')
    seam=[(.153*math.sin(a)*(.86+.14*math.cos(a)),.796+.012*math.cos(a),.12+.257*math.cos(a)) for a in np.linspace(0,TAU,97)]
    tube(body,'tank_rolled_weld',seam,.003,'steel',6)
    for sign in [-1,1]:
        tube(body,'tank_pressed_rib',[(sign*x,y,z) for x,y,z in [(.08,.936,-.135),(.146,.946,-.06),(.164,.951,.08),(.136,.95,.27)]],.0018,'paint',6)
    tube(body,'locking_fuel_cap',[(0,1.012,.13),(0,1.032,.13)],.036,'chrome',32)
    block(body,'cap_key_slot',(0,1.034,.13),(.017,.002,.003),'frame',.001,2)
    # Upholstery follows the unchanged rider contact (seat y~.90).
    rows=[]
    for t in np.linspace(0,1,49 if near else 21):
        z=-.735+t*.66
        width=.157*(.85+.15*math.sin(math.pi*t))
        row=[]
        for a in np.linspace(0,TAU,49 if near else 25):
            wrinkle=.002*math.sin(t*TAU*19+math.sin(a)*3)*abs(math.cos(a))**6
            row.append(((width+wrinkle)*math.cos(a),.857+(.059+.007*math.cos(t*TAU))*math.sin(a),z))
        rows.append(row)
    body.surface('contoured_leather_seat',rows,'leather')
    piping=[(.156*math.sin(a),.871,-.405+.326*math.cos(a)) for a in np.linspace(0,TAU,129)]
    tube(body,'leather_piping',piping,.0026,'leather',6)
    def seat_top(x,z):
        t=(z+.735)/.66
        width=.157*(.85+.15*math.sin(math.pi*t))
        return .857+(.059+.007*math.cos(t*TAU))*math.sqrt(max(0,1-(x/width)**2))+.001
    for j in range(10):
        z=-.68+j*.057
        width=.157*(.85+.15*math.sin(math.pi*(z+.735)/.66))
        tube(body,'upholstery_pleat',[(x,seat_top(x,z),z) for x in np.linspace(-width*.94,width*.94,25 if near else 9)],.0017,'leather',5)
        if near:
            for x in np.linspace(-width*.9,width*.87,27):
                tube(body,'double_saddle_stitch',[(x,seat_top(x,z-.006)+.0005,z-.006),
                    (x+.004,seat_top(x+.004,z-.006)+.0005,z-.006)],.00065,'linen',4)
    # Cast crankcases, cooling fins and bolted rocker cover.
    ellipsoid(body,'cast_crankcase',(0,.435,-.03),(.151,.116,.158),'cast',n,20 if near else 10)
    for sign in [-1,1]:
        tube(body,'circular_crank_cover',[(sign*.126,.44,-.04),(sign*.16,.44,-.04)],.09,'cast',n)
        ring(body,'cover_gasket',(sign*.157,.44,-.04),.083,.002,'engine',40,6)
        for j in range(7):
            a=j*TAU/7
            bolt(body,(sign*.164,.44+.073*math.cos(a),-.04+.073*math.sin(a)),.006)
        tube(body,'footpeg',[(sign*.12,.36,-.12),(sign*.25,.36,-.12)],.022,'rubber',sides)
        for x in np.linspace(.16,.25,9):
            tube(body,'peg_ridge',[(sign*x,.36,-.12),(sign*(x+.003),.36,-.12)],.025,'rubber',sides)
    block(body,'cylinder_core',(0,.608,.084),(.18,.16,.15),'engine',.015,4)
    for y in np.linspace(.54,.686,10):
        block(body,'cooling_fin',(0,y,.084),(.264,.007,.218),'cast',.003,4)
    block(body,'rocker_cover',(0,.712,.082),(.205,.046,.176),'cast',.015,6)
    for x in [-.073,.073]:
        for z in [.026,.138]:
            bolt(body,(x,.74,z),.008,1)
    tube(body,'spark_plug',[(.085,.70,.12),(.122,.735,.14)],.009,'linen',8)
    tube(body,'ignition_cable',[(.12,.737,.14),(.16,.77,.18),(.13,.8,-.07)],.004,'rubber',8)
    # Intake rubber, float bowl, clamps, fuel hose and asymmetrical cast bosses.
    tube(body,'intake_manifold',[(0,.65,-.005),(0,.64,-.08)],.027,'rubber',sides)
    block(body,'carburetor_body',(0,.62,-.12),(.094,.087,.078),'cast',.014,6)
    ellipsoid(body,'carb_float_bowl',(0,.575,-.12),(.043,.032,.037),'cast',24,12)
    tube(body,'fuel_hose',[(.035,.79,-.10),(.06,.74,-.15),(.045,.65,-.13)],.004,'rubber',8)
    for z in [-.045,-.065]:
        ring(body,'intake_clamp',(0,.645,z),.028,.002,'chrome',24,6,2)
    for sign in [-1,1]:
        for y,z in [(.39,.03),(.48,-.13),(.51,.035)]:
            tube(body,'crankcase_boss',[(sign*.13,y,z),(sign*.156,y,z)],.015,'cast',12)
            bolt(body,(sign*.16,y,z),.008)
    tube(body,'oil_filler',[(.12,.50,-.10),(.16,.54,-.10)],.019,'frame',12)
    # Chain sits outside the rear drum. Individual pins and plates on both runs.
    for lower in [False,True]:
        a=np.array([-.105,.30+(-.080 if lower else .080),-.64])
        b=np.array([-.105,.40+(-.035 if lower else .035),-.10])
        tube(body,'chain_rollers',[a,b],.007,'engine',8)
        for t in np.linspace(0,1,42 if near else 22):
            p=a+(b-a)*t
            block(body,'chain_side_plate',p,(.005,.010,.015),'steel',.003,2)
            bolt(body,p+[-.004,0,0],.0035)
    tube(body,'gear_pedal',[(-.17,.35,-.09),(-.19,.33,.05),(-.25,.33,.07)],.007,'chrome',8)
    # Solid swept fenders: continuous opaque film, no overlaid speck geometry.
    for z in [-.64,.64]:
        batch=front if z>0 else body
        rows=[]
        for a in np.linspace(-.23,math.pi+.23,65 if near else 25):
            rows.append([(x,.30+(.333-.009*(x/.065)**2)*math.sin(a),z+.333*math.cos(a)) for x in np.linspace(-.065,.065,13)])
        batch.surface('pressed_mudguard_road_film',rows,'dust',False)
        inner=[[(x,.30+(y-.30)*.9928,z+(zp-z)*.9928) for x,y,zp in row] for row in rows]
        batch.surface('mudguard_inner_shell',inner,'dust',True)
        for sign in [-1,1]:
            k=0 if sign<0 else -1
            # The exact same edge vertices close the shell, avoiding white
            # chrome overlay aliasing and cracks at a grazing side view.
            batch.surface('painted_fender_closed_edge',[[outer[k],inside[k]] for outer,inside in zip(rows,inner)],'dust',sign<0)
            tube(batch,'fender_stay',[(sign*.064,.31,z),(sign*.064,.52,z-.22)],.005,'chrome',8)
        for k in [0,-1]:
            batch.surface('mudguard_closed_end',[rows[k],inner[k]],'dust',k==0)
    # Chrome exhaust with blue/straw temper transitions at the header bend.
    header=[(.10,.57,.20),(.15,.49,.28),(.20,.37,.28),(.23,.26,.17),(.24,.25,-.12),(.24,.26,-.40)]
    tube(body,'exhaust_header',header,.025,'chrome',sides)
    for i,slot in enumerate(['gold','blue','gold']):
        p=np.array(header[1]); q=np.array(header[2])
        tube(body,'heat_tint_'+slot,[p+(q-p)*(i/3),p+(q-p)*((i+1)/3)],.0253,slot,sides)
    tube(body,'tapered_muffler',[(.24,.26,-.30),(.24,.27,-.38),(.24,.285,-.82),(.24,.285,-.86)],
         [.027,.046,.043,.035],'chrome',n)
    tube(body,'dark_exhaust_bore',[(.24,.285,-.861),(.24,.285,-.866)],.027,'engine',32)
    ring(body,'rolled_muffler_lip',(.24,.285,-.863),.030,.004,'chrome',32,8,2)
    # Rack, stem, scrambler bar, controls, mirrors and flexible cables.
    for x in [-.13,.13]:
        tube(body,'rack_rail',[(x,.80,-.62),(x,.84,-.94)],.010,'chrome',sides)
        tube(body,'rack_stay',[(x,.43,-.62),(x,.83,-.91)],.008,'chrome',sides)
    for z in [-.70,-.78,-.86,-.94]:
        tube(body,'rack_crossbar',[(-.13,.84,z),(.13,.84,z)],.009,'chrome',sides)
    tube(front,'handlebar_stem',[(0,.89,.43),(0,1.06,.43)],.023,'chrome',sides)
    tube(front,'scrambler_handlebar',[(-.45,1.25,.42),(-.28,1.25,.48),(-.16,1.06,.47),
        (.16,1.06,.47),(.28,1.25,.48),(.45,1.25,.42)],.016,'chrome',sides)
    tube(front,'crossbrace',[(-.24,1.19,.48),(.24,1.19,.48)],.011,'chrome',sides)
    for sign in [-1,1]:
        tube(front,'grip',[(sign*.34,1.25,.459),(sign*.45,1.25,.42)],.023,'rubber',sides)
        tube(front,'lever',[(sign*.29,1.24,.50),(sign*.35,1.24,.53),(sign*.44,1.24,.52)],.006,'chrome',sides)
        ellipsoid(front,'lever_ball',(sign*.44,1.24,.52),(.009,.009,.009),'chrome',12,8)
        block(front,'control_housing',(sign*.32,1.25,.465),(.04,.047,.055),'frame',.008,4)
        tube(front,'mirror_stalk',[(sign*.31,1.25,.47),(sign*.36,1.44,.49),(sign*.38,1.48,.49)],.006,'chrome',sides)
        tube(front,'round_mirror',[(sign*.38,1.48,.485),(sign*.38,1.48,.50)],.064,'chrome',n)
        tube(front,'mirror_face',[(sign*.38,1.48,.501),(sign*.38,1.48,.503)],.058,'mirror',n)
        tube(front,'control_cable',[(sign*.30,1.24,.48),(sign*.20,1.15,.58),
            (sign*.13,.95,.55),(sign*.14,.76,.36)],.0035,'rubber',8)
    # Deep reflector bowl and fine lens fluting, no emissive solid disc.
    tube(front,'headlamp_bucket',[(0,.91,.48),(0,.91,.61)],.103,'frame',n)
    rows=[]
    for r in np.linspace(.004,.094,17):
        rows.append([(r*math.cos(a),.91+r*math.sin(a),.55+.085*(r/.094)**1.5) for a in np.linspace(0,TAU,n+1)])
    front.surface('parabolic_reflector',rows,'mirror',True)
    ring(front,'headlamp_bezel',(0,.91,.642),.098,.007,'chrome',n,10,2)
    ellipsoid(front,'headlamp_bulb',(0,.91,.615),(.012,.012,.027),'glass',24,12)
    if near:
        for x in np.linspace(-.087,.087,35):
            h=math.sqrt(.091**2-x*x)
            tube(front,'lens_optical_flute',[(x,.91-h,.641),(x,.91+h,.641)],.0009,'glass',4)
    for sign in [-1,1]:
        for batch,y,z,direction in [(front,.88,.52,1),(body,.76,-.81,-1)]:
            cx=sign*.19
            tube(batch,'indicator_chrome_stalk',[(sign*.10,y,z),(cx,y,z)],.0045,'chrome',12)
            tube(batch,'indicator_black_housing',[(cx,y,z-direction*.018),(cx,y,z),
                (cx,y,z+direction*.014)],[.012,.020,.020],'frame',24)
            ring(batch,'indicator_chrome_rim',(cx,y,z+direction*.014),.0195,.0014,'chrome',32,6,2)
            tube(batch,'indicator_reflector',[(cx,y,z+direction*.010),(cx,y,z+direction*.014)],.018,'mirror',24)
            tube(batch,'small_amber_prismatic_lens',[(cx,y,z+direction*.015),(cx,y,z+direction*.023),
                (cx,y,z+direction*.026)],[.019,.018,.015],'amber',32)
            if near:
                for dx in np.linspace(-.014,.014,11):
                    h=math.sqrt(.016**2-dx*dx)
                    tube(batch,'amber_moulded_lens_rib',[(cx+dx,y-h,z+direction*.0262),
                        (cx+dx,y+h,z+direction*.0262)],.0005,'amber',4)
    block(body,'tail_lens',(0,.77,-.86),(.11,.053,.038),'tail',.009,6)
    # Approved accessories retain their original placement and muted colours.
    ellipsoid(body,'helmet_shell',(0,1.045,.12),(.145,.17,.145),'paint',n,20 if near else 10,True)
    ring(body,'helmet_edge',(0,1.045,.12),.139,.005,'rubber',n,6,1)
    for x in [-.059,.059]:
        ellipsoid(body,'goggle_rim',(x,1.095,.25),(.060,.042,.014),'chrome',24,12)
        ellipsoid(body,'goggle_lens',(x,1.095,.263),(.048,.031,.008),'amber',24,12)
    tube(body,'goggle_bridge',[(-.018,1.097,.258),(.018,1.097,.258)],.006,'chrome',8)
    tube(body,'helmet_strap',[(-.12,1.09,.23),(-.145,1.09,.10),(0,1.09,-.025),(.145,1.09,.10),(.12,1.09,.23)],.008,'leather',8)
    block(front,'canvas_tote',(-.39,.91,.48),(.23,.30,.065),'linen',.022,10 if near else 4)
    for z in [.45,.51]:
        tube(front,'tote_handle',[(-.49,1.045,z),(-.46,1.24,z),(-.34,1.29,z),(-.29,1.045,z)],.006,'linen',8)
    if near:
        for x in np.linspace(-.48,-.30,40):
            tube(front,'tote_stitch',[(x,.784,.513),(x+.002,.784,.513)],.0006,'leather',4)
    for batch, parent in batches:
        batch.finish(material, parent)
    seat = bpy.data.objects.new('rider_seat', None)
    bpy.context.collection.objects.link(seat)
    seat.parent = root
    # Same hips contact as character/ride.ts RIDE_CONTACTS (character is untouched).
    seat.location = point((0,.99,-.25))
    root['runtime_scale'] = SCALE
    root['wheel_radius'] = .30*SCALE
    root['wheelbase'] = 1.28*SCALE
    root['collider'] = 'unchanged; owned by vehicle simulation'
    return root


def main():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    material = make_atlas()
    inventory=[]
    for lod in [0,1]:
        root=build(lod,material)
        objects=[root]+list(root.children_recursive)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        file=f'vehicle-gd110-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(OUT/file),export_format='GLB',use_selection=True,
            export_yup=True,export_animations=False,export_cameras=False,export_lights=False,
            export_extras=True,export_materials='EXPORT',export_image_format='AUTO')
        triangles=0
        for obj in objects:
            if obj.type=='MESH':
                obj.data.calc_loop_triangles()
                triangles+=len(obj.data.loop_triangles)
        draws=sum(len(set(p.material_index for p in obj.data.polygons)) for obj in objects if obj.type=='MESH')
        inventory.append({'file':file,'triangles':triangles,'draws':draws})
        for obj in reversed(objects):
            bpy.data.objects.remove(obj,do_unlink=True)
    (OUT/'inventory.json').write_text(json.dumps(inventory,indent=2))
    print('HR-GD110 '+json.dumps(inventory),flush=True)


if __name__=='__main__':
    main()
