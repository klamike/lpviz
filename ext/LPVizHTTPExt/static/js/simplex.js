import { Matrix, solve, zeros as zerosVec, ones as onesVec, copy as copyVec, dot, normInf, vectorSub, mtmul, linesToAb } from './blas.js';

/* horizontal concatenation ------------------------------------------------ */
function hstack(...mats) {
  if (mats.length === 0) return new Matrix([]);
  const rows = mats[0].rows;
  if (!mats.every(M => M.rows === rows)) {
    throw new Error('hstack: all blocks must have identical row-count');
  }
  const cols = mats.reduce((s, M) => s + M.columns, 0);
  const out = Matrix.zeros(rows, cols);

  let current_col_offset = 0;
  for (const M of mats) {
    if (M.columns > 0) { // Skip empty matrices
      // Assuming M.get(r,c) and out.set(r,c,val) are available
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

/* ======================================================================== */
/*  Public entry point – identical signature to the Julia function          */
/* ======================================================================== */
export function simplex(lines, objective, opts = {}) {
  const { tol = 1e-6, verbose = false } = opts;

  const { A: A_orig, b } = linesToAb(lines);
  const m = A_orig.rows;
  const n = A_orig.columns;
  const c_objective = objective.slice();

  /* ----------  Phase-1  -------------------------------------------------- */
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

  const c1 = [].concat(zerosVec(2 * n + m), onesVec(m).map(_ => -1)); // –Σ t

  const basis1_init = Array(2 * n + 2 * m).fill(false);    // start: t basic
  for (let i = 0; i < m; ++i) basis1_init[2 * n + m + i] = true;

  if (verbose) console.log("Phase One");
  const [iters1, rawBasis1, log1] = simplexCore(
    c1, A1, b1, basis1_init,
    { tol, verbose, phase1: true, nOrig: n, m }
  );

  /* ----------  Phase-2  -------------------------------------------------- */
  const c2 = [].concat(c_objective, c_objective.map(v => -v), zerosVec(m));  //  c x₁ – c x₂
  const A_orig_neg_data = A_orig.to2DArray().map(row => row.map(v => -v));
  const A_orig_neg = new Matrix(A_orig_neg_data);
  const A2 = hstack(A_orig, A_orig_neg, Im);

  if (verbose) console.log("Phase Two");
  const [iters2, _basis2, log2] = simplexCore(
    c2, A2, b, rawBasis1,
    { tol, verbose, phase1: false, nOrig: n, m }
  );

  /* ----------  Convert iterations back to the original x  --------------- */
  const all_tableau_iters = iters1.slice(0, -1).concat(iters2); // drop duplicate
  const xIters = all_tableau_iters.map(tableau_x => {
    const x1 = tableau_x.slice(0, n);
    const x2 = tableau_x.slice(n, 2 * n);
    return vectorSub(x1, x2);
  });

  return [xIters, [log1, log2]];
}

/* ======================================================================== */
/*  Core simplex:  max cᵀx  s.t.  A x = b , x ≥ 0  (basis given)            */
/* ======================================================================== */
function simplexCore(cVec, A, bVec, basisInit, cfg) {
  const { tol, verbose, phase1, nOrig, m } = cfg;
  const mRows = A.rows;
  const nCols = A.columns;

  if (mRows !== m || bVec.length !== m) {
      throw new Error(`Dimension mismatch: A.rows=${mRows} vs m=${m}, bVec.length=${bVec.length} vs m=${m}`);
  }

  let basis = copyVec(basisInit);           // mutable copy
  const iterations = [];
  const logs       = [];

  const basisHeaderName = 'basis';
  // Calculate padding needed to make the header 'basis' string as long as the actual basis string representation
  const padding = ' '.repeat(Math.max(0, nCols - basisHeaderName.length));
  const paddedBasisTitle = basisHeaderName + padding;

  const hdr = sprintf('%5s %8s %8s %10s %s\n',
                      'Iter', 'x', 'y', 'Obj', paddedBasisTitle);
  if (verbose) console.log(hdr);
  logs.push(hdr);

  let iter = 0;
  const iterMax = 1 << 16;

  while (true) {
    if (++iter > iterMax) throw new Error(`Simplex stalled after ${iterMax} iterations`);

    /* --- Construct B matrix from A based on basis --- */
    const basisIndices = [];
    for(let i=0; i<nCols; ++i) if(basis[i]) basisIndices.push(i);

    if (basisIndices.length !== mRows) {
        throw new Error(`Basis size ${basisIndices.length} does not match number of constraints ${mRows}. Basis: ${basis.map(bVal => bVal?1:0).join('')}`);
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
        console.error("Basis bool array:", basis.map(bVal => bVal?1:0).join(''));
        throw e;
    }

    const x_tableau = zerosVec(nCols);
    basisIndices.forEach((col_idx, k) => { x_tableau[col_idx] = xB[k]; });
    iterations.push(copyVec(x_tableau));

    /* --- Dual:  Bᵀ y = c_B --------------------------------------------- */
    const cB = basisIndices.map(j => cVec[j]);
    const y = solve(B.transpose(), Matrix.columnVector(cB)).to1DArray();

    /* --- Reduced costs: z = c - Aᵀy ------------------------------------- */
    const ATy = mtmul(A, y);
    const z = cVec.map((ci, j) => ci - ATy[j]);

    /* Logging ------------------------------------------------------------ */
    const objVal = dot(cVec, x_tableau);
    const x0_log = x_tableau[0] !== undefined ? x_tableau[0] : 0.0;
    const y0_log = y[0] !== undefined ? y[0] : 0.0;

    const line = sprintf('%5d %+8.2f %+8.2f %+10.1e %s\n',
                         iter,
                         x0_log,
                         y0_log,
                         objVal,
                         basis.map(bVal => (bVal ? 1 : 0)).join(''));
    if (verbose) console.log(line);
    logs.push(line);

    /* Optimality test ---------------------------------------------------- */
    let enter_idx = -1, bestZ = tol;
    for (let j = 0; j < nCols; ++j) {
      if (!basis[j] && z[j] > bestZ) {
        bestZ = z[j];
        enter_idx = j;
      }
    }
    if (enter_idx === -1) break;

    /* Direction d = B⁻¹ a_enter ----------------------------------------- */
    const A_enter_col_array = Array.from({ length: mRows }, (_, i) => A.get(i, enter_idx));
    const d_direction = solve(B, Matrix.columnVector(A_enter_col_array)).to1DArray();

    /* Ratio test --------------------------------------------------------- */
    let leave_idx_in_basis_indices = -1;
    let minRatio = Infinity;

    for (let i = 0; i < mRows; ++i) {
      if (d_direction[i] > tol) {
        const ratio = xB[i] / d_direction[i];
        if (ratio < minRatio - tol) {
          minRatio = ratio;
          leave_idx_in_basis_indices = i;
        } else if (Math.abs(ratio - minRatio) < tol) {
            // Bland's rule: if ratios are tied, pick the one with the smallest leaving variable index
            // This is complex to implement fully without original indices easily available for comparison
            // For now, stick to minimum ratio, or first one found.
            // Defaulting to first minRatio found if nearly equal.
        }
      }
    }

    if (leave_idx_in_basis_indices === -1) {
        const unbounded_log = "LP is unbounded. No leaving variable found.";
        if (verbose) console.log(unbounded_log);
        logs.push(unbounded_log);
        // Instead of throwing error immediately, we might want to return current state or a specific status
        // For now, keeping the error as per original logic.
        throw new Error(unbounded_log);
    }

    const leave_original_idx = basisIndices[leave_idx_in_basis_indices];

    /* Pivot -------------------------------------------------------------- */
    basis[enter_idx] = true;
    basis[leave_original_idx] = false;
  }

  /* ---------------- Phase-1 clean-up ----------------------------------- */
  let finalBasis = copyVec(basis);
  if (phase1) {
    // Artificial variables are the last 'm' variables in the Phase 1 tableau
    // nCols for phase 1 is 2*nOrig + 2*m
    // Artificials are from index (2*nOrig + m) to (2*nOrig + 2*m - 1)
    const artificial_vars_start_index = 2 * nOrig + m; // m is original problem's constraint count

    // Check if any artificial variable is basic AND has a positive value
    // (being basic implies its value is in xB, which should be >= 0)
    let problemInfeasible = false;
    for (let i = 0; i < m; ++i) {
      const art_var_idx = artificial_vars_start_index + i;
      if (finalBasis[art_var_idx]) {
        // Find its value in x_tableau
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
      // Decide how to handle this: throw error or return a status.
      // Julia version seems to continue to Phase 2 but it's probably caught by basis construction.
      // The original JS threw an error if basis.slice(2 * nOrig + m).some(b => b)
      // Let's refine this: if objective value is non-zero (meaning some t_i > 0).
      // The objective for phase 1 is sum(-t_i). If optimal obj is not zero, then problem is infeasible.
      if (Math.abs(objVal) > tol) { // objVal is c1 . x_tableau. c1 has -1 for t variables.
          throw new Error(infeasibleMsg);
      }
    }
    
    // The basis for Phase 2 should only contain original variables (x1, x2) and original slack variables (s)
    // It should have 'm' basic variables.
    // Original x1, x2 are first 2*nOrig. Original slacks are next m. Total 2*nOrig + m.
    finalBasis = finalBasis.slice(0, 2 * nOrig + m);

    let currentBasicCount = finalBasis.filter(bVal => bVal).length;
    if (currentBasicCount < m) {
      // Try to make original slack variables basic if deficit
      // Original slack variables are at indices [2*nOrig, 2*nOrig + m -1] in the Phase 2 problem's variable space
      // (which corresponds to these same indices in the first 2*nOrig+m part of Phase 1 basis)
      for (let j = 2 * nOrig; j < 2 * nOrig + m && currentBasicCount < m; ++j) {
        if (!finalBasis[j]) {
          // Check if making this slack basic is valid (e.g., not creating linear dependency issues)
          // This step is tricky; the original code just forced them basic.
          // For now, let's keep the original logic of trying to fill with slacks:
          finalBasis[j] = true;
          currentBasicCount++;
        }
      }
    }
     if (finalBasis.filter(bVal => bVal).length !== m) {
        // This can happen if the problem structure after phase 1 doesn't allow for m basic vars from x and s.
        // e.g. redundant constraints in original problem.
        const basisSizeError = `Phase 1 resulted in a basis for Phase 2 of size ${finalBasis.filter(bVal => bVal).length}, expected ${m}.`;
        if(verbose) console.warn(basisSizeError);
        logs.push(basisSizeError);
        // This might lead to errors in Phase 2. The original JS code had a similar loop.
     }
  }

  const tail = sprintf('Phase %d finished – basis %s\n',
                       phase1 ? 1 : 2,
                       finalBasis.map(bVal => (bVal ? 1 : 0)).join(''));
  if (verbose) console.log(tail);
  logs.push(tail);

  return [iterations, finalBasis, logs];
}
