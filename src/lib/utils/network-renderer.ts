import * as d3 from "d3";
import type { StateNetwork } from "./network";

type Node = d3.SimulationNodeDatum & {
	id: string;
	state: string;
};

type SimulatedNode = Node & {
	x: number;
	y: number;
};

type Link = d3.SimulationLinkDatum<Node> & {
	kind: string;
};

export function renderNetwork(svgElement: SVGSVGElement, stateNetwork: StateNetwork) {
	d3.select(svgElement).selectAll("*").remove();

	const width = svgElement.clientWidth;
	const height = svgElement.clientHeight;

	const svg = d3
		.select(svgElement)
		.attr("viewBox", [-width / 2, -height / 2, width, height])
		.attr("width", width)
		.attr("height", height);

	const zoomContainer = svg.append("g").attr("class", "zoom-container");

	const nodes: Node[] = stateNetwork.nodes.map((node) => ({
		id: node.name,
		state: node.state
	}));

	const links: Link[] = stateNetwork.edges.map((edge) => ({
		source: edge.sourceNode.name,
		target: edge.targetNode.name,
		kind: edge.kind
	}));

	const kinds = Array.from(new Set(links.map((d) => d.kind)));
	const colors = d3.scaleOrdinal(kinds, d3.schemeCategory10);

	const zoom = d3
		.zoom<SVGSVGElement, unknown>()
		.scaleExtent([0.01, 10])
		.on("zoom", (event) => {
			zoomContainer.attr("transform", event.transform);
		});

	svg.call(zoom);

	const simulation = d3
		.forceSimulation(nodes)
		.force(
			"link",
			d3
				.forceLink<Node, Link>(links)
				.id((d) => d.id)
				.distance(() => 100)
		)
		.force("charge", d3.forceManyBody().strength(-5000))
		.force("center", d3.forceCenter(0, 0))
		.force("collide", d3.forceCollide().radius(100))
		.force("x", d3.forceX().strength(0.1))
		.force("y", d3.forceY().strength(0.1));

	zoomContainer
		.append("defs")
		.selectAll("marker")
		.data(kinds)
		.join("marker")
		.attr("id", (d) => `arrow-${d}`)
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 15)
		.attr("refY", -0.5)
		.attr("markerWidth", 6)
		.attr("markerHeight", 6)
		.attr("orient", "auto")
		.append("path")
		.attr("fill", colors)
		.attr("d", "M0, -5L10, 0L0, 5");

	const linkSelection = zoomContainer
		.append("g")
		.attr("fill", "none")
		.attr("stroke-width", 1.5)
		.selectAll("path")
		.data(links)
		.join("path")
		.attr("stroke", (d) => colors(d.kind))
		.attr("marker-end", (d) => `url(#arrow-${d.kind})`);

	const nodeSelection = zoomContainer
		.append("g")
		.attr("fill", "currentColor")
		.attr("stroke-linecap", "round")
		.attr("stroke-linejoin", "round")
		.selectAll<SVGGElement, Node>("g")
		.data(nodes)
		.join("g")
		.call(
			d3
				.drag<SVGGElement, Node>()
				.on("start", (event, d) => {
					if (!event.active) simulation.alphaTarget(0.3).restart();

					d.fx = d.x;
					d.fy = d.y;
				})
				.on("drag", (event, d) => {
					d.fx = event.x;
					d.fy = event.y;
				})
				.on("end", (event, d) => {
					if (!event.active) simulation.alphaTarget(0);

					d.fx = null;
					d.fy = null;
				})
		);

	nodeSelection.append("circle").attr("stroke", "white").attr("stroke-width", 1.5).attr("r", 4);

	nodeSelection
		.append("text")
		.attr("x", 8)
		.attr("y", "0.3em")
		.text((d) => `${d.id} (${d.state})`)
		.clone(true)
		.lower()
		.attr("fill", "none")
		.attr("stroke", "white")
		.attr("stroke-width", 3);

	simulation.on("tick", () => {
		linkSelection.attr("d", (d: Link) => {
			const target = d.target as SimulatedNode;
			const source = d.source as SimulatedNode;

			const r = Math.hypot(target.x - source.x, target.y - source.y);

			return `
				M${source.x}, ${source.y}
				A${r}, ${r} 0 0, 1 ${target.x}, ${target.y}
			`;
		});
		nodeSelection.attr("transform", (d) => `translate(${d.x}, ${d.y})`);
	});

	return svg.node();
}
