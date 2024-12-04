type Token = string;

enum OperatorToken {
	And = "&",
	Or = "|"
}

enum GroupToken {
	Opening = "(",
	Closing = ")"
}

enum AstNodeKind {
	Operator = "operator",
	Operand = "operand"
}

type AstNode = {
	kind: AstNodeKind;
	value: string;
	left?: AstNode;
	right?: AstNode;
};

const precedence: Record<OperatorToken, number> = {
	[OperatorToken.Or]: 1,
	[OperatorToken.And]: 2
};

const operatorTokens = new Set(Object.values(OperatorToken));
const groupTokens = new Set(Object.values(GroupToken));

const isOperatorToken = (token: string): token is OperatorToken =>
	operatorTokens.has(token as OperatorToken);

const isGroupToken = (token: string): token is GroupToken => groupTokens.has(token as GroupToken);

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

function isLastIndex(index: number, arrayLike: ArrayLike<unknown>) {
	return index == arrayLike.length - 1;
}

function removeSpaces(string: string) {
	return string.replace(/\s+/g, "");
}

function tokenize(expression: string) {
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

const toPostfix = (tokens: Token[]): Token[] => {
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
};

const postfixToAst = (postfixTokens: Token[]) => {
	const stack: AstNode[] = [];

	for (const token of postfixTokens) {
		if (isOperatorToken(token)) {
			const right = stack.pop();
			const left = stack.pop();
			stack.push({ kind: AstNodeKind.Operator, value: token, left, right });
		} else {
			stack.push({ kind: AstNodeKind.Operand, value: token });
		}
	}

	const root = stack[0];

	if (root == null) throw new Error("Stack is empty. No root node is found.");

	return root;
};

export const parseToAst = (expression: string) => {
	return postfixToAst(toPostfix(tokenize(expression)));
};
