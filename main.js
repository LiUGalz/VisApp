// Select the SVG container and define its dimensions
const svg = d3.select("#simulation-area");
const width = svg.attr("width");
const height = svg.attr("height");

// Default settings
let rows = parseInt(document.getElementById("rows").value, 10);
let cols = parseInt(document.getElementById("cols").value, 10);
let restoreForce = parseFloat(document.getElementById("restore-force").value);
let damping = parseFloat(document.getElementById("damping").value);


const nodeRadius = 5;
const timeStep = 0.016;
const padding = 50;

// Physical parameters:
const structuralRestLength = 50; // pixel equivalent of ℓ0 = 1 m
const structuralK = 20;          // stiffness
const structuralDamping = 0.1;   // damper

const shearRestLength = structuralRestLength * Math.sqrt(2);
const shearK = 7;
const shearDamping = 0.05;

const mass = 0.2;

let positions = [];
let velocities = [];
let forces = [];
let isRunning = false;
let prevPositions = []; // Task 4: Verlet integration requires prev. positions

/**
 * Initialize grid positions, velocities, and forces.
 */
function initializeGrid() {
    // Sets grid depending on task requirements
    const task = document.getElementById("task-select").value;

    if (task === "1") {
        rows = 1;
        cols = 2;
    } 
    else if (task === "2") {
        rows = 2;
        cols = 2;
    } 
    else if (task === "3") {
        rows = 2;
        cols = 2;
    }
    else if (task === "4") {
        rows = 3;
        cols = 3;
    }
    // Task 5 uses whatever rows/cols the user chooses


    positions = [];
    velocities = [];
    forces = [];
    const xStep = (cols > 1) ? (width - 2 * padding) / (cols - 1) : 0;
    const yStep = (rows > 1) ? (height - 2 * padding) / (rows - 1) : 0;


    for (let i = 0; i < rows; i++) {
        const posRow = [];
        const velRow = [];
        const forceRow = [];
        const yStart = height / 2 - (rows - 1) * yStep / 2;  // center vertically
        for (let j = 0; j < cols; j++) {
            posRow.push([
                padding + j * xStep,
                yStart + i * yStep
            ]);

            velRow.push([0, 0]);
            forceRow.push([0, 0]);
        }
        positions.push(posRow);
        velocities.push(velRow);
        forces.push(forceRow);
    }

    prevPositions = JSON.parse(JSON.stringify(positions));

    // Task 1: Create initial disturbance on right mass to start motion
    if (task === "1") {
    positions[0][1][0] += 20; // shift horizontally
    }
    // Task 2 initial disturbance
    if (task === "2") {
    positions[0][1][1] -= 30;  // move top-right mass upward
    }
    // Task 3: Move top-right mass slightly
    if (task === "3") {
    positions[0][1][1] -= 30;  // move slightly upward
    }
    // Task 4: Initial disturbance to start oscillation
    if (task === "4") {
    positions[1][1][1] -= 40;  // Lift the center mass
    }
    // Task 5: move some masses from their position at rest
    if (task === "5") {
    const midCol = Math.floor(cols / 2);
    positions[0][midCol][1] -= 40;  // lift the middle of the top row
    }

    drawNodes();
    drawEdges();
}

/**
 * Draw nodes in the simulation.
 */
function drawNodes() {
    const nodes = svg.selectAll("circle").data(positions.flat());

    nodes
        .enter()
        .append("circle")
        .attr("r", nodeRadius)
        .merge(nodes)
        .attr("cx", (d) => d[0])
        .attr("cy", (d) => d[1])
        .attr("fill", "blue")
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    nodes.exit().remove();
}

/**
 * Draw edges between the nodes.
 */
function drawEdges() {
    const edges = [];
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            if (j < cols - 1) edges.push([positions[i][j], positions[i][j + 1]]);
            if (i < rows - 1) edges.push([positions[i][j], positions[i + 1][j]]);
        }
    }

    // Task 3, 4, 5: Add shear springs (diagonals) 
    if (document.getElementById("task-select").value >= "3") {
    for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < cols - 1; j++) {
            // down-right diagonal
            edges.push([positions[i][j], positions[i + 1][j + 1]]);
            // up-right diagonal
            edges.push([positions[i + 1][j], positions[i][j + 1]]);
        }
    }
}


    const edgeLines = svg.selectAll("line").data(edges);

    edgeLines
        .enter()
        .append("line")
        .merge(edgeLines)
        .attr("x1", (d) => d[0][0])
        .attr("y1", (d) => d[0][1])
        .attr("x2", (d) => d[1][0])
        .attr("y2", (d) => d[1][1])
        .attr("stroke", "gray")
        .attr("stroke-width", 1);

    edgeLines.exit().remove();
}

function applySpring(i1, j1, i2, j2, L0, k, b) {
    // Part 1: Spring forces
    const p1 = positions[i1][j1];
    const p2 = positions[i2][j2];

    const v1 = velocities[i1][j1];
    const v2 = velocities[i2][j2];

    const dx = p2[0] - p1[0]; // Displacement in x  rp - rq (x)
    const dy = p2[1] - p1[1]; // Displacement in y  rp - rq (y)
    const dist = Math.sqrt(dx*dx + dy*dy); // Displacement/ length of spring L
    if (dist === 0) return;

    //normalize displacement vector
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Calculate the spring force
    const springFx = k * (dist-L0) * dirX;
    const springFy = k * (dist-L0) * dirY;

    // Part 2: Damping forces
    const relVelX = v2[0] - v1[0]; // Relative velocity vp - vq (x)
    const relVelY = v2[1] - v1[1]; // vp - vq (y)
    const relVelDotUnit= relVelX*dirX + relVelY*dirY; // Scalar projection
    const dampingFx = b * relVelDotUnit * dirX; 
    const dampingFy = b * relVelDotUnit * dirY;

    // Total Force
    const Fx = springFx + dampingFx;
    const Fy= springFy + dampingFy;

    // Apply opposite forces
    forces[i1][j1][0] += Fx / mass;
    forces[i1][j1][1] += Fy / mass;

    forces[i2][j2][0] -= Fx / mass;
    forces[i2][j2][1] -= Fy / mass;
}

/**
 * Calculate forces acting on each node.
 */
function calculateForces() {
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            forces[i][j][0] = 0;
            forces[i][j][1] = 0;
        }
    }

    const task = document.getElementById("task-select").value;
    // Structural springs (horizontal + vertical): For every node, connect it to the one on its right and below.
    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            if (j < cols - 1)
                applySpring(i, j, i, j + 1, structuralRestLength, structuralK, structuralDamping); // Right neighbor

            if (i < rows - 1)
                applySpring(i, j, i + 1, j, structuralRestLength, structuralK, structuralDamping); // Down neighbor
        }
    }

    if (task >= "3") {
        // Shear springs (added starting Task 3)
        for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < cols - 1; j++) {
                applySpring(i, j, i + 1, j + 1, shearRestLength, shearK, shearDamping); // diagonal down right
                applySpring(i + 1, j, i, j + 1, shearRestLength, shearK, shearDamping); // diagonal up right
            }
        }
    }
    
}

/**
 * Update positions and velocities of nodes.
 */
function updatePositions() {
    calculateForces();

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            velocities[i][j][0] += forces[i][j][0] * timeStep;
            velocities[i][j][1] += forces[i][j][1] * timeStep;
            positions[i][j][0] += velocities[i][j][0] * timeStep;
            positions[i][j][1] += velocities[i][j][1] * timeStep;
        }
    }

    drawNodes();
    drawEdges();
}

/**
 * Task 4: Verlet update function
 */
function updatePosVerlet(){

    calculateForces(); // To compute acceleration
    const h= timeStep; // Time step for integration

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            // Read current and previous positions
            const x = positions[i][j][0];
            const y = positions[i][j][1];

            const px = prevPositions[i][j][0];
            const py = prevPositions[i][j][1];

            // Read acceleration
            const ax = forces[i][j][0];
            const ay = forces[i][j][1];

            // Verlet:
            const newX = 2 * x - px + ax * h * h;
            const newY = 2 * y - py + ay * h * h;

            // Update prev → current
            prevPositions[i][j][0] = x;
            prevPositions[i][j][1] = y;

            // Update current → new
            positions[i][j][0] = newX;
            positions[i][j][1] = newY;

            // Compute velocities for visualization / compatibility
            velocities[i][j][0] = (newX - px) / (2 * h);
            velocities[i][j][1] = (newY - py) / (2 * h);


            // Enforce boundary conditions
            positions[i][j][0] = Math.max(padding, Math.min(width - padding, positions[i][j][0]));
            positions[i][j][1] = Math.max(padding, Math.min(height - padding, positions[i][j][1]));
        }
    }
    drawNodes();
    drawEdges();
}

/**
 * Main simulation loop.
 */
function simulationLoop() {
    if (!isRunning) return;
    const method = document.getElementById("method-select").value; // Task 4: Modify simulation to choose method
    if (method === "euler") {
        updatePositions();
    } else {
        updatePosVerlet();
    }
    requestAnimationFrame(simulationLoop);
}

// Event listeners for controls
document.getElementById("toggle-simulation").addEventListener("click", () => {
    isRunning = !isRunning;
    document.getElementById("toggle-simulation").innerText = isRunning ? "Stop Simulation" : "Start Simulation";
    if (isRunning) simulationLoop();
});

document.getElementById("rows").addEventListener("input", (e) => {
    if (document.getElementById("task-select").value !== "5") return;
    rows = parseInt(e.target.value, 10);
    initializeGrid();
});

document.getElementById("cols").addEventListener("input", (e) => {
    if (document.getElementById("task-select").value !== "5") return;
    cols = parseInt(e.target.value, 10);
    initializeGrid();
});

document.getElementById("restore-force").addEventListener("input", (e) => {
    restoreForce = parseFloat(e.target.value);
    document.getElementById("restore-force-value").textContent = restoreForce.toFixed(2);
});

document.getElementById("damping").addEventListener("input", (e) => {
    damping = parseFloat(e.target.value);
    document.getElementById("damping-value").textContent = damping.toFixed(2);
});


// Simulation resets whenever the user selects a task.
document.getElementById("task-select").addEventListener("change", initializeGrid);


// Initialize the grid
initializeGrid();
