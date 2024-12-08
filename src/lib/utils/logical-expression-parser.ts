import type { SystemElementConfig } from "./network";

export type Token = string;

export enum OperatorToken {
	And = "&",
	Or = "|"
}

export enum GroupToken {
	Opening = "(",
	Closing = ")"
}

export enum AstNodeKind {
	Operator = "operator",
	Operand = "operand"
}

export type AstOperatorNode = {
	kind: AstNodeKind.Operator;
	value: string;
	left: AstNode;
	right: AstNode;
};

export type AstOperandNode = {
	kind: AstNodeKind.Operand;
	value: string;
};

export type AstNode = AstOperatorNode | AstOperandNode;

export type SystemElementNode = AstOperandNode & {
	name: string;
} & SystemElementConfig;

export type SystemConnectionNode = AstOperatorNode & {
	left: SystemNode;
	right: SystemNode;
};

export type SystemNode = SystemConnectionNode | SystemElementNode;

export function isValidSystemRootNode(node: SystemNode): node is SystemConnectionNode {
	return node.kind == AstNodeKind.Operator;
}

export function* astWalker(node: AstNode): Generator<AstNode> {
	if (node.kind == AstNodeKind.Operand) return yield node;

	yield* astWalker(node.left);
	yield* astWalker(node.right);
	yield node;
}

export function astNodeToSystemNode(
	astNode: AstNode,
	systemElementMap: Map<string, SystemElementConfig>
): SystemNode {
	if (astNode.kind == AstNodeKind.Operand) {
		const systemElementConfig = systemElementMap.get(astNode.value);

		if (systemElementConfig == null) {
			throw new Error(`System element "${astNode.value}" not found.`);
		}

		return {
			...astNode,
			name: astNode.value,
			...systemElementConfig
		} satisfies SystemElementNode;
	}

	return {
		...astNode,
		left: astNodeToSystemNode(astNode.left, systemElementMap),
		right: astNodeToSystemNode(astNode.right, systemElementMap)
	} satisfies SystemConnectionNode;
}

const precedence: Record<OperatorToken, number> = {
	[OperatorToken.Or]: 1,
	[OperatorToken.And]: 2
};

const operatorTokens = new Set(Object.values(OperatorToken));
const groupTokens = new Set(Object.values(GroupToken));

export const isOperatorToken = (token: string): token is OperatorToken =>
	operatorTokens.has(token as OperatorToken);

export const isGroupToken = (token: string): token is GroupToken =>
	groupTokens.has(token as GroupToken);

export function isOperandToken(token: string) {
	return !isOperatorToken(token) && !isGroupToken(token);
}

class TokenBuilder {
	#initialValue = "";
	#accumulator = this.#initialValue;

	append(char: string) {
		this.#accumulator += char;

		return this;
	}

	build() {
		const value = this.#accumulator;
		this.#accumulator = this.#initialValue;

		return value;
	}

	get value() {
		return this.#accumulator;
	}

	get isEmpty() {
		return this.#accumulator == this.#initialValue;
	}
}

export function isLastIndex(index: number, arrayLike: ArrayLike<unknown>) {
	return index == arrayLike.length - 1;
}

export function removeSpaces(string: string) {
	return string.replace(/\s+/g, "");
}

export function tokenize(expression: string) {
	const tokenBuilder = new TokenBuilder();

	return [...removeSpaces(expression)].reduce((tokens, char, index, chars) => {
		if (isGroupToken(char) || isOperatorToken(char)) {
			return tokenBuilder.isEmpty ? [...tokens, char] : [...tokens, tokenBuilder.build(), char];
		}

		tokenBuilder.append(char);

		if (isLastIndex(index, chars) && !tokenBuilder.isEmpty) {
			return [...tokens, tokenBuilder.build()];
		}

		return tokens;
	}, [] as Token[]);
}

export function toPostfix(tokens: Token[]) {
	const output = [] as Token[];
	const operators = [] as Token[];

	for (const token of tokens) {
		if (isOperatorToken(token)) {
			while (
				operators.length &&
				isOperatorToken(operators.at(-1) as OperatorToken) &&
				precedence[token] <= precedence[operators.at(-1) as OperatorToken]
			) {
				output.push(operators.pop()!);
			}
			operators.push(token);
		} else if (token == GroupToken.Opening) {
			operators.push(token);
		} else if (token == GroupToken.Closing) {
			while (operators.length && operators.at(-1) != GroupToken.Opening) {
				output.push(operators.pop()!);
			}
			operators.pop();
		} else {
			output.push(token);
		}
	}

	while (operators.length) {
		output.push(operators.pop()!);
	}

	return output;
}

export function postfixToAst(postfixTokens: Token[]) {
	const stack: AstNode[] = [];

	for (const token of postfixTokens) {
		if (isOperatorToken(token)) {
			const right = stack.pop();
			const left = stack.pop();

			if (left == null || right == null) {
				throw new Error("Invalid postfix expression.");
			}

			stack.push({ kind: AstNodeKind.Operator, value: token, left, right });
		} else {
			stack.push({ kind: AstNodeKind.Operand, value: token });
		}
	}

	const root = stack[0];

	if (root == null) throw new Error("Stack is empty. No root node is found.");

	return root;
}

export function getElementNamesFromTokens(tokens: Token[]) {
	return tokens.filter((token) => !isOperatorToken(token) && !isGroupToken(token));
}
