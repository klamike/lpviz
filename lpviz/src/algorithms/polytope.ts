function centroid(vertices: string | any[]) {
    // compute centroid of vertices
    const n = vertices.length;
    if (n === 0) {
        throw new Error("No intersections found");
    }

    let sumX = 0;
    let sumY = 0;
    for (const p of vertices) {
        sumX += p[0];
        sumY += p[1];
    }
    return [sumX / n, sumY / n];
}

function polytope_format_float(x: number) {
    return x === Math.floor(x) ? x : parseFloat(x.toFixed(3));
}

function polytope_format(A: number, B: number, C: number) {
    // Rounding
    let A_disp = polytope_format_float(A);
    let B_disp = polytope_format_float(B);
    let C_disp = polytope_format_float(C);

    let ineq_sign = "≤";
    if (A_disp <= 0 && B_disp <= 0 && C_disp <= 0 && !(A_disp === 0 && B_disp === 0 && C_disp === 0) ) {
        A_disp = -A_disp;
        B_disp = -B_disp;
        C_disp = -C_disp;
        ineq_sign = "≥";
    }

    let Ax_str = "";
    if (A_disp === 1) Ax_str = "x";
    else if (A_disp === -1) Ax_str = "-x";
    else if (A_disp !== 0) Ax_str = `${A_disp}x`;

    let By_str = "";
    if (B_disp !== 0) {
        const B_abs_val = Math.abs(B_disp);
        const B_term_val = B_abs_val === 1 ? "y" : `${B_abs_val}y`;

        if (A_disp === 0) {
            By_str = B_disp < 0 ? `-${B_term_val}` : B_term_val;
        } else {
            By_str = B_disp < 0 ? ` - ${B_term_val}` : ` + ${B_term_val}`;
        }
    }
    
    // Handle cases like 0x + 0y <= C
    if (Ax_str === "" && By_str === "") {
        return `0 ${ineq_sign} ${C_disp}`;
    }

    return `${Ax_str}${By_str} ${ineq_sign} ${C_disp}`.trim();
}

function polytope_points(lines: string | any[], tol = 1e-6) {
    const poly_vertices = [];
    const n = lines.length;

    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            const [A1, B1, C1] = lines[i];
            const [A2, B2, C2] = lines[j];
            const det = A1 * B2 - A2 * B1;

            if (Math.abs(det) < tol) continue;

            const x = (C1 * B2 - C2 * B1) / det;
            const y = (A1 * C2 - A2 * C1) / det;

            let all_lines_satisfied = true;
            for (const line of lines) {
                const [A, B, C] = line;
                if (A * x + B * y > C + tol) {
                    all_lines_satisfied = false;
                    break;
                }
            }

            if (all_lines_satisfied) {
                poly_vertices.push([parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))]);
            }
        }
    }

    return poly_vertices;
}

function polytope_edges(points: string | any[], tol = 1e-6) {
    // Walk the points and form lines between them.
    // NOTE: This function is written as if the `points` always represent a closed polygon.
    //       While the user is still drawing, the frontend will not display the last line.
    const inequalities: string[] = [];
    const lines: number[][] = [];
    const n = points.length;
    if (n < 2) return { inequalities, lines }; 

    const interior = centroid(points);

    for (let i = 0; i < n; i++) {
        const p1 = points[i];
        const p2 = points[i === n - 1 ? 0 : i + 1];

        const A = p2[1] - p1[1];
        const B = -(p2[0] - p1[0]);
        const C_original = A * p1[0] + B * p1[1]; // Used for formatting

        const normAB = Math.sqrt(A * A + B * B);
        if (normAB < tol) continue;

        let Anorm = A / normAB;
        let Bnorm = B / normAB;
        let Cnorm = Anorm * p1[0] + Bnorm * p1[1]; // C for the normalized equation Ax + By = C

        // Orient the inequality Ax + By <= C such that the interior point satisfies it
        if (Anorm * interior[0] + Bnorm * interior[1] > Cnorm + tol) { // Add tol for robustness
            Anorm = -Anorm;
            Bnorm = -Bnorm;
            Cnorm = -Cnorm;
        }

        inequalities.push(polytope_format(A, B, C_original)); // Format with original A,B,C for integer representation if possible
        lines.push([Anorm, Bnorm, Cnorm]);
    }

    return { inequalities, lines };
}

export function polytope(points: string | any[]) {
    // Constructs the polytope representation from a set of points in 2D.
    if (points.length > 256) { // 2^8 = 256
        throw new Error("points.length > 256 not allowed");
    }

    const { inequalities, lines } = polytope_edges(points);
    const vertices = polytope_points(lines);

    return {
        "inequalities": inequalities,
        "vertices": vertices,
        "lines": lines
    };
} 