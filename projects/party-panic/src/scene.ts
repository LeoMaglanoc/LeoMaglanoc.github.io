import {
    AppBase,
    BatchManager,
    AppOptions,
    CameraComponentSystem,
    CollisionComponentSystem,
    Color,
    Entity,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RenderComponentSystem,
    RESOLUTION_AUTO,
    RigidBodyComponentSystem,
    StandardMaterial,
    Vec3,
    WasmModule,
    createGraphicsDevice
} from 'playcanvas';
import type { Player } from './protocol';
export type Obstacle = { entity: Entity; z: number; kind: 'sweeper' | 'bumper'; phase: number };
export class Scene {
    app!: AppBase;
    camera!: Entity;
    physics!: RigidBodyComponentSystem;
    liveBodies = new Set<object>();
    characters = new Map<string, Entity>();
    obstacles: Obstacle[] = [];
    triggers: Entity[] = [];
    materials = new Map<string, StandardMaterial>();
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
        this.app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
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
        this.level();
        this.app.batcher!.generate();
        this.app.start();
        window.addEventListener('resize', () => this.app.resizeCanvas());
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
        this.app.root.addChild(e);
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
        this.box('sweeper-deck', [0, -0.6, -64], [12, 1.2, 40], '#3e9c9e');
        this.box('bumper-deck', [0, -0.6, -109.5], [12, 1.2, 51], '#bc717e');
        for (const z of [-56, -71]) {
            const e = this.box('rotating-sweeper', [0, 0.7, z], [10.4, 0.45, 0.55], '#ffcc4a', 'kinematic');
            this.mesh(e, 'cylinder', [0.7, 2, 0.7], '#f3f0cf', [0, -0.1, 0]);
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
            this.app.root.addChild(trigger);
            this.triggers.push(trigger);
        }
        for (let z = 6; z > -134; z -= 6) {
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
        this.mesh(model, 'sphere', [0.2, 0.28, 0.23], p.color, [-0.4, -0.1, 0]);
        this.mesh(model, 'sphere', [0.2, 0.28, 0.23], p.color, [0.4, -0.1, 0]);
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
    }
    obstaclesAt(t: number) {
        for (const o of this.obstacles) {
            if (o.kind === 'sweeper') o.entity.setEulerAngles(0, t * 76, 0);
            else o.entity.setPosition(Math.sin(t * 1.7 + o.phase) * 4.2, 0.8, o.z);
        }
    }
    follow(id: string, dt: number, snap = false) {
        const e = this.characters.get(id);
        if (!e) return;
        const p = e.getPosition();
        const desired = new Vec3(p.x, p.y + 5.8, p.z + 8.4);
        const alpha = snap ? 1 : 1 - Math.exp(-dt * 7);
        this.camera.setPosition(this.camera.getPosition().lerp(this.camera.getPosition(), desired, alpha));
        this.camera.lookAt(this.camera.getPosition().x, p.y + 0.2, p.z - 3);
    }
    face(id: string, yaw: number) {
        this.characters.get(id)?.findByName('model')?.setLocalEulerAngles(0, yaw, 0);
    }
}
