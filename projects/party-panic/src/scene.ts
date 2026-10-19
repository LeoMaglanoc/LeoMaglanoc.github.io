import {
    AppBase,
    BatchManager,
    AppOptions,
    CameraComponentSystem,
    CollisionComponentSystem,
    Color,
    Entity,
    FILLMODE_NONE,
    LightComponentSystem,
    RenderComponentSystem,
    RESOLUTION_AUTO,
    RigidBodyComponentSystem,
    StandardMaterial,
    Vec3,
    WasmModule,
    createGraphicsDevice
} from 'playcanvas';
import { LASER_COVERS, LASER_SPAWNS, getAimRig, type Point } from './laser';
import type { Player, ModeId } from './protocol';
export type Obstacle = { entity: Entity; z: number; kind: 'sweeper' | 'bumper'; phase: number };
type CharacterMotion = { model: Entity; arms: Entity[]; feet: Entity[]; vy: number; squash: number };
type EffectParticle = { entity: Entity; age: number; duration: number; vx: number; vy: number; vz: number };
export class Scene {
    private motions = new Map<string, CharacterMotion>();
    private particles: EffectParticle[] = [];
    private raceTarget = new Vec3();
    modeId: ModeId = 'obstacle-dash';
    traces: { entity: Entity; age: number }[] = [];
    world!: Entity;
    app!: AppBase;
    camera!: Entity;
    physics!: RigidBodyComponentSystem;
    liveBodies = new Set<object>();
    characters = new Map<string, Entity>();
    obstacles: Obstacle[] = [];
    triggers: Entity[] = [];
    materials = new Map<string, StandardMaterial>();
    onLanding: (id: string) => void = () => {};
    onTrigger: (id: string, index: number) => void = () => {};
    onHit: (id: string, obstacle: Obstacle) => void = () => {};
    async init(canvas: HTMLCanvasElement) {
        const base = import.meta.env.BASE_URL;
        WasmModule.setConfig('Ammo', {
            glueUrl: base + 'ammo/ammo.wasm.js',
            wasmUrl: base + 'ammo/ammo.wasm.wasm',
            fallbackUrl: base + 'ammo/ammo.js'
        });
        await Promise.race([
            new Promise<void>((resolve) => WasmModule.getInstance('Ammo', () => resolve())),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Physics failed to load. Reload on a stable connection.')), 20000)
            )
        ]);
        const device = await createGraphicsDevice(canvas, { deviceTypes: ['webgl2'], antialias: devicePixelRatio < 2 });
        device.maxPixelRatio = Math.min(devicePixelRatio, 1.5);
        const options = new AppOptions();
        options.graphicsDevice = device;
        options.batchManager = BatchManager;
        options.componentSystems = [
            RenderComponentSystem,
            CameraComponentSystem,
            LightComponentSystem,
            CollisionComponentSystem,
            RigidBodyComponentSystem
        ];
        this.app = new AppBase(canvas);
        this.app.init(options);
        this.app.setCanvasFillMode(
            FILLMODE_NONE,
            window.visualViewport?.width ?? innerWidth,
            window.visualViewport?.height ?? innerHeight
        );
        this.app.setCanvasResolution(RESOLUTION_AUTO);
        this.app.scene.ambientLight = new Color(0.65, 0.7, 0.8);
        this.physics = this.app.systems.rigidbody!;
        // Initialize the physics world BEFORE terrain/triggers are created.
        this.physics.onLibraryLoaded();
        if (!this.physics.physicsWorld) throw new Error('Physics initialization failed. Reload to retry.');
        if (import.meta.env.DEV) {
            const world = this.physics.physicsWorld,
                create = world.createBody.bind(world),
                destroy = world.destroyBody.bind(world);
            world.createBody = (...args: Parameters<typeof world.createBody>) => {
                const body = create(...args);
                this.liveBodies.add(body);
                return body;
            };
            world.destroyBody = (body) => {
                this.liveBodies.delete(body);
                destroy(body);
            };
        }
        this.physics.gravity.set(0, -18, 0);
        this.physics.fixedTimeStep = 1 / 60;
        this.physics.maxSubSteps = 2;
        this.physics.timeScale = 0;
        this.camera = new Entity('follow-camera');
        this.camera.addComponent('camera', { clearColor: new Color(0.075, 0.11, 0.19), farClip: 230, fov: 60 });
        this.camera.setPosition(17, 23, 25);
        this.camera.lookAt(0, 0, -32);
        this.app.root.addChild(this.camera);
        const light = new Entity('sun');
        light.addComponent('light', { type: 'directional', intensity: 1.8, castShadows: false });
        light.setEulerAngles(48, -25, 0);
        this.app.root.addChild(light);
        this.app.batcher!.addGroup('course', false, 45, 0);
        this.world = new Entity('obstacle-dash-world');
        this.app.root.addChild(this.world);
        this.level();
        this.app.batcher!.generate();
        this.app.start();
    }
    resize(width: number, height: number) {
        this.app.resizeCanvas(Math.round(width), Math.round(height));
    }
    material(hex: string) {
        let m = this.materials.get(hex);
        if (!m) {
            m = new StandardMaterial();
            m.diffuse = new Color().fromString(hex);
            m.emissive = new Color().fromString(hex);
            m.emissiveIntensity = 0.2;
            m.useLighting = false;
            m.update();
            this.materials.set(hex, m);
        }
        return m;
    }
    mesh(
        parent: Entity,
        type: 'box' | 'capsule' | 'sphere' | 'cylinder' | 'cone',
        size: [number, number, number],
        color: string,
        position: [number, number, number] = [0, 0, 0]
    ) {
        const e = new Entity(type);
        e.addComponent('render', { type, material: this.material(color) });
        e.setLocalScale(...size);
        e.setLocalPosition(...position);
        parent.addChild(e);
        return e;
    }
    box(
        name: string,
        pos: [number, number, number],
        size: [number, number, number],
        color: string,
        body: 'static' | 'kinematic' | null = 'static'
    ) {
        const e = new Entity(name);
        e.setPosition(...pos);
        this.world.addChild(e);
        const visual = this.mesh(e, 'box', size, color);
        if (body !== 'kinematic') visual.render!.batchGroupId = 0;
        if (body) {
            e.addComponent('collision', { type: 'box', halfExtents: new Vec3(size[0] / 2, size[1] / 2, size[2] / 2) });
            e.addComponent('rigidbody', { type: body, friction: 0.5, restitution: 0.1 });
        }
        return e;
    }
    level() {
        // Course runs toward -Z. Flat primitives keep collision cost bounded.
        for (const [i, [a, b]] of [
            [8, -16],
            [-18, -26],
            [-28, -35],
            [-37, -44]
        ].entries())
            this.box('gap-platform-' + i, [0, -0.6, (a + b) / 2], [12, 1.2, a - b], i % 2 ? '#6768b4' : '#7676c9');
        // Contrasting lips describe the actual take-off and landing edges; no fake rails over gaps.
        for (const z of [-16, -18, -26, -28, -35, -37]) {
            this.box('gap-lip', [0, 0.018, z], [12, 0.036, 0.18], '#f3f0cf', null);
            this.box('gap-depth', [0, -0.55, z], [12, 0.5, 0.08], '#373956', null);
        }
        this.box('sweeper-deck', [0, -0.6, -64], [12, 1.2, 40], '#3e9c9e');
        this.box('bumper-deck', [0, -0.6, -109.5], [12, 1.2, 51], '#bc717e');
        for (const z of [-56, -71]) {
            const e = this.box('rotating-sweeper', [0, 0.7, z], [10.4, 0.45, 0.55], '#ffcc4a', 'kinematic');
            this.mesh(e, 'cylinder', [0.7, 2, 0.7], '#f3f0cf', [0, -0.1, 0]);
            for (const x of [-4.9, 4.9]) this.mesh(e, 'box', [0.5, 0.49, 0.6], '#fff4a3', [x, 0, 0]);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const mark = this.box(
                    'sweep-radius',
                    [Math.sin(a) * 5.1, 0.02, z + Math.cos(a) * 5.1],
                    [0.16, 0.04, 0.55],
                    '#9bd5cc',
                    null
                );
                mark.setEulerAngles(0, (a * 180) / Math.PI, 0);
            }
            const o: Obstacle = { entity: e, z, kind: 'sweeper', phase: 0 };
            this.obstacles.push(o);
            e.collision!.on('collisionstart', (r: { other: Entity }) => this.onHit(r.other.name, o));
            this.box('warning-stripe', [0, 0.015, z], [11.8, 0.035, 1.6], '#286d75', null);
        }
        for (const [i, z] of [-96, -108, -120].entries()) {
            const e = this.box('moving-bumper', [0, 0.8, z], [3.3, 1.6, 1.3], '#ffce5c', 'kinematic');
            const o: Obstacle = { entity: e, z, kind: 'bumper', phase: i * 1.8 };
            this.obstacles.push(o);
            e.collision!.on('collisionstart', (r: { other: Entity }) => this.onHit(r.other.name, o));
            this.box('bumper-track', [0, 0.02, z], [12, 0.04, 1.5], '#935361', null);
            for (const dz of [-0.82, 0.82])
                this.box('bumper-rail', [0, 0.026, z + dz], [11.8, 0.052, 0.09], '#f3b5ad', null);
            for (const x of [-5.5, 5.5]) this.box('bumper-stop', [x, 0.035, z], [0.14, 0.07, 1.5], '#ffce5c', null);
            for (const x of [-6.2, 6.2]) this.box('pusher-base', [x, 0.7, z], [0.35, 1.4, 2], '#e59ca5', null);
        }
        for (const [i, z] of [-40, -85, -132].entries()) {
            const color = i === 2 ? '#ffce5c' : '#92f1db';
            this.box('checkpoint-line', [0, 0.025, z], [11.8, 0.05, 1], color, null);
            for (const x of [-5.7, 5.7]) this.box('gate-post', [x, 2, z], [0.28, 4, 0.28], color, null);
            this.box('gate-top', [0, 4, z], [11.7, 0.28, 0.28], color, null);
            const trigger = new Entity('checkpoint-' + i);
            trigger.setPosition(0, 1.5, z);
            trigger.addComponent('collision', { type: 'box', halfExtents: new Vec3(5.8, 2, 1) });
            trigger.collision!.on('triggerenter', (e: Entity) => this.onTrigger(e.name, i + 1));
            this.world.addChild(trigger);
            this.triggers.push(trigger);
        }
        for (let z = 6; z > -134; z -= 6) {
            if ((z < -16 && z > -18) || (z < -26 && z > -28) || (z < -35 && z > -37)) continue;
            for (const x of [-6.4, 6.4]) this.box('edge-light', [x, -0.2, z], [0.15, 0.2, 2], '#d1e2e7', null);
        }
        for (const x of [-2, -1, 0, 1, 2])
            this.box('finish-tile', [x * 2, 0.035, -133], [1.9, 0.07, 2], x % 2 ? '#192334' : '#f3f0cf', null);
        // Floating islands and flags, deliberately outside the course.
        for (let i = 0; i < 10; i++) {
            const side = i % 2 ? 1 : -1;
            this.box('island', [side * (14 + (i % 3) * 5), -5 - (i % 3), -i * 15], [5, 3, 7], '#252f47', null);
        }
    }
    setMode(modeId: ModeId) {
        if (this.modeId === modeId) return;
        this.clearEffects();
        this.app.batcher!.removeGroup(0);
        this.world.destroy();
        this.obstacles = [];
        this.triggers = [];
        this.modeId = modeId;
        this.world = new Entity(modeId + '-world');
        this.app.root.addChild(this.world);
        this.app.batcher!.addGroup('course', false, 45, 0);
        if (modeId === 'obstacle-dash') this.level();
        else this.arena();
        this.camera.camera!.fov = modeId === 'laser-tag' ? 70 : 60;
        this.camera.camera!.clearColor =
            modeId === 'laser-tag' ? new Color(0.025, 0.04, 0.09) : new Color(0.075, 0.11, 0.19);
        this.app.batcher!.generate();
    }
    arena() {
        for (const [i, c] of LASER_COVERS.entries()) {
            const size: [number, number, number] = [c.max.x - c.min.x, c.max.y - c.min.y, c.max.z - c.min.z];
            const pos: [number, number, number] = [
                (c.min.x + c.max.x) / 2,
                (c.min.y + c.max.y) / 2,
                (c.min.z + c.max.z) / 2
            ];
            this.box(c.id ?? 'cover-' + i, pos, size, c.color ?? '#455b7e');
            if (c.id !== 'arena-floor')
                this.box(
                    'cover-light',
                    [pos[0], c.max.y + 0.02, pos[2]],
                    [size[0], 0.04, size[2]],
                    i % 2 ? '#75dfd1' : '#b6a0ff',
                    null
                );
        }
        for (let x = -12; x <= 12; x += 2) this.box('floor-grid', [x, 0.012, 0], [0.025, 0.025, 21], '#334b69', null);
        for (let z = -10; z <= 10; z += 2) this.box('floor-grid', [0, 0.013, z], [27, 0.025, 0.025], '#334b69', null);
        LASER_SPAWNS.forEach((p, i) => {
            this.box('spawn-pad', [p.x, 0.025, p.z], [1.4, 0.05, 1.4], i % 2 ? '#75dfd1' : '#b6a0ff', null);
        });
    }
    followLaser(id: string, yaw: number, pitch: number) {
        const p = this.characters.get(id)?.getPosition();
        if (!p) return;
        const rig = getAimRig(p, yaw, pitch);
        this.camera.setPosition(rig.camera.x, rig.camera.y, rig.camera.z);
        this.camera.lookAt(
            rig.camera.x + rig.direction.x * 25,
            rig.camera.y + rig.direction.y * 25,
            rig.camera.z + rig.direction.z * 25
        );
    }
    showShot(from: Point, to: Point, color: string) {
        if (this.traces.length >= 16) this.traces.shift()!.entity.destroy();
        const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
        if (length < 0.01) return;
        const entity = this.mesh(this.app.root, 'box', [0.045, 0.045, length], color, [
            (from.x + to.x) / 2,
            (from.y + to.y) / 2,
            (from.z + to.z) / 2
        ]);
        entity.lookAt(to.x, to.y, to.z);
        this.traces.push({ entity, age: 0 });
    }
    addPlayer(p: Player, physical: boolean) {
        if (this.characters.has(p.id)) return this.characters.get(p.id)!;
        const e = new Entity(p.id);
        e.setPosition(p.x, p.y, p.z);
        this.app.root.addChild(e);
        const model = new Entity('model');
        e.addChild(model);
        this.mesh(model, 'capsule', [0.75, 0.75, 0.75], p.color);
        this.mesh(model, 'sphere', [0.59, 0.4, 0.25], '#202b41', [0, 0.35, -0.34]);
        this.mesh(model, 'sphere', [0.09, 0.1, 0.05], '#f9faf6', [-0.14, 0.37, -0.47]);
        this.mesh(model, 'sphere', [0.09, 0.1, 0.05], '#f9faf6', [0.14, 0.37, -0.47]);
        if (this.modeId === 'laser-tag') {
            this.mesh(model, 'box', [0.18, 0.22, 0.6], '#e6eeff', [0.44, 0.05, -0.4]);
            this.mesh(model, 'box', [0.12, 0.12, 0.18], p.color, [0.44, 0.05, -0.79]);
            this.mesh(e, 'cylinder', [1.2, 0.03, 1.2], '#75dfd1', [0, -0.68, 0]).name = 'spawn-shield';
        }
        const arms = [-0.4, 0.4].map((x) => this.mesh(model, 'sphere', [0.2, 0.28, 0.23], p.color, [x, -0.1, 0]));
        const feet = [-0.2, 0.2].map((x) =>
            this.mesh(model, 'sphere', [0.25, 0.19, 0.35], '#202b41', [x, -0.59, -0.04])
        );
        this.motions.set(p.id, { model, arms, feet, vy: 0, squash: 0 });
        if (physical) {
            e.addComponent('collision', { type: 'capsule', radius: 0.38, height: 1.5 });
            e.addComponent('rigidbody', {
                type: 'dynamic',
                mass: 1,
                angularFactor: Vec3.ZERO,
                friction: 0,
                restitution: 0,
                group: 128,
                mask: 22
            });
        }
        this.characters.set(p.id, e);
        return e;
    }
    removePlayer(id: string) {
        this.characters.get(id)?.destroy();
        this.characters.delete(id);
        this.motions.delete(id);
    }
    /** Render-only motion: authoritative capsules never scale, lean or receive particles. */
    animate(players: Player[], time: number, dt: number) {
        const step = Math.min(Math.max(dt, 0), 0.1);
        for (const p of players) {
            const shield = this.characters.get(p.id)?.findByName('spawn-shield');
            if (shield) shield.enabled = p.protectedUntil > time;
            const m = this.motions.get(p.id);
            if (!m) continue;
            if (m.vy < -1 && Math.abs(p.vy) < 0.5 && p.y > -0.2 && p.y < 1.1) {
                m.squash = 0.14;
                this.effect('land', p.id);
                this.onLanding(p.id);
            }
            m.vy = p.vy;
            m.squash *= Math.exp(-step * 16);
            const speed = Math.min(Math.hypot(p.vx, p.vz) / 2.8, 1);
            const grounded = Math.abs(p.vy) < 0.5;
            const swing = grounded ? Math.sin(time * 17) * speed : 0;
            m.feet.forEach((foot, i) =>
                foot.setLocalPosition(
                    i ? 0.2 : -0.2,
                    -0.59 + Math.max(0, swing * (i ? 1 : -1)) * 0.12,
                    -0.04 + swing * (i ? 1 : -1) * 0.16
                )
            );
            m.arms.forEach((arm, i) =>
                arm.setLocalPosition(i ? 0.4 : -0.4, -0.1 + (grounded ? 0 : 0.12), swing * (i ? -1 : 1) * 0.12)
            );
            const stretch = grounded ? -m.squash : Math.min(Math.abs(p.vy) * 0.006, 0.05);
            m.model.setLocalScale(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
            m.model.setLocalPosition(0, grounded ? -m.squash * 0.2 : 0, 0);
        }
        for (let i = this.traces.length - 1; i >= 0; i--) {
            this.traces[i].age += step;
            if (this.traces[i].age >= 0.1) {
                this.traces[i].entity.destroy();
                this.traces.splice(i, 1);
            }
        }
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.age += step;
            if (particle.age >= particle.duration) {
                particle.entity.destroy();
                this.particles.splice(i, 1);
                continue;
            }
            particle.vy -= step * 5;
            particle.entity.translate(particle.vx * step, particle.vy * step, particle.vz * step);
            const size = 0.12 * (1 - particle.age / particle.duration);
            particle.entity.setLocalScale(size, size, size);
        }
    }
    effect(type: 'jump' | 'land' | 'hit' | 'checkpoint', id: string) {
        const character = this.characters.get(id);
        if (!character) return;
        const motion = this.motions.get(id);
        if (motion && type === 'hit') motion.squash = 0.2;
        const color = type === 'checkpoint' ? '#92f1db' : type === 'hit' ? '#ff9376' : '#f3f0cf';
        const count = type === 'checkpoint' ? 8 : 4;
        const p = character.getPosition();
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= 24) this.particles.shift()!.entity.destroy();
            const angle = (i / count) * Math.PI * 2;
            const entity = this.mesh(this.app.root, 'box', [0.12, 0.12, 0.12], color, [p.x, p.y - 0.5, p.z]);
            this.particles.push({
                entity,
                age: 0,
                duration: type === 'checkpoint' ? 0.65 : 0.3,
                vx: Math.sin(angle) * 1.5,
                vy: type === 'checkpoint' ? 3 : 1,
                vz: Math.cos(angle) * 1.5
            });
        }
    }
    get transientCount() {
        return this.traces.length + this.particles.length;
    }
    clearEffects() {
        for (const trace of this.traces) trace.entity.destroy();
        this.traces.length = 0;
        for (const particle of this.particles) particle.entity.destroy();
        this.particles.length = 0;
    }
    obstaclesAt(t: number) {
        for (const o of this.obstacles) {
            if (o.kind === 'sweeper') o.entity.setEulerAngles(0, t * 76, 0);
            else o.entity.setPosition(Math.sin(t * 1.7 + o.phase) * 4.2, 0.8, o.z);
        }
    }
    follow(id: string, dt: number, snap = false, yaw = 0, pitch = 0.55) {
        const e = this.characters.get(id);
        if (!e) return;
        const p = e.getPosition();
        const pivot = new Vec3(p.x, p.y + 0.6, p.z);
        const elevation = Math.max(0.2, Math.min(0.85, pitch));
        const desired = new Vec3(
            p.x - Math.sin(yaw) * 10 * Math.cos(elevation),
            pivot.y + 10 * Math.sin(elevation),
            p.z + Math.cos(yaw) * 10 * Math.cos(elevation)
        );
        const alpha = snap ? 1 : 1 - 2 ** (-Math.max(0, dt) / 0.09);
        desired.lerp(this.camera.getPosition(), desired, alpha);
        // Clamp AFTER smoothing; even a recovering camera cannot drift through cover.
        const hit = this.physics.raycastFirst(pivot, desired, {
            filterCallback: (other: Entity) => !!other.rigidbody && other.rigidbody.type !== 'dynamic'
        });
        if (hit) {
            const offset = desired.clone().sub(pivot);
            const distance = Math.max(0.2, hit.point.distance(pivot) - 0.25);
            desired.copy(pivot).add(offset.normalize().mulScalar(distance));
        }
        this.camera.setPosition(desired);
        const target = new Vec3(p.x + Math.sin(yaw) * 1.5, p.y + 0.3, p.z - Math.cos(yaw) * 1.5);
        if (snap || this.raceTarget.lengthSq() === 0) this.raceTarget.copy(target);
        else this.raceTarget.lerp(this.raceTarget, target, 1 - 2 ** (-Math.max(0, dt) / 0.07));
        this.camera.lookAt(this.raceTarget);
    }
    face(id: string, yaw: number) {
        this.characters.get(id)?.findByName('model')?.setLocalEulerAngles(0, yaw, 0);
    }
}
