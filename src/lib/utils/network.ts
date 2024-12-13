import {
    AstNodeKind,
    astWalker,
    type SystemConnectionNode,
    type SystemElementNode,
    type SystemNode,
} from "./logical-expression-parser";
import cloneDeep from "lodash/cloneDeep";

export enum RecoveryKind {
    Software = "software",
    Hardware = "hardware",
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

export type StatefullSystemElementNode = SystemElementNode & {
    state: ElementState;
};

export enum NetworkNodeState {
    Active = "active",
    Recovery = "recovery",
    Terminal = "terminal",
}

export type NetworkNode = {
    name: string;
    state: NetworkNodeState;
    elementsStates: ElementState[];
};

export enum EdgeKind {
    Failure = "failure",
    Recovery = "recovery",
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
                state: {
                    recoveryCounts: {
                        software: (node as SystemElementNode).recoveryCounts.software == Infinity ? Infinity : 0,
                        hardware: (node as SystemElementNode).recoveryCounts.hardware == Infinity ? Infinity : 0,
                    },
                    isActive: true,
                },
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
        { value: 0 } satisfies Index,
        0,
    );

    for (let i = 0; i < systemState.nodes.length - 1; i++) {
        for (let j = i + 1; j < systemState.nodes.length; j++) {
            const newEdges = edgesBetweenNodes(systemState.nodes[i]!, systemState.nodes[j]!, elementsState);
            systemState.edges.push(...newEdges);
        }
    }

    console.log(systemState);

    const stateCount = {
        [NetworkNodeState.Active]: 0,
        [NetworkNodeState.Recovery]: 0,
        [NetworkNodeState.Terminal]: 0,
    };

    // Iterate over the nodes and count the occurrences of each state
    for (const node of systemState.nodes) {
        stateCount[node.state] += 1;
    }

    console.log(stateCount);

    return systemState satisfies StateNetwork;
}

function getSystemStateFromNode(
    node: SystemNode,
    elems: StatefullSystemElementNode[],
): NetworkNodeState {
    if (node.kind == AstNodeKind.Operand) {
        const elem = elems.find((elem) => elem.name == node.name);

        if (elem) {
            if (elem.state.isActive) {
                return NetworkNodeState.Active;
            } else if (
                elem.state.recoveryCounts[RecoveryKind.Hardware] <
                elem.recoveryCounts[RecoveryKind.Hardware] ||
                elem.state.recoveryCounts[RecoveryKind.Hardware] == Infinity
                ||
                elem.state.recoveryCounts[RecoveryKind.Software] <
                elem.recoveryCounts[RecoveryKind.Software] ||
                elem.state.recoveryCounts[RecoveryKind.Software] == Infinity
            ) {
                return NetworkNodeState.Recovery;
            } else {
                return NetworkNodeState.Terminal;
            }
        } else {
            console.error(`Expected to find element for node: ${node}`);
        }
    }

    const leftState = getSystemStateFromNode(
        (node as SystemConnectionNode).left,
        elems,
    );
    const rightState = getSystemStateFromNode(
        (node as SystemConnectionNode).right,
        elems,
    );

    if (node.value == "&") {
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

    if (node.value == "|") {
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
    nodeIdx: Index,
    elemIdx: number,
) {
    while (true) {
        if ((elemIdx + 1) < elems.length) {
            processElements(
                state,
                elems.map((elem) => cloneDeep(elem)),
                checkSystemState,
                nodeIdx,
                elemIdx + 1,
            );
        } else {
            const node = {
                name: `P${nodeIdx.value}`,
                state: checkSystemState(elems),
                elementsStates: elems.map((elem) =>
                    structuredClone(elem.state)
                ),
            } satisfies NetworkNode;

            state.nodes.push(node);
            nodeIdx.value += 1;
        }

        if (canIncrement(elems[elemIdx]!)) {
            increment(elems[elemIdx]!);
        } else {
            break;
        }
    }
}

function increment(elem: StatefullSystemElementNode) {
    if (elem.state.isActive) {
        elem.state.isActive = false;
        return;
    }

    if (
        elem.state.recoveryCounts[RecoveryKind.Hardware] <
        elem.recoveryCounts[RecoveryKind.Hardware] &&
        elem.recoveryCounts[RecoveryKind.Hardware] != Infinity
    ) {
        elem.state.isActive = true;
        elem.state.recoveryCounts[RecoveryKind.Hardware] += 1;
        return;
    }

    if (
        elem.state.recoveryCounts[RecoveryKind.Software] <
        elem.recoveryCounts[RecoveryKind.Software] &&
        elem.recoveryCounts[RecoveryKind.Software] != Infinity
    ) {
        elem.state.isActive = true;
        elem.state.recoveryCounts[RecoveryKind.Software] += 1;
        return;
    }
}

function canIncrement(elem: StatefullSystemElementNode): boolean {
    if (elem.state.isActive) {
        return true;
    }

    if (
        elem.state.recoveryCounts[RecoveryKind.Hardware] <
        elem.recoveryCounts[RecoveryKind.Hardware] &&
        elem.recoveryCounts[RecoveryKind.Hardware] != Infinity
    ) {
        return true;
    }

    if (
        elem.state.recoveryCounts[RecoveryKind.Software] <
        elem.recoveryCounts[RecoveryKind.Software] &&
        elem.recoveryCounts[RecoveryKind.Software] != Infinity
    ) {
        return true;
    }

    return false;
}

function edgesBetweenNodes(sourceNode: NetworkNode, targetNode: NetworkNode, elems: StatefullSystemElementNode[]): NetworkEdge[] {
    const { isSingleFailure, infinitelyRecoverable } = isSingleFailureBetweenNodes(sourceNode, targetNode, elems);
    const isSingleRecovery = isSingleRecoveryBetweenNodes(sourceNode, targetNode);

    if (isSingleFailure) {
        let edges: NetworkEdge[] = [];
        if (isSingleRecovery) {
            return edges;
        }

        edges.push({ kind: EdgeKind.Failure, sourceNode: sourceNode, targetNode: targetNode } satisfies NetworkEdge);

        if (infinitelyRecoverable) {
            edges.push({ kind: EdgeKind.Recovery, sourceNode: targetNode, targetNode: sourceNode } satisfies NetworkEdge);
        }

        return edges;
    }

    if (isSingleRecovery) {
        return [{ kind: EdgeKind.Recovery, sourceNode: sourceNode, targetNode: targetNode } satisfies NetworkEdge];
    }

    return [];
}

function isSingleFailureBetweenNodes(sourceNode: NetworkNode, targetNode: NetworkNode, elems: StatefullSystemElementNode[]): { isSingleFailure: boolean, infinitelyRecoverable: boolean } {
    let isSingleCorrectChange: boolean | undefined = undefined;
    let isFailureInfinitelyRecoverable = false;

    for (let i = 0; i < sourceNode.elementsStates.length; i++) {
        let sourceRecs = sourceNode.elementsStates[i]!.recoveryCounts;
        let targetRecs = targetNode.elementsStates[i]!.recoveryCounts;

        if (sourceNode.elementsStates[i]!.isActive && !targetNode.elementsStates[i]!.isActive &&
            (sourceRecs[RecoveryKind.Hardware] == targetRecs[RecoveryKind.Hardware] &&
                sourceRecs[RecoveryKind.Software] == targetRecs[RecoveryKind.Software])
        ) {
            if (isSingleCorrectChange == undefined) {
                isSingleCorrectChange = true;
            } else {
                isSingleCorrectChange = false;
            }

            if ((targetRecs[RecoveryKind.Hardware] == Infinity && targetRecs[RecoveryKind.Software] == elems[i]!.recoveryCounts[RecoveryKind.Software]) ||
                (targetRecs[RecoveryKind.Software] == Infinity && targetRecs[RecoveryKind.Hardware] == elems[i]!.recoveryCounts[RecoveryKind.Hardware])) {
                isFailureInfinitelyRecoverable = true;
            }
        } else if (sourceNode.elementsStates[i]!.isActive == targetNode.elementsStates[i]!.isActive &&
            (sourceRecs[RecoveryKind.Hardware] == targetRecs[RecoveryKind.Hardware] &&
                sourceRecs[RecoveryKind.Software] == targetRecs[RecoveryKind.Software])
        ) {
            continue;
        } else {
            isSingleCorrectChange = false;
        }

        if (isSingleCorrectChange == false) {
            return { isSingleFailure: false, infinitelyRecoverable: false };
        }
    }

    return { isSingleFailure: (isSingleCorrectChange == true), infinitelyRecoverable: isFailureInfinitelyRecoverable };
}

function isSingleRecoveryBetweenNodes(sourceNode: NetworkNode, targetNode: NetworkNode): boolean {
    let isSingleCorrectChange: boolean | undefined = undefined;

    for (let i = 0; i < sourceNode.elementsStates.length; i++) {
        let sourceRecs = sourceNode.elementsStates[i]!.recoveryCounts;
        let targetRecs = targetNode.elementsStates[i]!.recoveryCounts;

        if (!sourceNode.elementsStates[i]!.isActive && targetNode.elementsStates[i]!.isActive &&
            (((targetRecs[RecoveryKind.Hardware] - sourceRecs[RecoveryKind.Hardware] == 1) &&
                targetRecs[RecoveryKind.Software] == sourceRecs[RecoveryKind.Software]
            ) ||
                ((targetRecs[RecoveryKind.Software] - sourceRecs[RecoveryKind.Software] == 1) &&
                    targetRecs[RecoveryKind.Hardware] == sourceRecs[RecoveryKind.Hardware])
            )

        ) {
            if (isSingleCorrectChange == undefined) {
                isSingleCorrectChange = true;
            } else if (isSingleCorrectChange == true) {
                return false;
            }
        } else if (sourceNode.elementsStates[i]!.isActive == targetNode.elementsStates[i]!.isActive &&
            (sourceRecs[RecoveryKind.Hardware] == targetRecs[RecoveryKind.Hardware] &&
                sourceRecs[RecoveryKind.Software] == targetRecs[RecoveryKind.Software])
        ) {
            continue;
        } else {
            isSingleCorrectChange = false;
        }

        if (isSingleCorrectChange == false) {
            return false;
        }
    }

    return isSingleCorrectChange == true;
}
