<script lang="ts">
	import {
		getElementNamesFromTokens,
		isGroupToken,
		isOperatorToken,
		postfixToAst,
		removeSpaces,
		tokenize,
		toPostfix
	} from "$lib/utils";

	let expression = $state("(a | b) & c");
	const ast = $derived.by(() => {
		try {
			const operands = tokenize(expression).filter(
				(token) => !isGroupToken(token) && !isOperatorToken(token)
			);

			const operandsAreUnique = operands.length == new Set(operands).size;
			const operandsAreAlphanumeric = operands.every((operand) => /^[a-zA-Z0-9]+$/.test(operand));

			if (!operandsAreUnique || !operandsAreAlphanumeric) return null;

			return postfixToAst(toPostfix([...removeSpaces(expression)]));
		} catch (error) {
			console.log(error);
		}
	});
	let expressionIsValid = $derived(ast != null);
</script>

<section class="flex w-full flex-col items-center gap-2 p-6">
	<input
		bind:value={expression}
		type="text"
		class:bg-red-100={!expressionIsValid}
		class="w-2/3 border-b border-b-neutral-400 py-1 text-center"
		placeholder="logical expression, e.g. (a | b) & c"
	/>
	<form class="w-4/12 min-w-96 flex-col">
		{#snippet recoverySelect(selectName: string)}
			<select name={selectName} class="py-1">
				{#each [...Array(4).keys(), Infinity] as number}
					<option value={number}>{number}</option>
				{/each}
			</select>
		{/snippet}
		<table class="w-full">
			<thead>
				<tr>
					{#each ["Element", "Software Recoveries", "Hardware Recoveries"] as header, index}
						<th class="text-start text-xs" {...index == 0 && { style: "width: 25%" }}>{header}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each getElementNamesFromTokens(tokenize(expression)) as elementName}
					<tr>
						<td class="py-1">{elementName}</td>
						<td>
							{@render recoverySelect("software-recoveries")}
						</td>
						<td>
							{@render recoverySelect("hardware-recoveries")}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</form>
</section>
