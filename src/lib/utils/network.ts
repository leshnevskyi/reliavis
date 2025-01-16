import { clone } from "remeda";

import {
	AstNodeKind,
	astWalker,
	OperatorToken,
	type SystemConnectionNode,
	type SystemElementNode,
	type SystemNode
} from "./logical-expression-parser";

export enum StateChangeKind {
	Software = "software",
	Hardware = "hardware"
}

export enum IncrementFailureKind {
	Software = "softwareFailure",
	Hardware = "hardwareFailure",
	SoftwareInfinite = "softwareFailureWithInfiniteRecovery",
	HardwareInfinite = "hardwareFailureWithInfiniteRecovery"
}

export enum IncrementRecoveryKind {
	Software = "softwareRecovery",
	Hardware = "hardwareRecovery"
}

export type IncrementChangeKind = IncrementRecoveryKind | IncrementFailureKind;

export type RecoveryState = { count: number; isActive: boolean };

export type RecoveryStates = {
	[StateChangeKind.Software]: RecoveryState;
	[StateChangeKind.Hardware]: RecoveryState;
};

export type PartialRecoveryStates =
	| RecoveryStates
	| Pick<RecoveryStates, StateChangeKind.Software>
	| Pick<RecoveryStates, StateChangeKind.Hardware>;

export type SystemElementState = {
	recoveryStates: PartialRecoveryStates;
};

export type RecoveryCounts = {
	[StateChangeKind.Software]: number;
	[StateChangeKind.Hardware]: number;
};

export type PartialRecoveryCounts =
	| RecoveryCounts
	| Pick<RecoveryCounts, StateChangeKind.Software>
	| Pick<RecoveryCounts, StateChangeKind.Hardware>;

export type SystemElementConfig = {
	recoveryCounts: PartialRecoveryCounts;
};

export type StatefullSystemElementNode = SystemElementNode & SystemElementState;

export enum NetworkNodeState {
	Active = "active",
	Recovery = "recovery",
	Terminal = "terminal"
}

export type NetworkNode = {
	name: string;
	state: NetworkNodeState;
	elementsStates: SystemElementState[];
	changeKind: IncrementChangeKind;
};

export enum EdgeKind {
	Failure = "failure",
	Recovery = "recovery"
}

export type NetworkEdgeChangedElement = {
	index: number;
	changeKind: StateChangeKind;
};

export type NetworkEdge = {
	kind: EdgeKind;
	sourceNode: NetworkNode;
	targetNode: NetworkNode;
	changedElement: NetworkEdgeChangedElement;
};

export type StateNetwork = {
	nodes: NetworkNode[];
	edges: NetworkEdge[];
};

export type CheckSystemState = (elems: StatefullSystemElementNode[]) => NetworkNodeState;

export type Index = {
	value: number;
};

export function buildSystemStateNetwork(systemRootNode: SystemConnectionNode) {
	const systemState = { nodes: [], edges: [] } as StateNetwork;
	const elementsState = [] as StatefullSystemElementNode[];

	for (const node of astWalker(systemRootNode)) {
		if (node.kind == AstNodeKind.Operand) {
			const elem = {
				...(node as SystemElementNode),
				recoveryStates: createRecoveryStates((node as SystemElementNode).recoveryCounts)
			} satisfies StatefullSystemElementNode;

			elementsState.push(elem);
		}
	}

	const checkSystemState = (elems: StatefullSystemElementNode[]): NetworkNodeState => {
		return getSystemStateFromNode(systemRootNode, elems);
	};

	processElements(systemState, elementsState, checkSystemState);

	for (let i = 0; i < systemState.nodes.length - 1; i++) {
		for (let j = i + 1; j < systemState.nodes.length; j++) {
			const newEdges = edgesBetweenNodes(systemState.nodes[i]!, systemState.nodes[j]!);
			systemState.edges.push(...newEdges);
		}
	}

	const stateCount = {
		[NetworkNodeState.Active]: 0,
		[NetworkNodeState.Recovery]: 0,
		[NetworkNodeState.Terminal]: 0
	};

	for (const node of systemState.nodes) {
		stateCount[node.state] += 1;
	}

	return systemState satisfies StateNetwork;
}

function createRecoveryStates(recoveryCounts: PartialRecoveryCounts): PartialRecoveryStates {
	if (StateChangeKind.Software in recoveryCounts && StateChangeKind.Hardware in recoveryCounts) {
		return {
			[StateChangeKind.Software]: {
				count: 0,
				isActive: true
			},
			[StateChangeKind.Hardware]: {
				count: 0,
				isActive: true
			}
		};
	} else if (StateChangeKind.Software in recoveryCounts) {
		return {
			[StateChangeKind.Software]: {
				count: 0,
				isActive: true
			}
		};
	} else if (StateChangeKind.Hardware in recoveryCounts) {
		return {
			[StateChangeKind.Hardware]: {
				count: 0,
				isActive: true
			}
		};
	} else {
		throw new Error("Invalid recoveryCounts structure");
	}
}

function getSystemStateFromNode(
	node: SystemNode,
	elems: StatefullSystemElementNode[]
): NetworkNodeState {
	if (node.kind == AstNodeKind.Operand) {
		const elem = elems.find((elem) => elem.name == node.name);
		if (!elem) {
			throw new Error(`Expected to find element for node: ${node}`);
		}

		const { recoveryCounts, recoveryStates } = elem;

		if (isRecoveryStatesActive(recoveryStates)) {
			return NetworkNodeState.Active;
		}

		const hardwareRecoveryActive =
			StateChangeKind.Hardware in recoveryStates &&
			StateChangeKind.Hardware in recoveryCounts &&
			recoveryStates[StateChangeKind.Hardware] !== undefined &&
			recoveryCounts[StateChangeKind.Hardware] !== undefined
				? recoveryStates[StateChangeKind.Hardware].count <
						recoveryCounts[StateChangeKind.Hardware] ||
					recoveryCounts[StateChangeKind.Hardware] === Infinity
				: undefined;

		const softwareRecoveryActive =
			StateChangeKind.Software in recoveryStates &&
			StateChangeKind.Software in recoveryCounts &&
			recoveryStates[StateChangeKind.Software] !== undefined &&
			recoveryCounts[StateChangeKind.Software] !== undefined
				? recoveryStates[StateChangeKind.Software].count <
						recoveryCounts[StateChangeKind.Software] ||
					recoveryCounts[StateChangeKind.Software] === Infinity
				: undefined;

		if (
			(isHardwareRecoveryStatesActive(recoveryStates) || hardwareRecoveryActive) &&
			(isSoftwareRecoveryStatesActive(recoveryStates) || softwareRecoveryActive)
		) {
			return NetworkNodeState.Recovery;
		}

		return NetworkNodeState.Terminal;
	}

	const leftState = getSystemStateFromNode((node as SystemConnectionNode).left, elems);
	const rightState = getSystemStateFromNode((node as SystemConnectionNode).right, elems);

	if (node.value == OperatorToken.And) {
		if (leftState == NetworkNodeState.Terminal || rightState == NetworkNodeState.Terminal) {
			return NetworkNodeState.Terminal;
		}

		if (leftState == NetworkNodeState.Recovery || rightState == NetworkNodeState.Recovery) {
			return NetworkNodeState.Recovery;
		}

		return NetworkNodeState.Active;
	}

	if (node.value == OperatorToken.Or) {
		if (leftState == NetworkNodeState.Active || rightState == NetworkNodeState.Active) {
			return NetworkNodeState.Active;
		}

		if (leftState == NetworkNodeState.Recovery || rightState == NetworkNodeState.Recovery) {
			return NetworkNodeState.Recovery;
		}

		return NetworkNodeState.Terminal;
	}

	return NetworkNodeState.Terminal;
}

function processElements(
	state: StateNetwork,
	elems: StatefullSystemElementNode[],
	checkSystemState: CheckSystemState
) {
	const nodeIdx = { value: 0 } satisfies Index;

	saveNewNode(state, elems, checkSystemState, nodeIdx, IncrementFailureKind.Hardware);

	processElementsLevel(state, elems, checkSystemState, nodeIdx, 0);
}

function processElementsLevel(
	state: StateNetwork,
	elems: StatefullSystemElementNode[],
	checkSystemState: CheckSystemState,
	nodeIdx: Index,
	elemIdx: number
) {
	while (true) {
		if (elemIdx + 1 < elems.length) {
			processElementsLevel(
				state,
				elems.map((elem) => clone(elem)),
				checkSystemState,
				nodeIdx,
				elemIdx + 1
			);
		}

		const hardwareRecoveryCounts =
			StateChangeKind.Hardware in elems[elemIdx]!.recoveryCounts
				? (elems[elemIdx]!.recoveryCounts as RecoveryCounts)[StateChangeKind.Hardware]
				: undefined;
		const hardwareState =
			StateChangeKind.Hardware in elems[elemIdx]!.recoveryStates
				? (elems[elemIdx]!.recoveryStates as RecoveryStates)[StateChangeKind.Hardware]
				: undefined;
		const softwareRecoveryCounts =
			StateChangeKind.Software in elems[elemIdx]!.recoveryCounts
				? (elems[elemIdx]!.recoveryCounts as RecoveryCounts)[StateChangeKind.Software]
				: undefined;
		const softwareState =
			StateChangeKind.Software in elems[elemIdx]!.recoveryStates
				? (elems[elemIdx]!.recoveryStates as RecoveryStates)[StateChangeKind.Software]
				: undefined;
		let tryIncrementResult;

		if (
			hardwareState !== undefined &&
			hardwareRecoveryCounts !== undefined &&
			softwareState !== undefined &&
			softwareRecoveryCounts !== undefined
		) {
			if (hardwareState.isActive && softwareState.isActive) {
				const hwFailureBranchElems = elems.map((elem) => clone(elem));
				const swFailureBranchElems = elems.map((elem) => clone(elem));

				if (StateChangeKind.Hardware in hwFailureBranchElems[elemIdx]!.recoveryStates) {
					const changeKind = tryFailForKind(
						(hwFailureBranchElems[elemIdx]!.recoveryStates as RecoveryStates)[
							StateChangeKind.Hardware
						],
						hardwareRecoveryCounts,
						StateChangeKind.Hardware
					);

					if (changeKind !== undefined) {
						saveNewNode(state, hwFailureBranchElems, checkSystemState, nodeIdx, changeKind);

						processElementsLevel(state, hwFailureBranchElems, checkSystemState, nodeIdx, elemIdx);
					}
				}

				if (StateChangeKind.Software in swFailureBranchElems[elemIdx]!.recoveryStates) {
					const changeKind = tryFailForKind(
						(swFailureBranchElems[elemIdx]!.recoveryStates as RecoveryStates)[
							StateChangeKind.Software
						],
						softwareRecoveryCounts,
						StateChangeKind.Software
					);

					if (changeKind !== undefined) {
						saveNewNode(state, swFailureBranchElems, checkSystemState, nodeIdx, changeKind);

						processElementsLevel(state, swFailureBranchElems, checkSystemState, nodeIdx, elemIdx);
					}
				}
			} else if (!hardwareState.isActive) {
				tryIncrementResult = tryRecoverForKind(
					hardwareState,
					hardwareRecoveryCounts,
					StateChangeKind.Hardware
				);
			} else if (!softwareState.isActive) {
				tryIncrementResult = tryRecoverForKind(
					softwareState,
					softwareRecoveryCounts,
					StateChangeKind.Software
				);
			}
		} else if (hardwareState !== undefined && hardwareRecoveryCounts !== undefined) {
			tryIncrementResult = tryIncrementForKind(
				hardwareState,
				hardwareRecoveryCounts,
				StateChangeKind.Hardware
			);
		} else if (softwareState !== undefined && softwareRecoveryCounts !== undefined) {
			tryIncrementResult = tryIncrementForKind(
				softwareState,
				softwareRecoveryCounts,
				StateChangeKind.Software
			);
		}

		if (tryIncrementResult === undefined) {
			break;
		} else {
			saveNewNode(state, elems, checkSystemState, nodeIdx, tryIncrementResult);
		}
	}
}

function saveNewNode(
	state: StateNetwork,
	elems: StatefullSystemElementNode[],
	checkSystemState: CheckSystemState,
	nodeIdx: Index,
	changeKind: IncrementChangeKind
) {
	const node = {
		name: `P${nodeIdx.value}`,
		state: checkSystemState(elems),
		elementsStates: elems.map((elem) => clone(elem)),
		changeKind: changeKind
	} satisfies NetworkNode;

	state.nodes.push(node);
	nodeIdx.value += 1;
}

function tryIncrementForKind(
	state: RecoveryState,
	recCount: number,
	kind: StateChangeKind
): IncrementChangeKind | undefined {
	return tryFailForKind(state, recCount, kind) || tryRecoverForKind(state, recCount, kind);
}

function tryFailForKind(
	state: RecoveryState,
	recCount: number,
	kind: StateChangeKind
): IncrementChangeKind | undefined {
	if (state.isActive) {
		state.isActive = false;
		if (recCount === Infinity) {
			state.count = Infinity;
			return kind == StateChangeKind.Software
				? IncrementFailureKind.SoftwareInfinite
				: IncrementFailureKind.HardwareInfinite;
		} else {
			return kind == StateChangeKind.Software
				? IncrementFailureKind.Software
				: IncrementFailureKind.Hardware;
		}
	}

	return undefined;
}

function tryRecoverForKind(
	state: RecoveryState,
	recCount: number,
	kind: StateChangeKind
): IncrementChangeKind | undefined {
	if (canRecover(state, recCount)) {
		state.isActive = true;
		state.count += 1;
		return kind == StateChangeKind.Software
			? IncrementRecoveryKind.Software
			: IncrementRecoveryKind.Hardware;
	}

	return undefined;
}

function canRecover(state: RecoveryState, recCount: number): boolean {
	return state.count < recCount && recCount !== Infinity;
}

function edgesBetweenNodes(sourceNode: NetworkNode, targetNode: NetworkNode): NetworkEdge[] {
	const changeKind =
		targetNode.changeKind == IncrementFailureKind.Software ||
		targetNode.changeKind == IncrementFailureKind.SoftwareInfinite ||
		targetNode.changeKind == IncrementRecoveryKind.Software
			? StateChangeKind.Software
			: StateChangeKind.Hardware;
	const { isSingleFailure, failedElementIndex } = isSingleFailureBetweenNodes(
		sourceNode,
		targetNode
	);

	if (isSingleFailure) {
		const edges: NetworkEdge[] = [];
		const changedElement: NetworkEdgeChangedElement = {
			index: failedElementIndex,
			changeKind: changeKind
		};

		edges.push({
			kind: EdgeKind.Failure,
			sourceNode: sourceNode,
			targetNode: targetNode,
			changedElement: changedElement
		} satisfies NetworkEdge);

		if (
			targetNode.changeKind == IncrementFailureKind.SoftwareInfinite ||
			targetNode.changeKind == IncrementFailureKind.HardwareInfinite
		) {
			edges.push({
				kind: EdgeKind.Recovery,
				sourceNode: targetNode,
				targetNode: sourceNode,
				changedElement: changedElement
			} satisfies NetworkEdge);
		}

		return edges;
	}

	const { isSingleRecovery, recoveredElementIndex } = isSingleRecoveryBetweenNodes(
		sourceNode,
		targetNode
	);

	if (isSingleRecovery) {
		const changedElement: NetworkEdgeChangedElement = {
			index: recoveredElementIndex,
			changeKind: changeKind
		};

		return [
			{
				kind: EdgeKind.Recovery,
				sourceNode: sourceNode,
				targetNode: targetNode,
				changedElement: changedElement
			} satisfies NetworkEdge
		];
	}

	return [];
}

function isSingleFailureBetweenNodes(
	sourceNode: NetworkNode,
	targetNode: NetworkNode
): { isSingleFailure: boolean; failedElementIndex: number } {
	let isSingleCorrectChange: boolean | undefined = undefined;
	let elementIndex: number = Infinity;

	for (let i = 0; i < sourceNode.elementsStates.length; i++) {
		const sourceHardwareState =
			StateChangeKind.Hardware in sourceNode.elementsStates[i]!.recoveryStates
				? (sourceNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Hardware]
				: undefined;
		const sourceSoftwareState =
			StateChangeKind.Software in sourceNode.elementsStates[i]!.recoveryStates
				? (sourceNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Software]
				: undefined;

		const targetHardwareState =
			StateChangeKind.Hardware in targetNode.elementsStates[i]!.recoveryStates
				? (targetNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Hardware]
				: undefined;
		const targetSoftwareState =
			StateChangeKind.Software in targetNode.elementsStates[i]!.recoveryStates
				? (targetNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Software]
				: undefined;

		const isEqualCounts =
			equalCountsOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
			equalCountsOrTargetUndefined(sourceSoftwareState, targetSoftwareState);

		if (
			equalStatesOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
			equalStatesOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
			isEqualCounts
		) {
			continue;
		} else if (
			(equalStatesOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
				equalCountsOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
				stateBecomeInactiveOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
				(equalCountsOrTargetUndefined(sourceSoftwareState, targetSoftwareState) ||
					countBecomeInfiniteOrTargetUndefined(sourceSoftwareState, targetSoftwareState))) ||
			(equalStatesOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
				equalCountsOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
				stateBecomeInactiveOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
				(equalCountsOrTargetUndefined(sourceHardwareState, targetHardwareState) ||
					countBecomeInfiniteOrTargetUndefined(sourceHardwareState, targetHardwareState)))
		) {
			if (isSingleCorrectChange == undefined) {
				isSingleCorrectChange = true;
				elementIndex = i;
			} else {
				isSingleCorrectChange = false;
				elementIndex = Infinity;
			}
		} else {
			isSingleCorrectChange = false;
		}

		if (isSingleCorrectChange == false) {
			return { isSingleFailure: false, failedElementIndex: Infinity };
		}
	}

	return {
		isSingleFailure: isSingleCorrectChange == true,
		failedElementIndex: elementIndex
	};
}

function isSingleRecoveryBetweenNodes(
	sourceNode: NetworkNode,
	targetNode: NetworkNode
): {
	isSingleRecovery: boolean;
	recoveredElementIndex: number;
} {
	let isSingleCorrectChange: boolean | undefined = undefined;
	let elementIndex: number = Infinity;

	for (let i = 0; i < sourceNode.elementsStates.length; i++) {
		const sourceHardwareState =
			StateChangeKind.Hardware in sourceNode.elementsStates[i]!.recoveryStates
				? (sourceNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Hardware]
				: undefined;
		const sourceSoftwareState =
			StateChangeKind.Software in sourceNode.elementsStates[i]!.recoveryStates
				? (sourceNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Software]
				: undefined;

		const targetHardwareState =
			StateChangeKind.Hardware in targetNode.elementsStates[i]!.recoveryStates
				? (targetNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Hardware]
				: undefined;
		const targetSoftwareState =
			StateChangeKind.Software in targetNode.elementsStates[i]!.recoveryStates
				? (targetNode.elementsStates[i]!.recoveryStates as RecoveryStates)[StateChangeKind.Software]
				: undefined;
		const isEqualCounts =
			equalCountsOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
			equalCountsOrTargetUndefined(sourceSoftwareState, targetSoftwareState);

		if (
			equalStatesOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
			equalStatesOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
			isEqualCounts
		) {
			continue;
		} else if (
			(equalStatesOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
				equalCountsOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
				stateBecomeActiveOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
				countsDiffsEqualOneOrTargetUndefined(sourceSoftwareState, targetSoftwareState)) ||
			(equalStatesOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
				equalCountsOrTargetUndefined(sourceSoftwareState, targetSoftwareState) &&
				stateBecomeActiveOrTargetUndefined(sourceHardwareState, targetHardwareState) &&
				countsDiffsEqualOneOrTargetUndefined(sourceHardwareState, targetHardwareState))
		) {
			if (isSingleCorrectChange == undefined) {
				isSingleCorrectChange = true;
				elementIndex = i;
			} else if (isSingleCorrectChange == true) {
				isSingleCorrectChange = false;
				elementIndex = Infinity;
			}
		} else {
			isSingleCorrectChange = false;
		}

		if (isSingleCorrectChange == false) {
			return {
				isSingleRecovery: false,
				recoveredElementIndex: Infinity
			};
		}
	}

	return {
		isSingleRecovery: isSingleCorrectChange == true,
		recoveredElementIndex: elementIndex
	};
}

function equalStatesOrTargetUndefined(
	sourceState?: RecoveryState,
	targetState?: RecoveryState
): boolean {
	if (targetState === undefined) {
		return true;
	} else {
		if (sourceState === undefined) {
			return false;
		}
	}

	return sourceState.isActive == targetState.isActive;
}

function stateBecomeInactiveOrTargetUndefined(
	sourceState?: RecoveryState,
	targetState?: RecoveryState
): boolean {
	if (targetState === undefined) {
		return true;
	} else {
		if (sourceState === undefined) {
			return false;
		}
	}

	return sourceState.isActive && !targetState.isActive;
}

function stateBecomeActiveOrTargetUndefined(
	sourceState?: RecoveryState,
	targetState?: RecoveryState
): boolean {
	if (targetState === undefined) {
		return true;
	} else {
		if (sourceState === undefined) {
			return false;
		}
	}

	return !sourceState.isActive && targetState.isActive;
}

function countBecomeInfiniteOrTargetUndefined(
	sourceState?: RecoveryState,
	targetState?: RecoveryState
): boolean {
	if (targetState === undefined) {
		return true;
	} else {
		if (sourceState === undefined) {
			return false;
		}
	}

	return sourceState.count == 0 && targetState.count === Infinity;
}

function equalCountsOrTargetUndefined(
	sourceState?: RecoveryState,
	targetState?: RecoveryState
): boolean {
	if (targetState === undefined) {
		return true;
	} else {
		if (sourceState === undefined) {
			return false;
		}
	}

	return sourceState.count == targetState.count;
}

function countsDiffsEqualOneOrTargetUndefined(
	sourceState?: RecoveryState,
	targetState?: RecoveryState
): boolean {
	if (targetState === undefined) {
		return true;
	} else {
		if (sourceState === undefined) {
			return false;
		}
	}

	return targetState.count - sourceState.count == 1;
}

export function isRecoveryStatesActive(recoveryStates: PartialRecoveryStates): boolean {
	const hardwareExists = StateChangeKind.Hardware in recoveryStates;
	const softwareExists = StateChangeKind.Software in recoveryStates;

	if (softwareExists && hardwareExists) {
		return (
			recoveryStates[StateChangeKind.Software].isActive &&
			recoveryStates[StateChangeKind.Hardware].isActive
		);
	}

	if (softwareExists) {
		return recoveryStates[StateChangeKind.Software].isActive;
	}

	if (hardwareExists) {
		return recoveryStates[StateChangeKind.Hardware].isActive;
	}

	return false;
}

export function isHardwareRecoveryStatesActive(
	recoveryStates: PartialRecoveryStates
): boolean | undefined {
	const hardwareExists = StateChangeKind.Hardware in recoveryStates;

	if (hardwareExists) {
		return recoveryStates[StateChangeKind.Hardware].isActive;
	}

	return undefined;
}

export function isSoftwareRecoveryStatesActive(
	recoveryStates: PartialRecoveryStates
): boolean | undefined {
	const softwareExists = StateChangeKind.Software in recoveryStates;

	if (softwareExists) {
		return recoveryStates[StateChangeKind.Software].isActive;
	}

	return undefined;
}
