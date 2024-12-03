type Token = string;

type Operator = "&" | "|";

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

const precedence: Record<Operator, number> = {
	"|": 1,
	"&": 2
};

const binaryOperators = new Set(["|", "&"]);

const isOperator = (token: string): token is Operator => binaryOperators.has(token);

const tokenize = (expression: string) => {
	const tokens = [] as Token[];
	let current = "";

	for (const char of expression.replace(/\s+/g, "")) {
		if (char === "(" || char === ")") {
			if (current) {
				tokens.push(current);
				current = "";
			}
			tokens.push(char);
		} else if (isOperator(char)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			tokens.push(char);
		} else {
			current += char;
		}
	}

	if (current) tokens.push(current);

	return tokens;
};

const toPostfix = (tokens: Token[]): Token[] => {
	const output: Token[] = [];
	const operators: Token[] = [];

	for (const token of tokens) {
		if (isOperator(token)) {
			while (
				operators.length &&
				isOperator(operators.at(-1) as Operator) &&
				precedence[token] <= precedence[operators.at(-1) as Operator]
			) {
				output.push(operators.pop()!);
			}
			operators.push(token);
		} else if (token === "(") {
			operators.push(token);
		} else if (token === ")") {
			while (operators.length && operators[operators.length - 1] !== "(") {
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

const postfixToAst = (postfixTokens: Token[]): AstNode => {
	const stack: AstNode[] = [];

	for (const token of postfixTokens) {
		if (isOperator(token)) {
			const right = stack.pop()!;
			const left = stack.pop()!;
			stack.push({ kind: AstNodeKind.Operator, value: token, left, right });
		} else {
			stack.push({ kind: AstNodeKind.Operand, value: token });
		}
	}

	return stack[0]!;
};

export const parseToAst = (expression: string): AstNode => {
	const tokens = tokenize(expression);
	const postfix = toPostfix(tokens);

	return postfixToAst(postfix);
};
