import { pdhg as localPdhgSolver } from "../algorithms/pdhg";
import { polytope as localPolytopeSolver } from "../algorithms/polytope";
import { ipm as localIpmSolver } from "../algorithms/ipm";
import { centralPath as localCentralPathSolver } from "../algorithms/central_path";
import { simplex as localSimplexSolver } from "../algorithms/simplex";
import Matrix from "ml-matrix";

export async function fetchPolytope(points: string | any[]) {
  try {
    const result = localPolytopeSolver(points);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Polytope solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchCentralPath(vertices: number[][], lines: number[][], objective: number[], weights: any[], niter: number) {
  try {
    const options = { niter, weights, verbose: false };
    const result = localCentralPathSolver(vertices, lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Central Path solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchSimplex(lines: number[][], objective: number[]) {
  try {
    const result = await localSimplexSolver(lines, objective, {});
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Simplex solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchIPM(lines: number[][], objective: number[], weights: any[], alphamax: number, maxit: number) {
  try {
    const options = { eps_p: 1e-6, eps_d: 1e-6, eps_opt: 1e-6, alphaMax: alphamax, maxit, verbose: false };
    const result = localIpmSolver(lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local IPM solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchPDHG(lines: Matrix | number[][], objective: number[] | number[][], ineq: boolean, maxit: number, eta: number, tau: number) {
  try {
    const options = { ineq, maxit, eta, tau, verbose: false };
    const result = localPdhgSolver(lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local PDHG solver:", error);
    return Promise.reject(error);
  }
}
