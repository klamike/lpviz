import { Matrix, solve } from 'ml-matrix';
import { sprintf } from 'sprintf-js';
import { zeros, ones, copy, dot, vectorSub, mtmul, linesToAb } from '../utils/blas';
import { SimplexOptions } from '../types/solverOptions';

function hstack(...mats: Matrix[]) {
  if (mats.length === 0) return new Matrix([]);
  const rows = mats[0].rows;
  if (!mats.every(M => M.rows === rows)) {
    throw new Error('hstack: all blocks must have identical row-count');
  }
  const cols = mats.reduce((s, M) => s + M.columns, 0);
  const out = Matrix.zeros(rows, cols);

  let current_col_offset = 0;
  for (const M of mats) {
    if (M.columns > 0) {
      for (let r = 0; r < M.rows; ++r) {
        for (let c = 0; c < M.columns; ++c) {
          out.set(r, current_col_offset + c, M.get(r, c));
        }
      }
    }
    current_col_offset += M.columns;
  }
  return out;
}

export function simplex(lines: number[][], objective: number[], opts: SimplexOptions) {
  const { tol, verbose } = opts;

  const { A: A_orig, b } = linesToAb(lines);
  const m = A_orig.rows;
  const n = A_orig.columns;
  const c_objective = objective.slice();

  const gamma = b.map(bi => (bi < 0 ? -1 : 1));
  const Gamma = Matrix.diag(gamma);
  const b1 = b.map((bi, i) => gamma[i] * bi);      // Γ b

  const Apos_data = Gamma.to2DArray().map((gamma_row, r) =>
    A_orig.to2DArray()[0].map((_, c_idx) =>
      gamma_row.reduce((sum, val, k) => sum + val * A_orig.get(k, c_idx), 0)
    )
  );
  const Apos = Gamma.mmul(A_orig);

  const Aneg_data = Apos.to2DArray().map(row => row.map(v => -v));
  const Aneg = new Matrix(Aneg_data);

  const Im = Matrix.eye(m);
  const A1 = hstack(Apos, Aneg, Gamma.mmul(Im), Im);
  const c1: number[] = [...zeros(2 * n + m), ...ones(m).map(_ => -1)]; // –Σ t

  const basis1_init = Array(2 * n + 2 * m).fill(false);    // start: t basic
  for (let i = 0; i < m; ++i) basis1_init[2 * n + m + i] = true;

  if (verbose) console.log("Phase One");
  const [iters1, rawBasis1, log1] = simplexCore(
    c1, A1, b1, basis1_init,
    { tol, verbose, phase1: true, nOrig: n, m }
  );

  /* ----------  Phase-2  -------------------------------------------------- */
  const c2: number[] = [...c_objective, ...c_objective.map(v => -v), ...zeros(m)];  //  c x₁ – c x₂
  const A_orig_neg_data = A_orig.to2DArray().map(row => row.map(v => -v));
  const A_orig_neg = new Matrix(A_orig_neg_data);
  const A2 = hstack(A_orig, A_orig_neg, Im);

  if (verbose) console.log("Phase Two");
  const [iters2, _basis2, log2] = simplexCore(
    c2, A2, b, rawBasis1 as boolean[],
    { tol, verbose, phase1: false, nOrig: n, m }
  );
  const all_tableau_iters = iters2 as number[][]; // for plotting, we only look at phase 2
  const xIters = all_tableau_iters.map((tableau_x: number[]) => {
    const x1 = tableau_x.slice(0, n);
    const x2 = tableau_x.slice(n, 2 * n);
    return vectorSub(x1, x2);
  });

  return [xIters, [log1, log2]];
}

/* ======================================================================== */
/*  Core simplex:  max cᵀx  s.t.  A x = b , x ≥ 0  (basis given)            */
/* ======================================================================== */
function simplexCore(cVec: number[], A: Matrix, bVec: number[], basisInit: boolean[], cfg: { tol: number, verbose: boolean, phase1: boolean, nOrig: number, m: number }) {
  const { tol, verbose, phase1, nOrig, m } = cfg;
  const mRows = A.rows;
  const nCols = A.columns;

  if (mRows !== m || bVec.length !== m) {
      throw new Error(`Dimension mismatch: A.rows=${mRows} vs m=${m}, bVec.length=${bVec.length} vs m=${m}`);
  }

  let basis = copy(basisInit);           // mutable copy
  const iterations = [];
  const logs       = [];

  const basisHeaderName = 'basis';
  const padding = ' '.repeat(Math.max(0, nCols - basisHeaderName.length));
  const paddedBasisTitle = basisHeaderName + padding;

  const hdr = sprintf('%5s %8s %8s %10s %s\n',
                      'Iter', 'x', 'y', 'Obj', paddedBasisTitle);
  if (verbose) console.log(hdr);
  logs.push(hdr);

  let iter = 0;
  const iterMax = 1 << 16;

  let basisIndices: number[] = [];
  let x_tableau: number[] = [];
  let objVal = 0;

  while (true) {
    if (++iter > iterMax) throw new Error(`Simplex stalled after ${iterMax} iterations`);

    /* --- Construct B matrix from A based on basis --- */
    basisIndices = [];
    for(let i=0; i<nCols; ++i) if(basis[i]) basisIndices.push(i);

    if (basisIndices.length !== mRows) {
        throw new Error(`Basis size ${basisIndices.length} does not match number of constraints ${mRows}. Basis: ${(basis as boolean[]).map(bVal => bVal?1:0).join('')}`);
    }

    const B = Matrix.zeros(mRows, mRows);
    for (let j = 0; j < mRows; ++j) {
      const original_col_idx = basisIndices[j];
      for (let i = 0; i < mRows; ++i) {
        B.set(i, j, A.get(i, original_col_idx));
      }
    }
    /* --- x_B = B⁻¹ b ---------------------------------------------------- */
    let xB;
    try {
        xB = solve(B, Matrix.columnVector(bVec)).to1DArray();
    } catch (e) {
        console.error("Error solving BxB = b. B might be singular.", e);
        console.error("B:", B.to2DArray());
        console.error("bVec:", bVec);
        console.error("Basis Indices:", basisIndices);
        console.error("Basis bool array:", (basis as boolean[]).map(bVal => bVal?1:0).join(''));
        throw e;
    }

    x_tableau = zeros(nCols);
    basisIndices.forEach((col_idx, k) => { x_tableau[col_idx] = xB[k]; });
    iterations.push(copy(x_tableau));

    /* --- Dual:  Bᵀ y = c_B --------------------------------------------- */
    const cB = basisIndices.map(j => cVec[j]);
    const y = solve(B.transpose(), Matrix.columnVector(cB)).to1DArray();

    /* --- Reduced costs: z = c - Aᵀy ------------------------------------- */
    const ATy = mtmul(A, y);
    const z = cVec.map((ci, j) => ci - ATy[j]);

    /* Logging ------------------------------------------------------------ */
    objVal = dot(cVec, x_tableau);
    const x0_log = x_tableau[0] !== undefined ? x_tableau[0] : 0.0;
    const y0_log = y[0] !== undefined ? y[0] : 0.0;

    const line = sprintf('%5d %+8.2f %+8.2f %+10.1e %s\n',
                         iter,
                         x0_log,
                         y0_log,
                         objVal,
                         (basis as boolean[]).map(bVal => (bVal ? 1 : 0)).join(''));
    if (verbose) console.log(line);
    logs.push(line);

    /* Optimality test - Bland's Rule for entering variable */
    let enter_idx = -1;
    for (let j = 0; j < nCols; ++j) {
      if (!basis[j] && z[j] > tol) {
        enter_idx = j;
        break;
      }
    }
    if (enter_idx === -1) break;

    /* Direction d = B⁻¹ a_enter ----------------------------------------- */
    const A_enter_col_array = Array.from({ length: mRows }, (_, i) => A.get(i, enter_idx));
    const d_direction = solve(B, Matrix.columnVector(A_enter_col_array)).to1DArray();

    /* Ratio test - Bland's Rule for leaving variable */
    let leave_idx_in_basis_indices = -1;
    let minRatio = Infinity;
    let smallest_leaving_var_original_idx = Infinity; 

    for (let i = 0; i < mRows; ++i) {
      if (d_direction[i] > tol) {
        const ratio = xB[i] / d_direction[i];
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
        const unbounded_log = "LP is unbounded. No leaving variable found.";
        if (verbose) console.log(unbounded_log);
        logs.push(unbounded_log);
        throw new Error(unbounded_log);
    }

    const leave_original_idx = basisIndices[leave_idx_in_basis_indices];

    /* Pivot -------------------------------------------------------------- */
    (basis as boolean[])[enter_idx] = true;
    (basis as boolean[])[leave_original_idx] = false;
  }

  /* ---------------- Phase-1 clean-up ----------------------------------- */
  let finalBasis = copy(basis);
  if (phase1) {
    const artificial_vars_start_index = 2 * nOrig + m;

    let problemInfeasible = false;
    for (let i = 0; i < m; ++i) {
      const art_var_idx = artificial_vars_start_index + i;
      if (finalBasis[art_var_idx]) {
        const xB_idx = basisIndices.indexOf(art_var_idx);
        if (xB_idx !== -1 && x_tableau[art_var_idx] > tol) {
             problemInfeasible = true;
             break;
        } else if (xB_idx === -1 && x_tableau[art_var_idx] > tol) { // Should not happen if basis is consistent
            problemInfeasible = true;
            break;
        }
      }
    }

    if (problemInfeasible) {
      const infeasibleMsg = 'Problem infeasible (Phase-1 optimum > 0, an artificial variable is basic with positive value)';
      if (verbose) console.log(infeasibleMsg);
      logs.push(infeasibleMsg);
      if (Math.abs(objVal) > tol) {
          throw new Error(infeasibleMsg);
      }
    }
    
    finalBasis = finalBasis.slice(0, 2 * nOrig + m);

    let currentBasicCount = (finalBasis as boolean[]).filter(bVal => bVal).length;
    if (currentBasicCount < m) {
      for (let j = 2 * nOrig; j < 2 * nOrig + m && currentBasicCount < m; ++j) {
        if (!(finalBasis as boolean[])[j]) {
          (finalBasis as boolean[])[j] = true;
          currentBasicCount++;
        }
      }
    }
     if ((finalBasis as boolean[]).filter(bVal => bVal).length !== m) {
        const basisSizeError = `Phase 1 resulted in a basis for Phase 2 of size ${(finalBasis as boolean[]).filter(bVal => bVal).length}, expected ${m}.`;
        if(verbose) console.warn(basisSizeError);
        logs.push(basisSizeError);
     }
  }

  const tail = sprintf('Phase %d finished – basis %s\n',
                       phase1 ? 1 : 2,
                       (finalBasis as boolean[]).map(bVal => (bVal ? 1 : 0)).join(''));
  if (verbose) console.log(tail);
  logs.push(tail);

  return [iterations, finalBasis, logs];
}
