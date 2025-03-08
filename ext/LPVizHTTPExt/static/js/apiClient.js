export async function fetchPolytope(points) {
    const response = await fetch('/polytope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    });
    return response.json();
  }
  
  export async function fetchCentralPath(lines, objective, weights) {
    const response = await fetch('/central_path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, objective, weights })
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
    const response = await fetch('/pdhg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, objective, ineq, maxit, eta, tau })
    });
    return response.json();
  }
  