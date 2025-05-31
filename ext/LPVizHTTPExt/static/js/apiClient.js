import { pdhg as localPdhgSolver } from './pdhg.js';
import { polytope as localPolytopeSolver } from './polytope.js';

export async function fetchPolytope(points) {
    const useLocalPolytope = localStorage.getItem('useLocalPolytope') === 'true';

    if (useLocalPolytope) {
        console.log("Using local polytope solver.");
        const result = localPolytopeSolver(points);
        return Promise.resolve(result);
    } else {
        console.log("Using remote polytope solver.");
        const response = await fetch('/polytope', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points })
        });
        return response.json();
    }
  }
  
  export async function fetchCentralPath(lines, objective, weights, niter) {
    const response = await fetch('/central_path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, objective, weights, niter })
    });
    return response.json();
  }
  
  export async function fetchSimplex(lines, objective) {
    const response = await fetch('/simplex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, objective })
    });
    return response.json();
  }
  
  export async function fetchIPM(lines, objective, weights, alphamax, maxit) {
    const response = await fetch('/ipm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, objective, weights, alphamax, maxit })
    });
    return response.json();
  }
  
  export async function fetchPDHG(lines, objective, ineq, maxit, eta, tau) {
    const useLocalSolver = localStorage.getItem('useLocalPdhgSolver') === 'true';
  
    if (useLocalSolver) {
      try {
          console.log("Using local PDHG solver.");
          const options = {ineq, maxit, eta, tau, verbose: false };
          const result = localPdhgSolver(lines, objective, options);
          return Promise.resolve(result);
      } catch (error) {
          console.error("Error in local PDHG solver:", error);
          return Promise.reject(error);
      }
    } else {
      console.log("Using remote PDHG solver.");
      const response = await fetch('/pdhg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, objective, ineq, maxit, eta, tau })
      });
      return response.json();
    }
  }
  