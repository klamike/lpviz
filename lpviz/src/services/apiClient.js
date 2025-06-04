import { pdhg as localPdhgSolver } from "../algorithms/pdhg.js";
import { polytope as localPolytopeSolver } from "../algorithms/polytope.js";
import { ipm as localIpmSolver } from "../algorithms/ipm.js";
import { centralPath as localCentralPathSolver } from "../algorithms/central_path.js";
import { simplex as localSimplexSolver } from "../algorithms/simplex.js";

export async function fetchPolytope(points) {
  try {
    const result = localPolytopeSolver(points);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Polytope solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchCentralPath(vertices, lines, objective, weights, niter) {
  try {
    const options = { niter, weights, verbose: false };
    const result = localCentralPathSolver(vertices, lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Central Path solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchSimplex(lines, objective) {
  try {
    const result = await localSimplexSolver(lines, objective, {});
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local Simplex solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchIPM(lines, objective, weights, alphamax, maxit) {
  try {
    const options = { alphaMax: alphamax, maxit, verbose: false };
    const result = localIpmSolver(lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local IPM solver:", error);
    return Promise.reject(error);
  }
}

export async function fetchPDHG(lines, objective, ineq, maxit, eta, tau) {
  try {
    const options = { ineq, maxit, eta, tau, verbose: false };
    const result = localPdhgSolver(lines, objective, options);
    return Promise.resolve(result);
  } catch (error) {
    console.error("Error in local PDHG solver:", error);
    return Promise.reject(error);
  }
}
