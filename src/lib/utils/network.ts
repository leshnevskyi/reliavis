import { clone } from "remeda";
import { v4 as uuidv4 } from "uuid";

import {
    AstNodeKind,
    astWalker,
    OperatorToken,
    type SystemConnectionNode,
    type SystemElementNode,
    type SystemNode,
} from "./logical-expression-parser";

export enum StateChangeKind {
    Software = "software",
    Hardware = "hardware",
}

export enum IncrementFailureKind {
    Software = "softwareFailure",
    Hardware = "hardwareFailure",
    SoftwareInfinite = "softwareFailureWithInfiniteRecovery",
    HardwareInfinite = "hardwareFailureWithInfiniteRecovery",
}

export enum IncrementRecoveryKind {
    Software = "softwareRecovery",
    Hardware = "hardwareRecovery",
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
    Terminal = "terminal",
}

export type NetworkNode = {
    name: string;
    state: NetworkNodeState;
    elementsStates: SystemElementState[];
    changeKind: IncrementChangeKind;
};

export enum EdgeKind {
    Failure = "failure",
    Recovery = "recovery",
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

export type CheckSystemState = (
    elems: StatefullSystemElementNode[],
) => NetworkNodeState;

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
                recoveryStates: createRecoveryStates(
                    (node as SystemElementNode).recoveryCounts,
                ),
            } satisfies StatefullSystemElementNode;

            elementsState.push(elem);
        }
    }

    const checkSystemState = (
        elems: StatefullSystemElementNode[],
    ): NetworkNodeState => {
        return getSystemStateFromNode(systemRootNode, elems);
    };

    processElements(
        systemState,
        elementsState,
        checkSystemState,
    );

    for (let i = 0; i < systemState.nodes.length - 1; i++) {
        for (let j = i + 1; j < systemState.nodes.length; j++) {
            const newEdges = edgesBetweenNodes(
                systemState.nodes[i]!,
                systemState.nodes[j]!,
                elementsState,
            );
            systemState.edges.push(...newEdges);
        }
    }

    const stateCount = {
        [NetworkNodeState.Active]: 0,
        [NetworkNodeState.Recovery]: 0,
        [NetworkNodeState.Terminal]: 0,
    };

    console.log(stateCount);

    for (const node of systemState.nodes) {
        stateCount[node.state] += 1;
    }

    return systemState satisfies StateNetwork;
}

function createRecoveryStates(
    recoveryCounts: PartialRecoveryCounts,
): PartialRecoveryStates {
    if (
        StateChangeKind.Software in recoveryCounts &&
        StateChangeKind.Hardware in recoveryCounts
    ) {
        return {
            [StateChangeKind.Software]: {
                count: 0,
                isActive: true,
            },
            [StateChangeKind.Hardware]: {
                count: 0,
                isActive: true,
            },
        };
    } else if (StateChangeKind.Software in recoveryCounts) {
        return {
            [StateChangeKind.Software]: {
                count: 0,
                isActive: true,
            },
        };
    } else if (StateChangeKind.Hardware in recoveryCounts) {
        return {
            [StateChangeKind.Hardware]: {
                count: 0,
                isActive: true,
            },
        };
    } else {
        throw new Error("Invalid recoveryCounts structure");
    }
}

function getSystemStateFromNode(
    node: SystemNode,
    elems: StatefullSystemElementNode[],
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
            (isHardwareRecoveryStatesActive(recoveryStates) ||
                hardwareRecoveryActive) &&
            (isSoftwareRecoveryStatesActive(recoveryStates) ||
                softwareRecoveryActive)
        ) {
            return NetworkNodeState.Recovery;
        }

        return NetworkNodeState.Terminal;
    }

    const leftState = getSystemStateFromNode(
        (node as SystemConnectionNode).left,
        elems,
    );
    const rightState = getSystemStateFromNode(
        (node as SystemConnectionNode).right,
        elems,
    );

    if (node.value == OperatorToken.And) {
        if (
            leftState == NetworkNodeState.Terminal ||
            rightState == NetworkNodeState.Terminal
        ) {
            return NetworkNodeState.Terminal;
        }

        if (
            leftState == NetworkNodeState.Recovery ||
            rightState == NetworkNodeState.Recovery
        ) {
            return NetworkNodeState.Recovery;
        }

        return NetworkNodeState.Active;
    }

    if (node.value == OperatorToken.Or) {
        if (
            leftState == NetworkNodeState.Active ||
            rightState == NetworkNodeState.Active
        ) {
            return NetworkNodeState.Active;
        }

        if (
            leftState == NetworkNodeState.Recovery ||
            rightState == NetworkNodeState.Recovery
        ) {
            return NetworkNodeState.Recovery;
        }

        return NetworkNodeState.Terminal;
    }

    return NetworkNodeState.Terminal;
}

function processElements(
    state: StateNetwork,
    elems: StatefullSystemElementNode[],
    checkSystemState: CheckSystemState,
) {
    const nodeIdx = { value: 0 } satisfies Index;

    saveNewNode(
        state,
        elems,
        checkSystemState,
        nodeIdx,
        IncrementFailureKind.Hardware,
    );

    processElementsLevel(
        state,
        elems,
        checkSystemState,
        nodeIdx,
        0,
    );
}

function processElementsLevel(
    state: StateNetwork,
    elems: StatefullSystemElementNode[],
    checkSystemState: CheckSystemState,
    nodeIdx: Index,
    elemIdx: number,
) {
    while (true) {
        if (elemIdx + 1 < elems.length) {
            processElementsLevel(
                state,
                elems.map((elem) => clone(elem)),
                checkSystemState,
                nodeIdx,
                elemIdx + 1,
            );
        }

        const hardwareRecoveryCounts =
            StateChangeKind.Hardware in elems[elemIdx]!.recoveryCounts
                ? (elems[elemIdx]!.recoveryCounts as RecoveryCounts)[
                    StateChangeKind.Hardware
                ]
                : undefined;
        const hardwareState =
            StateChangeKind.Hardware in elems[elemIdx]!.recoveryStates
                ? (elems[elemIdx]!.recoveryStates as RecoveryStates)[
                    StateChangeKind.Hardware
                ]
                : undefined;
        const softwareRecoveryCounts =
            StateChangeKind.Software in elems[elemIdx]!.recoveryCounts
                ? (elems[elemIdx]!.recoveryCounts as RecoveryCounts)[
                    StateChangeKind.Software
                ]
                : undefined;
        const softwareState =
            StateChangeKind.Software in elems[elemIdx]!.recoveryStates
                ? (elems[elemIdx]!.recoveryStates as RecoveryStates)[
                    StateChangeKind.Software
                ]
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

                if (
                    StateChangeKind.Hardware in
                        hwFailureBranchElems[elemIdx]!.recoveryStates
                ) {
                    const changeKind = tryFailForKind(
                        (hwFailureBranchElems[elemIdx]!
                            .recoveryStates as RecoveryStates)[
                                StateChangeKind.Hardware
                            ],
                        StateChangeKind.Hardware,
                    );

                    if (changeKind !== undefined) {
                        saveNewNode(
                            state,
                            hwFailureBranchElems,
                            checkSystemState,
                            nodeIdx,
                            changeKind,
                        );

                        processElementsLevel(
                            state,
                            hwFailureBranchElems,
                            checkSystemState,
                            nodeIdx,
                            elemIdx,
                        );
                    }
                }

                if (
                    StateChangeKind.Software in
                        swFailureBranchElems[elemIdx]!.recoveryStates
                ) {
                    const changeKind = tryFailForKind(
                        (swFailureBranchElems[elemIdx]!
                            .recoveryStates as RecoveryStates)[
                                StateChangeKind.Software
                            ],
                        StateChangeKind.Software,
                    );

                    if (changeKind !== undefined) {
                        saveNewNode(
                            state,
                            swFailureBranchElems,
                            checkSystemState,
                            nodeIdx,
                            changeKind,
                        );

                        processElementsLevel(
                            state,
                            swFailureBranchElems,
                            checkSystemState,
                            nodeIdx,
                            elemIdx,
                        );
                    }
                }
            } else if (!hardwareState.isActive) {
                tryIncrementResult = tryRecoverForKind(
                    hardwareState,
                    hardwareRecoveryCounts,
                    StateChangeKind.Hardware,
                );
            } else if (!softwareState.isActive) {
                tryIncrementResult = tryRecoverForKind(
                    softwareState,
                    softwareRecoveryCounts,
                    StateChangeKind.Software,
                );
            }
        } else if (
            hardwareState !== undefined && hardwareRecoveryCounts !== undefined
        ) {
            tryIncrementResult = tryIncrementForKind(
                hardwareState,
                hardwareRecoveryCounts,
                StateChangeKind.Hardware,
            );
        } else if (
            softwareState !== undefined && softwareRecoveryCounts !== undefined
        ) {
            tryIncrementResult = tryIncrementForKind(
                softwareState,
                softwareRecoveryCounts,
                StateChangeKind.Software,
            );
        }

        if (tryIncrementResult === undefined) {
            break;
        } else {
            saveNewNode(
                state,
                elems,
                checkSystemState,
                nodeIdx,
                tryIncrementResult,
            );
        }
    }
}

function saveNewNode(
    state: StateNetwork,
    elems: StatefullSystemElementNode[],
    checkSystemState: CheckSystemState,
    nodeIdx: Index,
    changeKind: IncrementChangeKind,
) {
    const node = {
        name: `P${nodeIdx.value}`,
        state: checkSystemState(elems),
        elementsStates: elems.map((elem) => clone(elem)),
        changeKind: changeKind,
    } satisfies NetworkNode;

    state.nodes.push(node);
    nodeIdx.value += 1;
}

//function tryIncrementElement(elem: StatefullSystemElementNode): IncrementChangeKind | undefined {
//	const hardwareRecoveryCounts =
//		StateChangeKind.Hardware in elem.recoveryCounts
//			? elem.recoveryCounts[StateChangeKind.Hardware]
//			: undefined;
//	const hardwareState =
//		StateChangeKind.Hardware in elem.recoveryStates
//			? elem.recoveryStates[StateChangeKind.Hardware]
//			: undefined;
//
//	const softwareRecoveryCounts =
//		StateChangeKind.Software in elem.recoveryCounts
//			? elem.recoveryCounts[StateChangeKind.Software]
//			: undefined;
//	const softwareState =
//		StateChangeKind.Software in elem.recoveryStates
//			? elem.recoveryStates[StateChangeKind.Software]
//			: undefined;
//
//	if (
//		hardwareState !== undefined &&
//		hardwareRecoveryCounts !== undefined &&
//		softwareState !== undefined &&
//		softwareRecoveryCounts !== undefined
//	) {
//		if (hardwareState.isActive && softwareState.isActive) {
//			const hardwareIncrement = tryIncrementForKind(
//				hardwareState,
//				hardwareRecoveryCounts,
//				StateChangeKind.Hardware
//			);
//
//			if (hardwareIncrement !== undefined) {
//				return hardwareIncrement;
//			} else {
//				// TODO: add further steps
//				return undefined;
//			}
//		} else if (!hardwareState.isActive) {
//			return tryRecoverForKind(hardwareState, hardwareRecoveryCounts, StateChangeKind.Hardware);
//		} else if (!softwareState.isActive) {
//			return tryRecoverForKind(softwareState, softwareRecoveryCounts, StateChangeKind.Software);
//		}
//	} else if (hardwareState !== undefined && hardwareRecoveryCounts !== undefined) {
//		return tryIncrementForKind(hardwareState, hardwareRecoveryCounts, StateChangeKind.Hardware);
//	} else if (softwareState !== undefined && softwareRecoveryCounts !== undefined) {
//		return tryIncrementForKind(softwareState, softwareRecoveryCounts, StateChangeKind.Software);
//	}
//
//	return undefined;
//}

function tryIncrementForKind(
    state: RecoveryState,
    recCount: number,
    kind: StateChangeKind,
): IncrementChangeKind | undefined {
    return tryFailForKind(state, kind) ||
        tryRecoverForKind(state, recCount, kind);
}

function tryFailForKind(
    state: RecoveryState,
    kind: StateChangeKind,
): IncrementChangeKind | undefined {
    if (state.isActive) {
        state.isActive = false;
        if (state.count !== Infinity) {
            return kind == StateChangeKind.Software
                ? IncrementFailureKind.Software
                : IncrementFailureKind.Hardware;
        } else {
            state.count = Infinity;
            return kind == StateChangeKind.Software
                ? IncrementFailureKind.SoftwareInfinite
                : IncrementFailureKind.HardwareInfinite;
        }
    }

    return undefined;
}

function tryRecoverForKind(
    state: RecoveryState,
    recCount: number,
    kind: StateChangeKind,
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

// --------------------------------
//function processElementsNew(
//	checkSystemState: CheckSystemState,
//	elems: StatefullSystemElementNode[]
//): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
//	const rootNode = {
//		name: uuidv4(),
//		state: checkSystemState(elems),
//		elementsStates: elems.map((elem) => clone(elem))
//	} satisfies NetworkNode;
//
//	const { nodes, edges } = processElementsLevel(checkSystemState, elems, rootNode, 0);
//	nodes.unshift(rootNode);
//
//	return { nodes: nodes, edges: edges };
//}
//
//function processElementsLevel(
//	checkSystemState: CheckSystemState,
//	elems: StatefullSystemElementNode[],
//	rootNode: NetworkNode,
//	elemIdx: number
//): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
//	const allNodes: NetworkNode[] = [];
//	const allEdges: NetworkEdge[] = [];
//	let lastNode = rootNode;
//
//	while (true) {
//		if (elemIdx + 1 < elems.length) {
//			const { nodes, edges } = processElementsLevel(
//				checkSystemState,
//				elems.map((elem) => clone<StatefullSystemElementNode>(elem)),
//				lastNode,
//				elemIdx + 1
//			);
//
//			allNodes.push(...nodes);
//			allEdges.push(...edges);
//		}
//
//		const incrementResult = tryIncrementElement(elems[elemIdx]!);
//
//		if (incrementResult === undefined) {
//			break;
//		}
//
//		const node = {
//			name: uuidv4(),
//			state: checkSystemState(elems),
//			elementsStates: elems.map((elem) => clone(elem))
//		} satisfies NetworkNode;
//
//		allNodes.push(node);
//		const changeKind =
//			incrementResult == IncrementFailureKind.Software ||
//			incrementResult == IncrementFailureKind.SoftwareInfinite ||
//			incrementResult == IncrementRecoveryKind.Software
//				? StateChangeKind.Software
//				: StateChangeKind.Hardware;
//		const changedElement: NetworkEdgeChangedElement = {
//			index: elemIdx,
//			changeKind: changeKind
//		};
//
//		allEdges.push({
//			kind: (incrementResult as IncrementRecoveryKind) ? EdgeKind.Recovery : EdgeKind.Failure,
//			sourceNode: rootNode,
//			targetNode: node,
//			changedElement: changedElement
//		} satisfies NetworkEdge);
//
//		if (
//			incrementResult == IncrementFailureKind.SoftwareInfinite ||
//			incrementResult == IncrementFailureKind.HardwareInfinite
//		) {
//			allEdges.push({
//				kind: EdgeKind.Recovery,
//				sourceNode: node,
//				targetNode: rootNode,
//				changedElement: changedElement
//			} satisfies NetworkEdge);
//		}
//		lastNode = node;
//	}
//
//	return { nodes: allNodes, edges: allEdges };
//}
// -----------------
//
//function increment(elem: StatefullSystemElementNode): IncrementChangeKind {
//    if (elem.state.isActive) {
//        elem.state.isActive = false;
//
//        if (canIncrementHardware(elem)) {
//            return StateChangeKind.Hardware;
//        }
//
//        //        return;
//    }
//
//    if (
//        elem.recoveryStates[StateChangeKind.Hardware] <
//            elem.recoveryCounts[StateChangeKind.Hardware] &&
//        elem.recoveryCounts[StateChangeKind.Hardware] != Infinity
//    ) {
//        elem.state.isActive = true;
//        elem.recoveryStates[StateChangeKind.Hardware] += 1;
//
//        return;
//    }
//
//    if (
//        elem.recoveryStates[StateChangeKind.Software] <
//            elem.recoveryCounts[StateChangeKind.Software] &&
//        elem.recoveryCounts[StateChangeKind.Software] != Infinity
//    ) {
//        elem.state.isActive = true;
//        elem.recoveryStates[StateChangeKind.Software] += 1;
//
//        return;
//    }
//}
//
//function canIncrement(elem: StatefullSystemElementNode): boolean {
//    return elem.state.isActive || canIncrementHardware(elem) ||
//        canIncrementSoftware(elem);
//}
//
//function canIncrementHardware(elem: StatefullSystemElementNode): boolean {
//    return StateChangeKind.Hardware in elem.recoveryStates &&
//        StateChangeKind.Hardware in elem.recoveryCounts &&
//        elem.recoveryStates[StateChangeKind.Hardware].count <
//            elem.recoveryCounts[StateChangeKind.Hardware].count &&
//        elem.recoveryCounts[StateChangeKind.Hardware].count !== Infinity;
//}
//
//function canIncrementSoftware(elem: StatefullSystemElementNode): boolean {
//    return StateChangeKind.Software in elem.recoveryStates &&
//        StateChangeKind.Software in elem.recoveryCounts &&
//        elem.recoveryStates[StateChangeKind.Software].count <
//            elem.recoveryCounts[StateChangeKind.Software].count &&
//        elem.recoveryCounts[StateChangeKind.Software].count !== Infinity;
//}

function edgesBetweenNodes(
    sourceNode: NetworkNode,
    targetNode: NetworkNode,
    elems: StatefullSystemElementNode[],
): NetworkEdge[] {
    const { isSingleFailure, infinitelyRecoverable, changedFailureElement } =
        isSingleFailureBetweenNodes(sourceNode, targetNode, elems);
    const { isSingleRecovery, changedRecoveryElement } =
        isSingleRecoveryBetweenNodes(
            sourceNode,
            targetNode,
        );

    if (isSingleFailure) {
        const edges: NetworkEdge[] = [];

        if (isSingleRecovery) {
            return edges;
        }

        edges.push(
            {
                kind: EdgeKind.Failure,
                sourceNode: sourceNode,
                targetNode: targetNode,
                changedElement: changedFailureElement!,
            } satisfies NetworkEdge,
        );

        if (infinitelyRecoverable) {
            edges.push(
                {
                    kind: EdgeKind.Recovery,
                    sourceNode: targetNode,
                    targetNode: sourceNode,
                    changedElement: changedFailureElement!,
                } satisfies NetworkEdge,
            );
        }

        return edges;
    }

    if (isSingleRecovery) {
        return [
            {
                kind: EdgeKind.Recovery,
                sourceNode: sourceNode,
                targetNode: targetNode,
                changedElement: changedRecoveryElement!,
            } satisfies NetworkEdge,
        ];
    }

    return [];
}

function isSingleFailureBetweenNodes(
    sourceNode: NetworkNode,
    targetNode: NetworkNode,
    elems: StatefullSystemElementNode[],
): {
    isSingleFailure: boolean;
    infinitelyRecoverable: boolean;
    changedFailureElement: NetworkEdgeChangedElement | undefined;
} {
    let isSingleCorrectChange: boolean | undefined = undefined;
    let isFailureInfinitelyRecoverable = false;
    let changedFailureElement: NetworkEdgeChangedElement | undefined =
        undefined;

    for (let i = 0; i < sourceNode.elementsStates.length; i++) {
        const sourceRecs = sourceNode.elementsStates[i]!.recoveryCounts;
        const targetRecs = targetNode.elementsStates[i]!.recoveryCounts;

        if (
            sourceNode.elementsStates[i]!.isActive &&
            !targetNode.elementsStates[i]!.isActive &&
            sourceRecs[StateChangeKind.Hardware] ==
                targetRecs[StateChangeKind.Hardware] &&
            sourceRecs[StateChangeKind.Software] ==
                targetRecs[StateChangeKind.Software]
        ) {
            if (isSingleCorrectChange == undefined) {
                // Incrementing algorithm always increments Hardware first.
                const changeKind = targetRecs[StateChangeKind.Hardware] ==
                        elems[i]!.recoveryCounts[StateChangeKind.Hardware]
                    ? StateChangeKind.Software
                    : StateChangeKind.Hardware;
                changedFailureElement = {
                    index: i,
                    changeKind: changeKind,
                };
                isSingleCorrectChange = true;
            } else {
                isSingleCorrectChange = false;
            }

            if (
                (targetRecs[StateChangeKind.Hardware] == Infinity &&
                    targetRecs[StateChangeKind.Software] ==
                        elems[i]!.recoveryCounts[StateChangeKind.Software]) ||
                (targetRecs[StateChangeKind.Software] == Infinity &&
                    targetRecs[StateChangeKind.Hardware] ==
                        elems[i]!.recoveryCounts[StateChangeKind.Hardware])
            ) {
                isFailureInfinitelyRecoverable = true;
            }
        } else if (
            sourceNode.elementsStates[i]!.isActive ==
                targetNode.elementsStates[i]!.isActive &&
            sourceRecs[StateChangeKind.Hardware] ==
                targetRecs[StateChangeKind.Hardware] &&
            sourceRecs[StateChangeKind.Software] ==
                targetRecs[StateChangeKind.Software]
        ) {
            continue;
        } else {
            isSingleCorrectChange = false;
        }

        if (isSingleCorrectChange == false) {
            return {
                isSingleFailure: false,
                infinitelyRecoverable: false,
                changedFailureElement: changedFailureElement,
            };
        }
    }

    return {
        isSingleFailure: isSingleCorrectChange == true,
        infinitelyRecoverable: isFailureInfinitelyRecoverable,
        changedFailureElement: changedFailureElement,
    };
}

function isSingleRecoveryBetweenNodes(
    sourceNode: NetworkNode,
    targetNode: NetworkNode,
): {
    isSingleRecovery: boolean;
    changedRecoveryElement: NetworkEdgeChangedElement | undefined;
} {
    let isSingleCorrectChange: boolean | undefined = undefined;
    let changedRecoveryElement: NetworkEdgeChangedElement | undefined =
        undefined;

    for (let i = 0; i < sourceNode.elementsStates.length; i++) {
        const sourceRecs = sourceNode.elementsStates[i]!.recoveryCounts;
        const targetRecs = targetNode.elementsStates[i]!.recoveryCounts;

        if (
            !sourceNode.elementsStates[i]!.isActive &&
            targetNode.elementsStates[i]!.isActive &&
            ((targetRecs[StateChangeKind.Hardware] -
                            sourceRecs[StateChangeKind.Hardware] == 1 &&
                targetRecs[StateChangeKind.Software] ==
                    sourceRecs[StateChangeKind.Software]) ||
                (targetRecs[StateChangeKind.Software] -
                                sourceRecs[StateChangeKind.Software] == 1 &&
                    targetRecs[StateChangeKind.Hardware] ==
                        sourceRecs[StateChangeKind.Hardware]))
        ) {
            if (isSingleCorrectChange == undefined) {
                const changeKind = targetRecs[StateChangeKind.Hardware] -
                            sourceRecs[StateChangeKind.Hardware] == 1
                    ? StateChangeKind.Hardware
                    : StateChangeKind.Software;
                changedRecoveryElement = {
                    index: i,
                    changeKind: changeKind,
                };
                isSingleCorrectChange = true;
            } else if (isSingleCorrectChange == true) {
                return {
                    isSingleRecovery: false,
                    changedRecoveryElement: changedRecoveryElement,
                };
            }
        } else if (
            sourceNode.elementsStates[i]!.isActive ==
                targetNode.elementsStates[i]!.isActive &&
            sourceRecs[StateChangeKind.Hardware] ==
                targetRecs[StateChangeKind.Hardware] &&
            sourceRecs[StateChangeKind.Software] ==
                targetRecs[StateChangeKind.Software]
        ) {
            continue;
        } else {
            isSingleCorrectChange = false;
        }

        if (isSingleCorrectChange == false) {
            return {
                isSingleRecovery: false,
                changedRecoveryElement: changedRecoveryElement,
            };
        }
    }

    return {
        isSingleRecovery: isSingleCorrectChange == true,
        changedRecoveryElement: changedRecoveryElement,
    };
}

export function isRecoveryStatesActive(
    recoveryStates: PartialRecoveryStates,
): boolean {
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
    recoveryStates: PartialRecoveryStates,
): boolean | undefined {
    const hardwareExists = StateChangeKind.Hardware in recoveryStates;

    if (hardwareExists) {
        return recoveryStates[StateChangeKind.Hardware].isActive;
    }

    return undefined;
}

export function isSoftwareRecoveryStatesActive(
    recoveryStates: PartialRecoveryStates,
): boolean | undefined {
    const softwareExists = StateChangeKind.Software in recoveryStates;

    if (softwareExists) {
        // Only Software exists, return true if active
        return recoveryStates[StateChangeKind.Software].isActive;
    }

    return undefined;
}
