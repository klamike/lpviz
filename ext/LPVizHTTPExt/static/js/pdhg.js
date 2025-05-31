function pdhgPiPlusInPlace(x) {
  for (let i = 0; i < x.length; i++) {
    x[i] = Math.max(0.0, x[i]);
  }
}
function pdhgPiPlus(x) {
  return x.map((val) => Math.max(0.0, val));
}
function norm(vector) {
  let sumOfSquares = 0;
  for (const val of vector) {
    sumOfSquares += val * val;
  }
  return Math.sqrt(sumOfSquares);
}
function dot(vector1, vector2) {
  if (vector1.length !== vector2.length) {
    throw new Error("Vectors must have the same length for dot product.");
  }
  let result = 0;
  for (let i = 0; i < vector1.length; i++) {
    result += vector1[i] * vector2[i];
  }
  return result;
}
function subtract(vector1, vector2) {
  if (vector1.length !== vector2.length) {
    throw new Error("Vectors must have the same length for subtraction.");
  }
  return vector1.map((val, i) => val - vector2[i]);
}
function add(vector1, vector2) {
  if (vector1.length !== vector2.length) {
    throw new Error("Vectors must have the same length for addition.");
  }
  return vector1.map((val, i) => val + vector2[i]);
}
function scale(vector, scalar) {
  return vector.map((val) => val * scalar);
}
function normInf(vector) {
  if (!vector || vector.length === 0) return 0;
  return Math.max(...vector.map((val) => Math.abs(val)));
}

class Matrix {
  constructor(rows) {
    if (!rows || rows.length === 0) {
      this.m = 0;
      this.n = 0;
      this.rows = [];
      return;
    }
    this.m = rows.length;
    this.n = rows[0].length;
    this.rows = rows;
  }
  multiply(x) {
    if (this.n === 0 && x.length === 0) return new Array(this.m).fill(0);
    if (this.n !== x.length) {
      throw new Error(
        `Matrix columns (${this.n}) and vector length (${x.length}) must match for A*x.`
      );
    }
    const result = new Array(this.m).fill(0);
    for (let i = 0; i < this.m; i++) {
      for (let j = 0; j < this.n; j++) {
        result[i] += this.rows[i][j] * x[j];
      }
    }
    return result;
  }
  transposeMultiply(y) {
    if (this.m === 0 && y.length === 0) return new Array(this.n).fill(0);
    if (this.m !== y.length) {
      throw new Error(
        `Matrix rows (${this.m}) and vector length (${y.length}) must match for A_transpose*y.`
      );
    }
    const result = new Array(this.n).fill(0);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.m; i++) {
        result[j] += this.rows[i][j] * y[i];
      }
    }
    return result;
  }
  getRows() {
    return this.m;
  }
  getCols() {
    return this.n;
  }
}

function pdhgEpsilon(A, b, c, xk, yk) {
  const Ax = A.multiply(xk);
  const primalFeasNum = norm(subtract(Ax, b));
  const primalFeasDen = 1 + norm(b);
  const primalFeasibility = primalFeasNum / primalFeasDen;

  const ATy = A.transposeMultiply(yk);
  const negATy_minus_c = subtract(scale(ATy, -1), c);
  const dualFeasNum = norm(pdhgPiPlus(negATy_minus_c));
  const dualFeasDen = 1 + norm(c);
  const dualFeasibility = dualFeasNum / dualFeasDen;

  const cTx = dot(c, xk);
  const bTy = dot(b, yk);
  const dualityGapNum = Math.abs(cTx + bTy);
  const dualityGapDen = 1 + Math.abs(cTx) + Math.abs(bTy);
  const dualityGap = dualityGapNum / dualityGapDen;

  return primalFeasibility + dualFeasibility + dualityGap;
}
function pdhgIneqEpsilon(A, b, c, xk, yk) {
  const Ax = A.multiply(xk);
  const Ax_minus_b = subtract(Ax, b);
  const primalFeasNum = norm(pdhgPiPlus(Ax_minus_b));
  const primalFeasDen = 1 + norm(b);
  const primalFeasibility = primalFeasNum / primalFeasDen;

  const dualFeasNum = norm(pdhgPiPlus(scale(yk, -1)));
  const dualFeasDen = 1 + norm(c);
  const dualFeasibility = dualFeasNum / dualFeasDen;

  const cTx = dot(c, xk);
  const bTy = dot(b, yk);
  const dualityGapNum = Math.abs(bTy + cTx);
  const dualityGapDen = 1 + Math.abs(cTx) + Math.abs(bTy);
  const dualityGap = dualityGapNum / dualityGapDen;

  return primalFeasibility + dualFeasibility + dualityGap;
}
function pdhgStandardForm(A, b, c, options = {}) {
  const {
    maxit = 1000,
    eta = 0.25,
    tau = 0.25,
    tol = 1e-4,
    verbose = false,
  } = options;

  const m = A.getRows();
  const n = A.getCols();

  let xk = new Array(n).fill(0.0);
  let yk = new Array(m).fill(0.0);
  let k = 1;

  let epsilonK = pdhgEpsilon(A, b, c, xk, yk);
  const logs = [];

  let logHeader =
    " Iter      x      y      PObj     DObj    PFeas   DFeas        ϵ";

  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates = [];
  const startTime = performance.now();

  while (k < maxit && epsilonK > tol) {
    iterates.push([...xk]);

    const pObj = -dot(c, xk);
    const dObj = -dot(b, yk);
    const pFeas = normInf(subtract(A.multiply(xk), b));
    const dFeas = normInf(
      pdhgPiPlus(subtract(scale(A.transposeMultiply(yk), -1), c))
    );

    const formatNumber = (num, width, precision = 2, isScientific = false) => {
      let s;
      if (isScientific) {
        s = num.toExponential(precision);
      } else {
        s = num.toFixed(precision);
      }
      return (num >= 0 ? "+" : "") + s.padStart(width - 1);
    };

    let logMsg = `${k.toString().padEnd(5)} `;
    logMsg += `${formatNumber(xk[0] !== undefined ? xk[0] : 0.0, 7, 2)} `;
    logMsg += `${formatNumber(yk[0] !== undefined ? yk[0] : 0.0, 7, 2)} `;
    logMsg += `${formatNumber(pObj, 9, 1, true)} `;
    logMsg += `${formatNumber(dObj, 9, 1, true)} `;
    logMsg += `${formatNumber(pFeas, 7, 1, true)} `;
    logMsg += `${formatNumber(dFeas, 7, 1, true)} `;
    logMsg += `${epsilonK.toExponential(1).padStart(9)}`;

    if (verbose) console.log(logMsg);
    logs.push(logMsg);

    const gradX = add(c, A.transposeMultiply(yk));
    const x_intermediate = subtract(xk, scale(gradX, eta));
    const xk_plus_1 = pdhgPiPlus(x_intermediate);

    const x_extrapolated = add(xk_plus_1, subtract(xk_plus_1, xk));
    const Ax_extrapolated = A.multiply(x_extrapolated);
    const y_update_term = subtract(Ax_extrapolated, b);
    const yk_plus_1 = add(yk, scale(y_update_term, tau));

    xk = xk_plus_1;
    yk = yk_plus_1;
    k++;

    epsilonK = pdhgEpsilon(A, b, c, xk, yk);
  }

  const endTime = performance.now();
  const tsolve = (endTime - startTime).toFixed(2);

  let finalLogMsg;
  if (epsilonK <= tol) {
    finalLogMsg = `Converged to primal-dual optimal solution in ${tsolve}ms`;
  } else {
    finalLogMsg = `Did not converge after ${iterates.length} iterations in ${tsolve}ms`;
  }
  if (verbose) console.log(finalLogMsg);
  logs.push(finalLogMsg);

  return [iterates, logs];
}
function pdhgInequalityForm(A, b, c, options = {}) {
  const {
    maxit = 1000,
    eta = 0.25,
    tau = 0.25,
    tol = 1e-4,
    verbose = false,
  } = options;

  const m = A.getRows();
  const n = A.getCols();

  let xk = new Array(n).fill(0.0);

  let yk = new Array(m).fill(1.0);
  let k = 1;

  let epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk);
  const logs = [];

  let logHeader =
    " Iter      x      y      PObj     DObj    PFeas   DFeas        ϵ";
  if (verbose) console.log(logHeader);
  logs.push(logHeader);

  const iterates = [];
  const startTime = performance.now();

  while (k <= maxit && epsilonK > tol) {
    iterates.push([...xk]);

    const pObj = dot(c, xk);
    const dObj = dot(b, yk);

    const pFeasVal = normInf(pdhgPiPlus(subtract(A.multiply(xk), b)));

    const dFeasVal = normInf(pdhgPiPlus(scale(yk, -1)));

    let logMsg = `${k.toString().padEnd(5)} `;

    logMsg += `${(xk[0] !== undefined ? xk[0] : 0.0).toFixed(2).padStart(8)} `;
    logMsg += `${(xk[1] !== undefined ? xk[1] : 0.0).toFixed(2).padStart(8)} `;
    logMsg += `${pObj.toExponential(2).padStart(10)} ${dObj
      .toExponential(2)
      .padStart(10)} `;
    logMsg += `${pFeasVal.toExponential(1).padStart(10)} ${dFeasVal
      .toExponential(1)
      .padStart(10)} `;
    logMsg += `${epsilonK.toExponential(1).padStart(10)}`;

    if (verbose) console.log(logMsg);
    logs.push(logMsg);

    const Axk_minus_b = subtract(A.multiply(xk), b);
    const y_intermediate = add(yk, scale(Axk_minus_b, tau));
    const yk_plus_1 = pdhgPiPlus(y_intermediate);

    const y_extrapolated = add(yk_plus_1, subtract(yk_plus_1, yk));
    const AT_y_extrapolated = A.transposeMultiply(y_extrapolated);
    const gradX = add(c, AT_y_extrapolated);
    const xk_plus_1 = subtract(xk, scale(gradX, eta));

    xk = xk_plus_1;
    yk = yk_plus_1;
    k++;

    epsilonK = pdhgIneqEpsilon(A, b, c, xk, yk);
  }

  const endTime = performance.now();
  let tsolve = endTime - startTime;
  tsolve = parseFloat(tsolve.toFixed(2));

  let finalLogMsg;
  if (epsilonK <= tol) {
    finalLogMsg = `Converged to primal-dual optimal solution in ${tsolve}ms`;
  } else {
    finalLogMsg = `Did not converge after ${iterates.length} iterations in ${tsolve}ms`;
  }
  if (verbose) console.log(finalLogMsg);
  logs.push(finalLogMsg);

  return [iterates, logs];
}
function linesToAb(lines) {
  if (!lines || lines.length === 0) {
    return { A: new Matrix([]), b: [] };
  }
  const A_rows = lines.map((line) => line.slice(0, -1));
  const b_vector = lines.map((line) => line[line.length - 1]);
  return { A: new Matrix(A_rows), b: b_vector };
}


function pdhg(linesOrMatrixA, objectiveOrVectorB, options = {}) {
  const {
    ineq = false,
    maxit = 1000,
    eta = 0.25,
    tau = 0.25,
    verbose = false,
    tol = 1e-4,
    isStandardProblem = false,
    cStandard = [],
  } = options;

  if (maxit > Math.pow(2, 16)) {
    throw new Error("maxit > 2^16 not allowed");
  }

  const solverOptions = { maxit, eta, tau, verbose, tol };

  if (isStandardProblem) {
    const A_direct =
      linesOrMatrixA instanceof Matrix
        ? linesOrMatrixA
        : new Matrix(linesOrMatrixA);
    const b_direct = objectiveOrVectorB;
    const c_direct = cStandard;
    return pdhgStandardForm(A_direct, b_direct, c_direct, solverOptions);
  }

  const { A, b } = linesToAb(linesOrMatrixA);
  const c_objective = objectiveOrVectorB;
  const m = A.getRows();
  const n_orig = A.getCols();

  if (ineq) {
    const c_min = scale(c_objective, -1);
    return pdhgInequalityForm(A, b, c_min, solverOptions);
  } else {
    const A_rows = A.rows;
    const A_hat_rows = [];
    for (let i = 0; i < m; i++) {
      const row = new Array(2 * n_orig + m).fill(0);
      for (let j = 0; j < n_orig; j++) {
        row[j] = A_rows[i][j];
        row[j + n_orig] = -A_rows[i][j];
      }
      row[i + 2 * n_orig] = 1;
      A_hat_rows.push(row);
    }
    const A_hat = new Matrix(A_hat_rows);

    const c_hat = [
      ...scale(c_objective, -1),
      ...c_objective,
      ...new Array(m).fill(0),
    ];

    const [chi_iterates, logs] = pdhgStandardForm(
      A_hat,
      b,
      c_hat,
      solverOptions
    );

    const x_iterates = chi_iterates.map((chi_k) => {
      const x_plus = chi_k.slice(0, n_orig);
      const x_minus = chi_k.slice(n_orig, 2 * n_orig);
      return subtract(x_plus, x_minus);
    });

    return [x_iterates, logs];
  }
}

export {
  pdhg,
  pdhgStandardForm,
  pdhgInequalityForm,
  pdhgEpsilon,
  pdhgIneqEpsilon,
  pdhgPiPlus,
  pdhgPiPlusInPlace,
  Matrix,
  linesToAb,
  norm,
  normInf,
  dot,
  add,
  subtract,
  scale,
};
