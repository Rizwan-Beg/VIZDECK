/**
 * VIZDECK RoomIQ — Dynamic Fringe Particle Physics Engine
 * Senior Real-Time Graphics & Simulation Engineer
 *
 * Implements a spring-constrained Verlet particle simulation for individual fringe strands:
 * - Roots fixed to the woven rug boundary in physical floor metric coordinates (metres)
 * - Multi-particle strands with Jakobsen distance relaxation
 * - Drag velocity & acceleration tracking from interactive pointer manipulation
 * - Fluid inertia during drag (strands trail opposite to movement)
 * - Damped oscillation and settling upon release
 * - Tapered ribbon mesh generation with authentic photographed fiber texture sampling
 * - Automated sleep / wake cycle to eliminate idle CPU/GPU consumption
 */

import { rotate2, type Vec2 } from "./floorMath";

export interface FringeNode {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

export interface FringeStrand {
  id: number;
  edge: "top" | "bottom";
  edgeParam: number; // 0.0 to 1.0 along the width
  lengthM: number;
  nodes: FringeNode[]; // 5 particles: 0 is root, 4 is free tip
  restOffset: Vec2; // rest direction relative to root in local coordinates
}

export class FringePhysicsSystem {
  public strands: FringeStrand[] = [];
  public isSleeping = false;
  public hasFringe = false;

  private numStrandsPerEdge = 48;
  private nodesPerStrand = 5;
  private segmentLengthM = 0.007; // 7 mm per segment = ~35 mm total fringe
  private damping = 0.86;
  private returnStiffness = 0.22;
  private relaxationIterations = 3;

  private lastRugPos: Vec2 = { x: 0, y: 0 };
  private lastRugRot = 0;
  private rugVelocity: Vec2 = { x: 0, y: 0 };
  private rugAngularVelocity = 0;
  private lastUpdateTime = 0;

  constructor(hasFringe: boolean = true) {
    this.hasFringe = hasFringe;
  }

  /**
   * Initializes strands along the rug's top and bottom physical boundaries.
   */
  public init(
    widthM: number,
    lengthM: number,
    centerM: Vec2,
    rot: number,
    hasTop: boolean = true,
    hasBottom: boolean = true
  ) {
    this.strands = [];
    this.lastRugPos = { ...centerM };
    this.lastRugRot = rot;
    this.isSleeping = false;

    if (!this.hasFringe) return;

    const hw = widthM / 2.0;
    const hl = lengthM / 2.0;

    const createStrandsForEdge = (edge: "top" | "bottom", hasEdge: boolean) => {
      if (!hasEdge) return;
      const isTop = edge === "top";
      const edgeY = isTop ? -hl : hl;
      const dirY = isTop ? -1.0 : 1.0;

      for (let k = 0; k < this.numStrandsPerEdge; k++) {
        const t = k / (this.numStrandsPerEdge - 1);
        const edgeX = -hw + t * (hw * 2.0);

        // Add subtle organic length jitter (+/- 12%)
        const jitter = 0.88 + (Math.sin(k * 7.3) * 0.5 + 0.5) * 0.24;
        const totalLen = this.segmentLengthM * (this.nodesPerStrand - 1) * jitter;
        const segLen = totalLen / (this.nodesPerStrand - 1);

        const nodes: FringeNode[] = [];
        for (let n = 0; n < this.nodesPerStrand; n++) {
          const localPos: Vec2 = {
            x: edgeX,
            y: edgeY + dirY * (n * segLen),
          };
          // Transform local floor coordinates to world metric floor plane
          const rotP = rotate2(localPos, rot);
          const worldPos: Vec2 = {
            x: rotP.x + centerM.x,
            y: rotP.y + centerM.y,
          };
          nodes.push({
            x: worldPos.x,
            y: worldPos.y,
            prevX: worldPos.x,
            prevY: worldPos.y,
          });
        }

        this.strands.push({
          id: this.strands.length,
          edge,
          edgeParam: t,
          lengthM: totalLen,
          nodes,
          restOffset: { x: 0, y: dirY },
        });
      }
    };

    createStrandsForEdge("top", hasTop);
    createStrandsForEdge("bottom", hasBottom);
  }

  /**
   * Advances simulation with fixed/clamped timestep.
   */
  public update(
    currentTime: number,
    rugPos: Vec2,
    rugRot: number,
    widthM: number,
    lengthM: number
  ) {
    if (!this.hasFringe || this.strands.length === 0) return;

    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = currentTime;
      this.lastRugPos = { ...rugPos };
      this.lastRugRot = rugRot;
      return;
    }

    const dt = Math.min((currentTime - this.lastUpdateTime) / 1000.0, 0.033);
    this.lastUpdateTime = currentTime;
    if (dt <= 0.001) return;

    // Calculate rug drag velocity and angular velocity
    const dx = rugPos.x - this.lastRugPos.x;
    const dy = rugPos.y - this.lastRugPos.y;
    const drot = rugRot - this.lastRugRot;

    this.rugVelocity = { x: dx / dt, y: dy / dt };
    this.rugAngularVelocity = drot / dt;

    this.lastRugPos = { ...rugPos };
    this.lastRugRot = rugRot;

    const rugSpeed = Math.hypot(this.rugVelocity.x, this.rugVelocity.y);
    const isMoving = rugSpeed > 0.005 || Math.abs(this.rugAngularVelocity) > 0.02;

    if (isMoving) {
      this.isSleeping = false;
    }

    if (this.isSleeping) return;

    const hw = widthM / 2.0;
    const hl = lengthM / 2.0;
    let totalMovementSq = 0;

    // Step 1: Update Root Positions along the rug perimeter
    for (const strand of this.strands) {
      const isTop = strand.edge === "top";
      const edgeY = isTop ? -hl : hl;
      const edgeX = -hw + strand.edgeParam * (hw * 2.0);

      const localRoot: Vec2 = { x: edgeX, y: edgeY };
      const rotRoot = rotate2(localRoot, rugRot);
      const worldRoot: Vec2 = {
        x: rotRoot.x + rugPos.x,
        y: rotRoot.y + rugPos.y,
      };

      const rootNode = strand.nodes[0];
      rootNode.prevX = rootNode.x;
      rootNode.prevY = rootNode.y;
      rootNode.x = worldRoot.x;
      rootNode.y = worldRoot.y;

      // Desired rest orientation in world space
      const rotRest = rotate2(strand.restOffset, rugRot);

      // Step 2: Verlet integration for free nodes
      const segLen = strand.lengthM / (this.nodesPerStrand - 1);

      for (let n = 1; n < this.nodesPerStrand; n++) {
        const node = strand.nodes[n];
        const vx = (node.x - node.prevX) * this.damping;
        const vy = (node.y - node.prevY) * this.damping;

        // Inertial opposition to drag
        const inertiaForceX = -this.rugVelocity.x * 0.12;
        const inertiaForceY = -this.rugVelocity.y * 0.12;

        // Spring restoration toward ideal rest angle
        const idealX = rootNode.x + rotRest.x * (n * segLen);
        const idealY = rootNode.y + rotRest.y * (n * segLen);
        const restoreForceX = (idealX - node.x) * this.returnStiffness;
        const restoreForceY = (idealY - node.y) * this.returnStiffness;

        const nextX = node.x + vx + (inertiaForceX + restoreForceX) * dt * dt * 60.0;
        const nextY = node.y + vy + (inertiaForceY + restoreForceY) * dt * dt * 60.0;

        totalMovementSq += vx * vx + vy * vy;

        node.prevX = node.x;
        node.prevY = node.y;
        node.x = nextX;
        node.y = nextY;
      }

      // Step 3: Jakobsen distance relaxation constraints
      for (let iter = 0; iter < this.relaxationIterations; iter++) {
        for (let n = 0; n < this.nodesPerStrand - 1; n++) {
          const p1 = strand.nodes[n];
          const p2 = strand.nodes[n + 1];

          const diffX = p2.x - p1.x;
          const diffY = p2.y - p1.y;
          const dist = Math.hypot(diffX, diffY) || 1e-6;
          const diffRatio = (dist - segLen) / dist;

          if (n === 0) {
            // Root is strictly pinned: entire correction applied to node 1
            p2.x -= diffX * diffRatio;
            p2.y -= diffY * diffRatio;
          } else {
            // Free nodes share correction 50/50
            const halfX = diffX * 0.5 * diffRatio;
            const halfY = diffY * 0.5 * diffRatio;
            p1.x += halfX;
            p1.y += halfY;
            p2.x -= halfX;
            p2.y -= halfY;
          }
        }
      }
    }

    // Sleep when particles come to rest
    if (!isMoving && totalMovementSq < 1e-6) {
      this.isSleeping = true;
    }
  }

  /**
   * Generates a dynamic Float32Array ribbon mesh for all strands.
   * Vertex stride: 4 (x_clip, y_clip, u, v)
   */
  public generateRibbonMesh(
    projectFloorToClip: (floorM: Vec2) => Vec2 | null
  ): Float32Array | null {
    if (!this.hasFringe || this.strands.length === 0) return null;

    const verts: number[] = [];
    const rootWidthM = 0.0035; // 3.5 mm at root
    const tipWidthM = 0.0012;  // 1.2 mm at tip

    for (const strand of this.strands) {
      const isTop = strand.edge === "top";
      const uBase = strand.edgeParam;

      for (let n = 0; n < this.nodesPerStrand - 1; n++) {
        const p0 = strand.nodes[n];
        const p1 = strand.nodes[n + 1];

        // Segment direction & normal vector
        const tx = p1.x - p0.x;
        const ty = p1.y - p0.y;
        const tLen = Math.hypot(tx, ty) || 1e-6;
        const nx = -ty / tLen;
        const ny = tx / tLen;

        const w0 = rootWidthM - (n / (this.nodesPerStrand - 1)) * (rootWidthM - tipWidthM);
        const w1 = rootWidthM - ((n + 1) / (this.nodesPerStrand - 1)) * (rootWidthM - tipWidthM);

        const v0 = n / (this.nodesPerStrand - 1);
        const v1 = (n + 1) / (this.nodesPerStrand - 1);

        // 4 corners of ribbon quad in metric floor space
        const cA: Vec2 = { x: p0.x - nx * (w0 * 0.5), y: p0.y - ny * (w0 * 0.5) };
        const cB: Vec2 = { x: p0.x + nx * (w0 * 0.5), y: p0.y + ny * (w0 * 0.5) };
        const cC: Vec2 = { x: p1.x + nx * (w1 * 0.5), y: p1.y + ny * (w1 * 0.5) };
        const cD: Vec2 = { x: p1.x - nx * (w1 * 0.5), y: p1.y - ny * (w1 * 0.5) };

        const scA = projectFloorToClip(cA);
        const scB = projectFloorToClip(cB);
        const scC = projectFloorToClip(cC);
        const scD = projectFloorToClip(cD);

        if (!scA || !scB || !scC || !scD) continue;

        // Triangle 1: A, B, D
        verts.push(
          scA.x, scA.y, uBase - 0.005, v0,
          scB.x, scB.y, uBase + 0.005, v0,
          scD.x, scD.y, uBase - 0.005, v1
        );
        // Triangle 2: B, C, D
        verts.push(
          scB.x, scB.y, uBase + 0.005, v0,
          scC.x, scC.y, uBase + 0.005, v1,
          scD.x, scD.y, uBase - 0.005, v1
        );
      }
    }

    if (verts.length === 0) return null;
    return new Float32Array(verts);
  }
}

