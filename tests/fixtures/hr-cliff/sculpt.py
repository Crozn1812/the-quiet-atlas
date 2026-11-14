"""Original HR-CLIFF sculpt and periodic height-field normal/AO bake, Blender 5.2.
Input is generated from createSpring by prepare.mjs; no downloads.
All authored outputs dedicated CC0-1.0: https://creativecommons.org/publicdomain/zero/1.0/
Run blender --background --python tests/fixtures/hr-cliff/sculpt.py
"""
import bpy, bmesh, json, math, os, random
import numpy as np
from mathutils import Vector
from mathutils.noise import noise_vector
root=os.getcwd(); work=os.path.join(root,'tmp/hr-cliff'); os.makedirs(work,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
source=json.load(open(os.path.join(work,'sculpt-input.json')))
p=source['positions']; verts=[(p[i],-p[i+2],p[i+1]) for i in range(0,len(p),3)]
mesh=bpy.data.meshes.new('Sculpted fracture shoulders'); mesh.from_pydata(verts,[],[(i,i+1,i+2) for i in range(0,len(verts),3)]);mesh.update()
attr=mesh.color_attributes.new(name='Stone',type='FLOAT_COLOR',domain='CORNER')
colors=source['colors']
for poly in mesh.polygons:
    for li in poly.loop_indices:
        i=mesh.loops[li].vertex_index*3
        # Normalize authored broad pigments against warm mid-grey: the photo
        # carries albedo, while ledges and wet cracks retain their local masks.
        attr.data[li].color=(*[min(1.4,colors[i+j]/[.38,.32,.24][j]) for j in range(3)],1)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=0.0001)
bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
# Multi-scale sculpting is locked to the surface, retaining the buried footprint.
for v in bm.verts:
    co=v.co; n=v.normal.copy(); f=noise_vector(co*0.8); g=noise_vector(co*3.2)
    d=(f.x*0.085+g.y*0.025)*min(1,max(0,(co.z-7)*0.7))
    v.co+=n*d
bm.to_mesh(mesh);bm.free();mesh.update()
obj=bpy.data.objects.new('first-light-sculpted-rock',mesh);bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
for poly in mesh.polygons:poly.use_smooth=True
# Dominant-axis UVs measured in metres: a 3.5 m repeat rather than one photo
# stretched over an entire 39 m mountain. Periodic maps make all wraps seamless.
uv=mesh.uv_layers.new(name='Rock metres')
for poly in mesh.polygons:
    n=poly.normal;axis=max(range(3),key=lambda j:abs(n[j]))
    axes=[j for j in range(3) if j!=axis]
    for li in poly.loop_indices:
        co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]]/3.5,co[axes[1]]/3.5)
# Periodic multiscale height field, mineral inclusions, warped bedding and
# cellular fissures. Derivatives and concavity bake tangent normal and AO.
N=2048;rng=np.random.default_rng(802)
y,x=np.mgrid[0:N,0:N].astype(np.float32)/N

def octave(cells):
    grid=rng.random((cells,cells),dtype=np.float32);xx=x*cells;yy=y*cells
    ix=xx.astype(int);iy=yy.astype(int);fx=xx-ix;fy=yy-iy
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    return (grid[iy%cells,ix%cells]*(1-fx)+grid[iy%cells,(ix+1)%cells]*fx)*(1-fy)+(grid[(iy+1)%cells,ix%cells]*(1-fx)+grid[(iy+1)%cells,(ix+1)%cells]*fx)*fy
coarse=octave(4);medium=octave(16);fine=octave(128);grain=octave(512)
field=.35*coarse+.25*medium+.14*fine+.07*grain
warp=x+.035*np.sin(y*math.tau*3)+.025*(coarse-.5)
bedding=np.sin((y*9+.28*np.sin(x*math.tau*2)+.5*medium)*math.tau)
# Cracks at several scales avoid a regular brick-grid appearance.
crack=np.clip((.065-np.abs(medium-.48))/.065,0,1)**8*np.clip((coarse-.3)*2,0,1)
height=field*.28+.006*bedding-.035*crack
moss=np.clip((coarse-.55)*6,0,1)*np.clip((medium-.4)*4,0,1)
def read_pixels(file):
    image=bpy.data.images.load(os.path.join(work,file),check_existing=False);image.colorspace_settings.name='Non-Color'
    values=np.empty(N*N*4,dtype=np.float32);image.pixels.foreach_get(values);bpy.data.images.remove(image)
    return values.reshape((N,N,4))[:,:,:3]
# Reuse the checked-in CC0 rock_face photo, extracted from the terrain atlas.
# No downloading: provenance and original hashes live in cc0-sources.json.
photo=read_pixels('rock-photo.png');relief=read_pixels('rock-surface.png')
base=photo*np.array([1.03,.98,.83],dtype=np.float32)*(1-.2*crack[:,:,None])
base=base*(1-moss[:,:,None]*.4)+np.array([.15,.21,.08],dtype=np.float32)*moss[:,:,None]*.4
# AO comes from local height concavity; roughness responds to damp fissures.
blur=sum(np.roll(np.roll(height,i,0),j,1) for i,j in [(8,0),(-8,0),(0,8),(0,-8)])/4
ao=np.clip(1-(blur-height)*8-.24*crack,.36,1)
dx=(np.roll(height,-1,1)-np.roll(height,1,1))*N*.045
dy=(np.roll(height,-1,0)-np.roll(height,1,0))*N*.045
photo_xy=relief[:,:,:2]*2-1
norm=np.stack([photo_xy[:,:,0]-dx*.25,photo_xy[:,:,1]-dy*.25,np.sqrt(np.maximum(.01,1-(photo_xy**2).sum(axis=2)))],axis=-1);norm/=np.linalg.norm(norm,axis=-1)[:,:,None]

def save(name,rgb):
    image=bpy.data.images.new(name,width=N,height=N,alpha=False)
    image.colorspace_settings.name='sRGB' if name=='cliff-color' else 'Non-Color'
    rgba=np.ones((N,N,4),dtype=np.float32);rgba[:,:,:3]=np.clip(rgb,0,1)
    image.pixels.foreach_set(rgba.ravel());image.filepath_raw=os.path.join(work,name+'.png');image.file_format='PNG';image.save();return image
color=save('cliff-color',base);normal=save('cliff-normal',norm*.5+.5)
surface=save('cliff-orm',np.stack([ao,np.clip(relief[:,:,2]-.1*crack,.72,1),np.zeros_like(ao)],axis=-1))
mat=bpy.data.materials.new('CC0 sculpt stone with crevice moss');mat.use_nodes=True
nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
tex=nodes.new('ShaderNodeTexImage');tex.image=color;links.new(tex.outputs['Color'],bs.inputs['Base Color'])
vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Stone'
mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
links.new(tex.outputs['Color'],mix.inputs[1]);links.new(vc.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],bs.inputs['Base Color'])
tex=nodes.new('ShaderNodeTexImage');tex.image=normal;bump=nodes.new('ShaderNodeNormalMap');bump.inputs['Strength'].default_value=.55;links.new(tex.outputs['Color'],bump.inputs['Color']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
tex=nodes.new('ShaderNodeTexImage');tex.image=surface;sep=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bs.inputs['Roughness'])
# glTF exporter recognizes this occlusion socket.
grp=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');grp.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');gn=nodes.new('ShaderNodeGroup');gn.node_tree=grp;links.new(sep.outputs['Red'],gn.inputs['Occlusion'])
obj.data.materials.append(mat)
# Root fern crowns in sampled surface creases. Each frond has a curved rachis
# and 11 paired, folded lanceolate leaflets, with varied length/yaw and gravity.
r=random.Random(831);fv=[];ff=[];fc=[]
def tri(a,b,c,tint):
    k=len(fv);fv.extend([a,b,c]);ff.append((k,k+1,k+2));fc.extend([tint]*3)
mesh.calc_loop_triangles();candidates=[]
for poly in mesh.polygons:
    c=poly.center
    if .15<poly.normal.z<.88 and c.z>8 and c.z<45 and r.random()<.025:candidates.append((c.copy(),poly.normal.copy()))
near=[p for p in candidates if p[0].z<22 and p[0].x*p[0].x+p[0].y*p[0].y<800]
for center,n in r.sample(near,min(len(near),100))+r.sample(candidates,min(len(candidates),75)):
    # Start slightly inside the stone so there is no hovering root.
    base=center-n*.035
    for f in range(r.randint(4,7)):
        angle=r.random()*math.tau;length=r.uniform(.35,.95);direction=Vector((math.cos(angle),math.sin(angle),0));cross=Vector((-direction.y,direction.x,0))
        def stem(t):return base+direction*(length*t*.8)+Vector((0,0,length*(.8*t-.65*t*t)))
        for j in range(1,12):
            t=j/13;at=stem(t);width=length*.19*math.sin(t*math.pi)**.75
            for side in [-1,1]:
                tip=at+cross*width*side+direction*width*.48+Vector((0,0,-width*.18));mid=(at+tip)*.5+Vector((0,0,.025));leaf=direction*(width*.19)
                tint=(r.uniform(.065,.12),r.uniform(.16,.26),r.uniform(.025,.06),1)
                tri(at,mid+leaf,tip,tint);tri(at,tip,mid-leaf,tint)
# Wind-shaped saplings root directly in the broken crest. Branches and folded
# leaves join the fern mesh, retaining two material draws for the whole cliff.
crest=[poly.center.copy() for poly in mesh.polygons if poly.normal.z>.75 and poly.center.z>30]
for base in r.sample(crest,min(28,len(crest))):
    height=r.uniform(1.5,3.6);lean=Vector((r.uniform(-.6,.6),r.uniform(-.4,.4),height))
    tip=base+lean
    for side in range(3):
        a=side*math.tau/3;b=(side+1)*math.tau/3
        tri(base+Vector((math.cos(a)*.09,math.sin(a)*.09,0)),base+Vector((math.cos(b)*.09,math.sin(b)*.09,0)),tip,(.12,.09,.045,1))
    for branch in range(8):
        t=.35+branch*.075;angle=branch*2.4
        start=base+lean*t;end=start+Vector((math.cos(angle)*height*.35,math.sin(angle)*height*.35,height*.2))
        tri(start+Vector((.025,0,0)),start-Vector((.025,0,0)),end,(.12,.09,.045,1))
        for leaf in range(18):
            at=start.lerp(end,r.uniform(.4,1))+Vector((r.uniform(-.35,.35),r.uniform(-.35,.35),r.uniform(-.2,.3)))
            axis=Vector((r.uniform(-.22,.22),r.uniform(-.22,.22),r.uniform(.04,.15)))
            cross=Vector((-axis.y,axis.x,.03))*.35
            tint=(r.uniform(.055,.1),r.uniform(.12,.22),.025,1)
            tri(at-axis,at+cross,at+axis,tint);tri(at-axis,at+axis,at-cross,tint)
fernmesh=bpy.data.meshes.new('Folded pinnate fronds');fernmesh.from_pydata(fv,[],ff);fernmesh.update();fern=bpy.data.objects.new('first-light-crevice-ferns',fernmesh);bpy.context.collection.objects.link(fern)
attr=fernmesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for poly in fernmesh.polygons:
    for li in poly.loop_indices:attr.data[li].color=fc[fernmesh.loops[li].vertex_index]
fm=bpy.data.materials.new('Crevice fern');fm.use_nodes=True;fm.diffuse_color=(1,1,1,1);fm.use_backface_culling=False;fn=fm.node_tree.nodes;vc=fn.new('ShaderNodeVertexColor');vc.layer_name='Color';fm.node_tree.links.new(vc.outputs['Color'],fn.get('Principled BSDF').inputs['Base Color']);fn.get('Principled BSDF').inputs['Roughness'].default_value=.9;fernmesh.materials.append(fm)
for ob in bpy.context.selected_objects:ob.select_set(False)
obj.select_set(True);fern.select_set(True)
# Both LODs share the baked 2K maps. No runtime sculpting or animation loop.
for lod,ratio in [('high',1),('balanced',.28)]:
    if ratio<1:
        dec=obj.modifiers.new('Distance LOD','DECIMATE');dec.ratio=ratio
        dec=fern.modifiers.new('Distance LOD','DECIMATE');dec.ratio=.6
    bpy.ops.export_scene.gltf(filepath=os.path.join(work,'cliff-'+lod+'.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_image_format='AUTO',export_normals=True,export_texcoords=True,export_animations=False)
print('HR-CLIFF sculpt/bake done',len(mesh.polygons),len(ff))
