import type { Snapshot } from '../../src/protocol';
import type { Faults } from '../../src/transport';
declare global {
    interface Window {
        partyDebug: {
            getInput: () => import('../../src/protocol').Input;
            getState: () => Snapshot;
            setTestInput: (
                axes: [number, number],
                jumpSequence: number,
                jumpHeld?: boolean,
                diveSequence?: number
            ) => void;
            aimAtPlayer: (id: string) => void;
            clearMeasurements: () => void;
            setAim: (yaw: number, pitch: number) => void;
            selectMode: (modeId: 'obstacle-dash' | 'laser-tag') => boolean | undefined;
            readyTestPlayers: () => void;
            addTestPlayer: (name: string) => unknown;
            getDiagnostics: () => {
                bodies: number;
                renderComponents: number;
                transientEntities: number;
                connectionCount: number;
                bufferedBytes: number;
                snapshotAge: number;
                display: import('../../src/platform/displayMode').DisplayModeState;
                elapsedSeconds: number;
                ice: string;
                semantics: string;
                rtt: number;
                fps: { median: number; p5: number };
                counts: {
                    sent: number;
                    received: number;
                    rejected: number;
                    droppedBackpressure: number;
                    sentBytes: number;
                    receivedBytes: number;
                };
            };
            getLogs: () => unknown[];
            sendControl: (v: unknown) => void;
            getRenderPosition: (id: string) => { x: number; y: number; z: number } | null;
            sendRaw: (v: unknown) => void;
            setFaults: (f: Faults) => void;
            setPaused: (v: boolean) => void;
            advanceWall: (seconds: number) => void;
            hostAdvance: (seconds: number) => void;
            teleport: (id: string, z: number) => void;
            stop: () => void;
        };
    }
}
