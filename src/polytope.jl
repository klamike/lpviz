function polytope(points::Vector{Vector{Float64}})
    # Constructs the polytope representation from a set of points in 2D.
    length(points) > 2 || error("At least three points are required to form a polytope")
    length(points) > 2^8 && error("length(points) > 2^8 not allowed")

    inequalities, lines = polytope_edges(points)
    vertices = polytope_points(lines)
    return Dict{String, Vector}("inequalities" => inequalities, "vertices" => vertices, "lines" => lines)
end


function polytope_edges(points::Vector{Vector{Float64}}; tol=1e-6)
    # Walk the points and form lines between them.
    # NOTE: This function is written as if the `points` always represent a closed polygon.
    #       While the user is still drawing, the frontend will not display the last line.
    inequalities = String[]
    lines = Vector{Vector{Float64}}()
    n = length(points)

    interior = centroid(points)

    for i in 1:n
        p1, p2 = points[i], points[i == n ? 1 : i+1]

        A, B = p2[2] - p1[2], -(p2[1] - p1[1])
        C = A * p1[1] + B * p1[2]

        normAB = sqrt(A^2 + B^2)
        normAB < tol && continue

        Anorm = A / normAB
        Bnorm = B / normAB  
        Cnorm = Anorm * p1[1] + Bnorm * p1[2]

        if Anorm * interior[1] + Bnorm * interior[2] > Cnorm
            Anorm, Bnorm, Cnorm = -Anorm, -Bnorm, -Cnorm
        end

        push!(inequalities, polytope_format(A, B, C))
        push!(lines, [Anorm, Bnorm, Cnorm])
    end

    return inequalities, lines
end

function polytope_points(lines::Vector{Vector{Float64}}; tol=1e-6)
    poly_vertices = Vector{Vector{Float64}}()
    n = length(lines)

    for i in 1:(n-1), j in i+1:n
        (A1, B1, C1) = lines[i]
        (A2, B2, C2) = lines[j]
        det = A1 * B2 - A2 * B1
        abs(det) < tol && continue

        x, y = (C1 * B2 - C2 * B1) / det, (A1 * C2 - A2 * C1) / det

        all(A * x + B * y ≤ C + tol for (A, B, C) in lines) &&
            push!(poly_vertices, [round(x, digits=2), round(y, digits=2)])
    end

    return poly_vertices
end

function polytope_format(A::Float64, B::Float64, C::Float64)
    # Rounding
    A_disp, B_disp, C_disp = polytope_format(A), polytope_format(B), polytope_format(C)
    
    ineq_sign = "≤"
    # Flip sign if A, B, and C are all negative (or zero)
    if A_disp ≤ 0 && B_disp ≤ 0 && C_disp ≤ 0
        A_disp, B_disp, C_disp = -A_disp, -B_disp, -C_disp
        ineq_sign = "≥"
    end

    # Tight formatting for some special cases
    Ax_str = if A_disp == 0  # 0 * x -> ""
        ""
    elseif A_disp == 1  # 1 * x -> "x"
        "x"
    elseif A_disp == -1  # -1 * x -> "-x"
        "-x"
    else
        "$(A_disp)x"  # A * x -> "Ax"
    end

    By_str = if B_disp == 0  # 0 * y -> ""
        ""
    elseif B_disp == 1  # 1 * y -> "y"
        "y"
    else
        # Some additional complexity here to look nice in the 0 * x -> "" case
        space = A_disp == 0 ? "" : " "  # "± By" -> "±By"
        plus = A_disp == 0 ? "" : "+"  # "+By" -> "By"
        (B_disp < 0 ? "-$space$(abs(B_disp))" : "$plus$space$(B_disp)") * "y"
    end

    return "$Ax_str $By_str $ineq_sign $C_disp"
end

polytope_format(x::Float64) = x == floor(x) ? Int(x) : round(x, digits=3)

lines_to_Ab(lines::Vector{Vector{Float64}}) = begin
    m = length(lines)
    A = zeros(m, 2)
    b = zeros(m)
    for i in 1:m
        A[i, 1] = lines[i][1]
        A[i, 2] = lines[i][2]
        b[i] = lines[i][3]
    end
    
    A, b
end

centroid(vertices) = begin # compute centroid of vertices
    n = length(vertices)
    n > 0 || error("No intersections found")

    [sum(p[1] for p in vertices) / n, sum(p[2] for p in vertices) / n]
end