function polytope_handler(req::HTTP.Request)
    data = req.body
    points = data["points"]
    interior = get(data, "interior", nothing)
    return compute_polytope(points, interior)
end

function compute_interior_point(points, interior)
    if interior === nothing
        n = length(points)
        if n > 0
            x_sum = sum(p[1] for p in points)
            y_sum = sum(p[2] for p in points)
            return [x_sum / n, y_sum / n]
        else
            error("No points provided to compute an interior point")
        end
    else
        return interior
    end
end

function process_coeff(x)
    if x == 0
        x1 = abs(x)
    else
        x1 = x
    end

    if x1 == floor(x1)
        return Int(x1)
    else
        return x1
    end
end

function compute_polygon_edges(points, interior; tol=1e-6)
    inequalities = String[]
    lines = []
    n = length(points)

    for i in 1:n
        p1 = points[i]
        p2 = points[i == n ? 1 : i+1]
        A = p2[2] - p1[2]
        B = -(p2[1] - p1[1])
        normAB = sqrt(A^2 + B^2)
        if normAB < tol
            continue
        end
        A_norm = A / normAB
        B_norm = B / normAB
        C = A_norm * p1[1] + B_norm * p1[2]
        if A_norm * interior[1] + B_norm * interior[2] > C
            A_norm, B_norm, C = -A_norm, -B_norm, -C
        end

        if abs(A_norm) >= abs(B_norm)
            x_line = (C - B_norm*interior[2]) / A_norm
            ineq_sign = interior[1] >= x_line ? "≥" : "≤"
            coeff_y = -B_norm / A_norm
            const_term = C / A_norm
            coeff_y_disp = round(coeff_y, digits=3) |> process_coeff
            const_disp = round(const_term, digits=3) |> process_coeff
            if abs(coeff_y_disp) < tol
                inequality_str = "x $ineq_sign $const_disp"
            else
                if coeff_y_disp < 0
                    inequality_str = "x $ineq_sign $const_disp - $(abs(coeff_y_disp))y"
                else
                    inequality_str = "x $ineq_sign $const_disp + $(coeff_y_disp)y"
                end
            end
            push!(inequalities, inequality_str)
        else
            y_line = (C - A_norm*interior[1]) / B_norm
            ineq_sign = interior[2] >= y_line ? "≥" : "≤"
            coeff_x = -A_norm / B_norm
            const_term = C / B_norm
            coeff_x_disp = round(coeff_x, digits=3) |> process_coeff
            const_disp = round(const_term, digits=3) |> process_coeff
            if abs(coeff_x_disp) < tol
                inequality_str = "y $ineq_sign $const_disp"
            else
                if coeff_x_disp < 0
                    inequality_str = "y $ineq_sign $const_disp - $(abs(coeff_x_disp))x"
                else
                    inequality_str = "y $ineq_sign $const_disp + $(coeff_x_disp)x"
                end
            end
            push!(inequalities, inequality_str)
        end

        push!(lines, [A_norm, B_norm, C])
    end

    return inequalities, lines
end


function compute_intersections(lines; tol=1e-6)
    poly_vertices = []
    n = length(lines)
    for i in 1:(n-1)
        for j in i+1:n
            (A1, B1, C1) = lines[i]
            (A2, B2, C2) = lines[j]
            det = A1 * B2 - A2 * B1
            if abs(det) < tol
                continue
            end
            x = (C1 * B2 - C2 * B1) / det
            y = (A1 * C2 - A2 * C1) / det
            satisfied = true
            for (A, B, C) in lines
                if A * x + B * y > C + tol
                    satisfied = false
                    break
                end
            end
            if satisfied
                push!(poly_vertices, [round(x, digits=2), round(y, digits=2)])
            end
        end
    end
    return poly_vertices
end

function compute_polytope(points, interior=nothing)
    interior = compute_interior_point(points, interior)
    inequalities, lines = compute_polygon_edges(points, interior)
    vertices = compute_intersections(lines)
    return Dict("inequalities" => inequalities, "vertices" => vertices, "lines" => lines)
end
