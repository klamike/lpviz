import { pdhg as localPdhgSolver } from "../algorithms/pdhg";
import { polytope as localPolytopeSolver } from "../algorithms/polytope";
import { ipm as localIpmSolver } from "../algorithms/ipm";
import { centralPath as localCentralPathSolver } from "../algorithms/central_path";
import { simplex as localSimplexSolver } from "../algorithms/simplex";
import Matrix from "ml-matrix";

export async function fetchPolytope(points: number[][]) {
  try {
    const result = localPolytopeSolver(points);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Polytope solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchCentralPath(vertices: number[][], lines: number[][], objective: number[], weights: number[], niter: number) {
  try {
    const options = { niter, weights, verbose: false, tol: 1e-6, isStandardProblem: false, cStandard: [] };
    const result = localCentralPathSolver(vertices, lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Central Path solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchSimplex(lines: number[][], objective: number[]) {
  try {
    const result = await localSimplexSolver(lines, objective, { tol: 1e-6, verbose: false });
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Simplex solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchIPM(lines: number[][], objective: number[], weights: number[], alphamax: number, maxit: number) {
  try {
    const options = { eps_p: 1e-6, eps_d: 1e-6, eps_opt: 1e-6, alphaMax: alphamax, maxit, verbose: false, tol: 1e-6, isStandardProblem: false, cStandard: [] };
    const result = localIpmSolver(lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local IPM solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchPDHG(lines: Matrix | number[][], objective: number[] | number[][], ineq: boolean, maxit: number, eta: number, tau: number) {
  try {
    const options = { ineq, maxit, eta, tau, verbose: false, tol: 1e-6, isStandardProblem: false, cStandard: [] };
    const result = localPdhgSolver(lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local PDHG solver:", error);
    return Promise.reject(error);
  }
}
