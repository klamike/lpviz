export async function fetchPolytope(points) {
    const response = await fetch('/polytope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points })
    });
    return response.json();
  }
  
  export async function fetchIteratePath(lines, objective, weights) {
    const response = await fetch('/trace_central_path', {
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
  
  export async function fetchIPM(lines, objective, weights, alphaMax, nitermax) {
    const response = await fetch('/ipm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, objective, weights, "αmax": alphaMax, nitermax })
    });
    return response.json();
  }
  
  export async function fetchPDHG(lines, objective, maxit, eta, tau) {
    const response = await fetch('/pdhg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, objective, maxit, eta, tau })
    });
    return response.json();
  }
  