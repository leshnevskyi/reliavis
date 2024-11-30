export type ElementState = {
	isActive: boolean;
	recoveryCounts: {
		sofware: number;
		hardware: number;
	};
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
	rate: number;
};

export type ElementRecovery = {
	rate: number;
	count: number;
};

export type SystemElement = {
	failureRate: number;
	recoveries?: {
		software: ElementRecovery;
		hardware: ElementRecovery;
	};
};

export type StateNetwork = {
	nodes: NetworkNode[];
	edges: NetworkEdge[];
};

// TODO: Function implementation.
export function buildSystemStateNetwork(elements: SystemElement[]) {
	// TODO: Return an object compatible with the StateNetwork type.
	return {} satisfies StateNetwork;
}
