// Select the SVG container and define its dimensions
const svg = d3.select("#simulation-area"); // Reads the width of the SVG so particles can be positioned correctly (Task 1–5)
const width = svg.attr("width"); // Reads the width of the SVG so particles can be positioned correctly (Task 1–5)
const height = svg.attr("height"); // Reads the height of the SVG to keep the simulation within screen bounds (Task 1–5)

// Default settings
let rows = parseInt(document.getElementById("rows").value, 10); // Number of rows in the mass grid
let cols = parseInt(document.getElementById("cols").value, 10); // Number of columns in the mass grid
let restoreForce = parseFloat(document.getElementById("restore-force").value); // Reads the restoring force strength that affects the spring behavior
let damping = parseFloat(document.getElementById("damping").value); // Reads the global damping value that slows down the motion

const nodeRadius = 15; // Radius of each mass point in pixels
const timeStep = 0.016; // Time step h used for numerical integration (~60 FPS), used in Euler
const padding = 50; // Margin from the SVG edges so the grid is not drawn directly at the border

// Physical parameters:
const structuralRestLength = 50; // pixel equivalent of ℓ0 = 1 m
const structuralK = 20; // stiffness
const structuralDamping = 0.1; // damper

const shearRestLength = structuralRestLength * Math.sqrt(2); // Rest length of diagonal (shear) springs ℓ₀ = √2 (Task 3–5)
const shearK = 7; // Stiffness coefficient for diagonal (shear) springs (Task 3–5)
const shearDamping = 0.05; // Damping coefficient for diagonal (shear) springs (Task 3–5)

const mass = 0.2; // Mass of each particle, used in Newton's second law F = m·a (Task 1–5)

let positions = []; // Stores the positions (x, y) of all particles (Task 1–5)
let velocities = []; // Stores the velocities of all particles, required for Euler integration (Task 1–3)
let forces = []; // Stores the total force acting on each particle before computing acceleration (Task 1–5)
let isRunning = false; // Controls whether the simulation is currently running or paused (Task 1–5, UI control)
let prevPositions = []; // Task 4: Verlet integration requires prev. positions

/**
 * Initialize grid positions, velocities, and forces.
 */
function initializeGrid() {
  // Sets grid depending on task requirements
  const task = document.getElementById("task-select").value;

  if (task === "1") {
    rows = 1; // Task 1: Only one row (two masses in a line)
    cols = 2; // Task 1: Two columns → exactly 2 masses
  } else if (task === "2") {
    rows = 2; // Task 2: Two rows
    cols = 2; // Task 2: Two columns → 4 masses total (2x2 grid)
  } else if (task === "3") {
    rows = 2; // Task 3: Same grid as Task 2
    cols = 2; // Task 3: Four masses, but now with shear springs added later
  } else if (task === "4") {
    rows = 3; // Task 4: Three rows
    cols = 3; // Task 4: Three columns → 9 masses (3x3 grid)
  }
  // Task 5 uses whatever rows/cols the user chooses

  positions = []; // Clears all particle positions from any previous simulation
  velocities = []; // Clears all particle velocities so simulation starts from rest
  forces = []; // Clears all force accumulators for each particle
  const xStep = cols > 1 ? (width - 2 * padding) / (cols - 1) : 0; // Horizontal distance between particles in the grid (spacing in x-direction)
  const yStep = rows > 1 ? (height - 2 * padding) / (rows - 1) : 0; // Vertical distance between particles in the grid (spacing in y-direction)

  // Loops over all rows of particles
  for (let i = 0; i < rows; i++) {
    const posRow = []; // Temporary array to store positions for one row
    const velRow = []; // Temporary array to store velocities for one row
    const forceRow = []; // Temporary array to store forces for one row
    const yStart = height / 2 - ((rows - 1) * yStep) / 2; // center vertically

    // Loops over all columns of particles in the current row
    for (let j = 0; j < cols; j++) {
      posRow.push([padding + j * xStep, yStart + i * yStep]); // Stores the initial position [x, y] for each mass in the grid
      velRow.push([0, 0]); // Sets initial velocity to zero for each mass (system starts at rest)
      forceRow.push([0, 0]); // Initializes force to zero for each mass before simulation starts
    }
    positions.push(posRow); // Adds this row of positions to the full 2D grid
    velocities.push(velRow); // Adds this row of velocities to the full 2D grid
    forces.push(forceRow); // Adds this row of forces to the full 2D grid
  }

  // Deep copy of initial positions for Verlet integration (required for Task 4–5)
  prevPositions = JSON.parse(JSON.stringify(positions));

  // Task 1: Create initial disturbance on right mass to start motion
  if (task === "1") {
    positions[0][1][0] += 20; // shift horizontally
    // Moves the right mass horizontally to start oscillation (2-mass system)
  }
  // Task 2 initial disturbance
  if (task === "2") {
    positions[0][1][1] -= 30; // move top-right mass upward
    // Moves the top-right mass upward to start oscillation (4-mass system)
  }
  // Task 3: Move top-right mass slightly
  if (task === "3") {
    positions[0][1][1] -= 30; // move slightly upward
    // Same disturbance as Task 2, but now shear springs will affect motion
  }
  // Task 4: Initial disturbance to start oscillation
  if (task === "4") {
    positions[1][1][1] -= 40; // Lift the center mass
    // Lifts the center mass in the 3x3 grid to excite the system (Verlet used)
  }
  // Task 5: move some masses from their position at rest
  if (task === "5") {
    const midCol = Math.floor(cols / 2); // Finds the middle column of the cloth
    positions[0][midCol][1] -= 40; // Lifts the middle mass of the top row to create a cloth-like wave
  }

  drawNodes(); // Draws all masses (circles) in the SVG
  drawEdges(); // Draws all springs (lines) between masses
}

/**
 * Draw nodes in the simulation.
 */
function drawNodes() {
  const nodes = svg.selectAll("circle").data(positions.flat());
  // Selects all existing circles and binds them to the flattened 2D positions array
  // .flat() converts the 2D grid into a 1D array for D3 data binding
  nodes
    .enter() // Selects data elements that do not yet have corresponding SVG circles
    .append("circle") // Creates a new circle for each new mass that does not exist yet
    .attr("r", nodeRadius) // Sets the radius of each mass point (visual only)
    .merge(nodes) // Merges new and existing circles so both get updated together
    .call(drag) // Attaches drag behavior to each node
    .attr("cx", (d) => d[0]) // Sets the x-position of each circle based on particle position x
    .attr("cy", (d) => d[1]) // Sets the y-position of each circle based on particle position y
    .attr("fill", "blue") // Sets the fill color of each mass point (visual styling only)
    .attr("stroke", "lightblue") // Adds a white outline to each mass point for better visibility
    .attr("stroke-width", 3); // Sets the thickness of the circle outline

  nodes.exit().remove(); // Removes any circles that no longer have corresponding data
}

const drag = d3
  .drag()
  .on("start", function (event, d) {
    // No stopping of the simulation — it continues while dragging ✅
  })

  .on("drag", function (event, d) {
    d[0] = event.x;
    d[1] = event.y;
    // Directly update the position of the dragged node

    // IMPORTANT: Reset velocity so the node does not "explode" after release
    d[0] = Math.max(padding, Math.min(width - padding, d[0]));
    d[1] = Math.max(padding, Math.min(height - padding, d[1]));

    // If using Verlet, we must also update prevPositions
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (positions[i][j] === d) {
          prevPositions[i][j][0] = d[0];
          prevPositions[i][j][1] = d[1];
        }
      }
    }

    drawNodes();
    drawEdges();
  });

/**
 * Draw edges between the nodes.
 */
function drawEdges() {
  const edges = []; // Temporary array that will store all spring connections as pairs of positions
  for (let i = 0; i < rows; i++) {
    // Loops through all rows of the grid (Task 1–5)
    for (let j = 0; j < cols; j++) {
      // Loops through all columns of the grid (Task 1–5)
      if (j < cols - 1) edges.push([positions[i][j], positions[i][j + 1]]); // Adds a horizontal structural spring to the right neighbor
      if (i < rows - 1) edges.push([positions[i][j], positions[i + 1][j]]); // Adds a vertical structural spring to the neighbor below
    }
  }

  // Task 3, 4, 5: Add shear springs (diagonals)
  if (document.getElementById("task-select").value >= "3") {
    // Checks if the selected task is 3 or higher, where diagonal (shear) springs are required
    for (let i = 0; i < rows - 1; i++) {
      // Loops through all rows except the last (needed for diagonals)

      for (let j = 0; j < cols - 1; j++) {
        // Loops through all columns except the last (needed for diagonals)

        // down-right diagonal
        edges.push([positions[i][j], positions[i + 1][j + 1]]);
        // Adds a diagonal spring from top-left to bottom-right (shear spring, Task 3–5)

        // up-right diagonal
        edges.push([positions[i + 1][j], positions[i][j + 1]]);
        // Adds a diagonal spring from bottom-left to top-right (shear spring, Task 3–5)
      }
    }
  }

  const edgeLines = svg.selectAll("line").data(edges);
  // Selects all existing SVG lines and binds them to the list of spring connections

  edgeLines
    .enter() // Selects all new edges that do not yet have a corresponding line in the SVG
    .append("line") // Creates a new SVG line for each new spring connection
    .merge(edgeLines) // Merges new and existing lines so they all get updated together
    .attr("x1", (d) => d[0][0]) // Sets the x-coordinate of the first endpoint of the spring (first mass)
    .attr("y1", (d) => d[0][1]) // Sets the y-coordinate of the first endpoint of the spring (first mass)
    .attr("x2", (d) => d[1][0]) // Sets the x-coordinate of the second endpoint of the spring (second mass)
    .attr("y2", (d) => d[1][1]) // Sets the y-coordinate of the second endpoint of the spring (second mass)
    .attr("stroke", "gray") // Sets the color of the springs to gray (visual styling only)
    .attr("stroke-width", 1); // Sets the thickness of the spring lines

  // Removes any spring lines that are no longer needed (when grid size or task changes)
  edgeLines.exit().remove();
}

// Applies spring + damping forces between two connected masses (Task 1–5 core physics)
function applySpring(i1, j1, i2, j2, L0, k, b) {
  // Part 1: Spring forces
  const p1 = positions[i1][j1]; // Position of the first mass
  const p2 = positions[i2][j2]; // Position of the second mass

  const v1 = velocities[i1][j1]; // Velocity of the first mass
  const v2 = velocities[i2][j2]; // Velocity of the second mass

  // Horizontal displacement between the two masses (distance in x-direction)
  const dx = p2[0] - p1[0]; // Displacement in x  rp - rq (x)
  // Vertical displacement between the two masses (distance in y-direction)
  const dy = p2[1] - p1[1]; // Displacement in y  rp - rq (y)
  // Actual length L of the spring using Pythagoras
  const dist = Math.sqrt(dx * dx + dy * dy); // Displacement/ length of spring L

  if (dist === 0) return; // Prevents division by zero if two masses overlap (numerical safety)

  //normalize displacement vector
  const dirX = dx / dist;
  const dirY = dy / dist;

  // Calculate the spring force
  const springFx = k * (dist - L0) * dirX;
  const springFy = k * (dist - L0) * dirY;

  // Part 2: Damping forces
  const relVelX = v2[0] - v1[0]; // Relative velocity vp - vq (x)
  const relVelY = v2[1] - v1[1]; // vp - vq (y)
  const relVelDotUnit = relVelX * dirX + relVelY * dirY; // Scalar projection
  const dampingFx = b * relVelDotUnit * dirX;
  const dampingFy = b * relVelDotUnit * dirY;

  // Total Force
  const Fx = springFx + dampingFx;
  const Fy = springFy + dampingFy;

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
        applySpring(
          i,
          j,
          i,
          j + 1,
          structuralRestLength,
          structuralK,
          structuralDamping
        ); // Right neighbor

      if (i < rows - 1)
        applySpring(
          i,
          j,
          i + 1,
          j,
          structuralRestLength,
          structuralK,
          structuralDamping
        ); // Down neighbor
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
function updatePosVerlet() {
  calculateForces(); // To compute acceleration
  const h = timeStep; // Time step for integration

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
      positions[i][j][0] = Math.max(
        padding,
        Math.min(width - padding, positions[i][j][0])
      );
      positions[i][j][1] = Math.max(
        padding,
        Math.min(height - padding, positions[i][j][1])
      );
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
  document.getElementById("toggle-simulation").innerText = isRunning
    ? "Stop Simulation"
    : "Start Simulation";
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
  document.getElementById("restore-force-value").textContent =
    restoreForce.toFixed(2);
});

document.getElementById("damping").addEventListener("input", (e) => {
  damping = parseFloat(e.target.value);
  document.getElementById("damping-value").textContent = damping.toFixed(2);
});

// Simulation resets whenever the user selects a task.
document
  .getElementById("task-select")
  .addEventListener("change", initializeGrid);

// Initialize the grid
initializeGrid();
