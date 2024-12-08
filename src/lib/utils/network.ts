import type { SystemConnectionNode } from "./logical-expression-parser";

export enum RecoveryKind {
	Software = "software",
	Hardware = "hardware"
}

export type SystemElementConfig = {
	recoveryCounts: {
		[RecoveryKind.Software]: number;
		[RecoveryKind.Hardware]: number;
	};
};

export type ElementState = SystemElementConfig & {
	isActive: boolean;
};

export enum NetworkNodeState {
	Active = "active",
	Recovery = "recovery",
	Terminal = "terminal"
}

export type NetworkNode = {
	name: string;
	state: NetworkNodeState;
	elementsStates: ElementState[];
};

export enum EdgeKind {
	Failure = "failure",
	Recovery = "recovery"
}

export type NetworkEdge = {
	kind: EdgeKind;
	sourceNode: NetworkNode;
	targetNode: NetworkNode;
};

export type StateNetwork = {
	nodes: NetworkNode[];
	edges: NetworkEdge[];
};

// TODO: Function implementation.
export function buildSystemStateNetwork(systemRootNode: SystemConnectionNode) {
	// TODO: Return an object compatible with the StateNetwork type.
	return {} satisfies StateNetwork;
}
