import { Matrix, solve } from "ml-matrix";
import { sprintf } from "sprintf-js";
import { linesToAb, hstack, vstack } from "./utils/blas";
import type { Lines, Vec2N, VecN, Vec2Ns } from "./utils/blas";

const MAX_ITERATIONS = 2 ** 16;

export interface SimplexOptions {
  tol: number;
  verbose: boolean;
}

export function simplex(lines: Lines, objective: VecN, opts: SimplexOptions) {
  const { tol, verbose } = opts;

  const { A: A_orig, b } = linesToAb(lines);
  const m = A_orig.rows;
  const n = A_orig.columns;
  const c_objective = Matrix.columnVector(objective);

  // Γ = diag(sign(b))
  const gamma = b.to1DArray().map((bi) => (bi < 0 ? -1 : 1));
  const Gamma = Matrix.diag(gamma);
  const b1 = Gamma.mmul(b); // Γ b

  const Apos = Gamma.mmul(A_orig);
  const Aneg = Matrix.mul(Apos, -1);

  const Im = Matrix.eye(m);
  const A1 = hstack(Apos, Aneg, Gamma.mmul(Im), Im);
  const c1_zeros = Matrix.zeros(2 * n + m, 1);
  const c1_ones = Matrix.ones(m, 1).mul(-1);
  const c1 = vstack([c1_zeros, c1_ones]); // –Σ t

  const basis1_init = Array(2 * n + 2 * m).fill(false); // start: t basic
  for (let i = 0; i < m; ++i) basis1_init[2 * n + m + i] = true;

  if (verbose) console.log("Phase One");
  const { finalBasis: rawBasis1, logs: log1 } = simplexCore(c1, A1, b1, basis1_init, {
    tol,
    verbose,
    phase1: true,
    nOrig: n,
    m,
  });

  // Phase 2: min c^T x s.t. Ax = b, x ≥ 0
  const c_neg = Matrix.mul(c_objective, -1);
  const c2_zeros = Matrix.zeros(m, 1);
  const c2 = vstack([c_objective, c_neg, c2_zeros]); //  c x₁ – c x₂
  const A_orig_neg = Matrix.mul(A_orig, -1);
  const A2 = hstack(A_orig, A_orig_neg, Im);

  if (verbose) console.log("Phase Two");
  const {
    iterations: iters2,
    finalBasis: _basis2,
    logs: log2,
  } = simplexCore(c2, A2, b, rawBasis1, {
    tol,
    verbose,
    phase1: false,
    nOrig: n,
    m,
  });
  // x = x₁ - x₂
  const xIters = iters2.map((tableau_x: Vec2N) => {
    const tableau_matrix = Matrix.columnVector(tableau_x);
    const x1 = tableau_matrix.subMatrix(0, n - 1, 0, 0);
    const x2 = tableau_matrix.subMatrix(n, 2 * n - 1, 0, 0);
    return Matrix.sub(x1, x2).to1DArray();
  });

  return {
    iterations: xIters,
    logs: [log1, log2],
  };
}

// max cᵀx  s.t.  A x = b , x ≥ 0  (basis given)
function simplexCore(
  cVec: Matrix,
  A: Matrix,
  bVec: Matrix,
  basisInit: boolean[],
  cfg: {
    tol: number;
    verbose: boolean;
    phase1: boolean;
    nOrig: number;
    m: number;
  },
) {
  const { tol, verbose, phase1, nOrig, m } = cfg;
  const mRows = A.rows;
  const nCols = A.columns;

  if (mRows !== m || bVec.rows !== m) {
    throw new Error(`Dimension mismatch: A.rows=${mRows} vs m=${m}, bVec.rows=${bVec.rows} vs m=${m}`);
  }

  let basis = basisInit.slice();
  const iterations: Vec2Ns = [];
  const logs = [];

  const basisHeaderName = "basis";
  const padding = " ".repeat(Math.max(0, nCols - basisHeaderName.length));
  const paddedBasisTitle = basisHeaderName + padding;

  const hdr = sprintf("%5s %8s %8s %10s %s\n", "Iter", "x", "y", "Obj", paddedBasisTitle);
  if (verbose) console.log(hdr);
  logs.push(hdr);

  let iter = 0;

  let basisIndices: number[] = [];
  let x_tableau = Matrix.zeros(nCols, 1);
  let objVal = 0;

  while (true) {
    if (++iter > MAX_ITERATIONS) throw new Error(`Simplex stalled after ${MAX_ITERATIONS} iterations`);

    // B = A[:, basis_indices]
    basisIndices = [];
    for (let i = 0; i < nCols; ++i) if (basis[i]) basisIndices.push(i);

    if (basisIndices.length !== mRows) {
      throw new Error(`Basis size ${basisIndices.length} does not match number of constraints ${mRows}. Basis: ${basis.map((bVal) => (bVal ? 1 : 0)).join("")}`);
    }

    const B = Matrix.zeros(mRows, mRows);
    for (let j = 0; j < mRows; ++j) {
      const original_col_idx = basisIndices[j];
      for (let i = 0; i < mRows; ++i) {
        B.set(i, j, A.get(i, original_col_idx));
      }
    }
    // x_B = B^{-1} b
    let xB;
    try {
      xB = solve(B, bVec);
    } catch (e) {
      console.error("Error solving BxB = b. B might be singular.", e);
      throw e;
    }

    x_tableau = Matrix.zeros(nCols, 1);
    const xBArray = xB.to1DArray();
    basisIndices.forEach((col_idx, k) => {
      x_tableau.set(col_idx, 0, xBArray[k]);
    });
    iterations.push(x_tableau.to1DArray());

    // B^T y = c_B
    const cB = Matrix.columnVector(basisIndices.map((j) => cVec.get(j, 0)));
    const y = solve(B.transpose(), cB);

    // z = c - A^T y
    const ATy = A.transpose().mmul(y);
    const z = Matrix.sub(cVec, ATy);

    objVal = cVec.dot(x_tableau);
    let x0_log = 0;
    let y0_log = 0;
    if (nOrig >= 1) {
      const x1_part = x_tableau.subMatrix(0, nOrig - 1, 0, 0);
      const x2_part = x_tableau.subMatrix(nOrig, 2 * nOrig - 1, 0, 0);
      const x_primal = Matrix.sub(x1_part, x2_part);
      x0_log = x_primal.get(0, 0);
      if (nOrig >= 2) {
        y0_log = x_primal.get(1, 0);
      }
    }

    const line = sprintf("%5d %+8.2f %+8.2f %+10.1e %s\n", iter, x0_log, y0_log, objVal, basis.map((bVal) => (bVal ? 1 : 0)).join(""));
    if (verbose) console.log(line);
    logs.push(line);

    // find entering variable
    let enter_idx = -1;
    for (let j = 0; j < nCols; ++j) {
      if (!basis[j] && z.get(j, 0) > tol) {
        enter_idx = j;
        break;
      }
    }
    if (enter_idx === -1) break;

    // d = B^{-1} a_enter
    const A_enter_col = Matrix.columnVector(Array.from({ length: mRows }, (_, i) => A.get(i, enter_idx)));
    const d = solve(B, A_enter_col);

    // find leaving variable
    let leave_idx_in_basis_indices = -1;
    let minRatio = Infinity;
    let smallest_leaving_var_original_idx = Infinity;

    for (let i = 0; i < mRows; ++i) {
      if (d.get(i, 0) > tol) {
        const ratio = xB.get(i, 0) / d.get(i, 0);
        const current_var_original_idx = basisIndices[i];

        if (ratio < minRatio - tol) {
          minRatio = ratio;
          leave_idx_in_basis_indices = i;
          smallest_leaving_var_original_idx = current_var_original_idx;
        } else if (Math.abs(ratio - minRatio) < tol) {
          if (current_var_original_idx < smallest_leaving_var_original_idx) {
            minRatio = ratio;
            leave_idx_in_basis_indices = i;
            smallest_leaving_var_original_idx = current_var_original_idx;
          }
        }
      }
    }

    if (leave_idx_in_basis_indices === -1) {
      const msg = "LP is unbounded. No leaving variable found.";
      if (verbose) console.log(msg);
      logs.push(msg);
      throw new Error(msg);
    }

    const leave_original_idx = basisIndices[leave_idx_in_basis_indices];

    basis[enter_idx] = true;
    basis[leave_original_idx] = false;
  }

  let finalBasis = basis.slice();
  if (phase1) {
    const artificial_vars_start_index = 2 * nOrig + m;

    let problemInfeasible = false;
    for (let i = 0; i < m; ++i) {
      const art_var_idx = artificial_vars_start_index + i;
      if (finalBasis[art_var_idx]) {
        const xB_idx = basisIndices.indexOf(art_var_idx);
        const x_val = x_tableau.get(art_var_idx, 0);
        if (xB_idx !== -1 && x_val > tol) {
          problemInfeasible = true;
          break;
        } else if (xB_idx === -1 && x_val > tol) {
          // Should not happen if basis is consistent
          problemInfeasible = true;
          break;
        }
      }
    }

    if (problemInfeasible) {
      const msg = "Problem infeasible (Phase-1 optimum > 0, an artificial variable is basic with positive value)";
      if (verbose) console.log(msg);
      logs.push(msg);
      if (Math.abs(objVal) > tol) throw new Error(msg);
    }

    finalBasis = finalBasis.slice(0, 2 * nOrig + m);

    let currentBasicCount = finalBasis.filter((bVal) => bVal).length;
    if (currentBasicCount < m) {
      for (let j = 2 * nOrig; j < 2 * nOrig + m && currentBasicCount < m; ++j) {
        if (!finalBasis[j]) {
          finalBasis[j] = true;
          currentBasicCount++;
        }
      }
    }
    if (finalBasis.filter((bVal) => bVal).length !== m) {
      const basisSizeError = `Phase 1 resulted in a basis for Phase 2 of size ${finalBasis.filter((bVal) => bVal).length}, expected ${m}.`;
      if (verbose) console.warn(basisSizeError);
      logs.push(basisSizeError);
    }
  }

  const tail = sprintf("Phase %d finished – basis %s\n", phase1 ? 1 : 2, finalBasis.map((bVal) => (bVal ? 1 : 0)).join(""));
  if (verbose) console.log(tail);
  logs.push(tail);

  return {
    iterations,
    finalBasis,
    logs,
  };
}
