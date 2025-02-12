module LPViz

using HTTP
using JuMP
using Clarabel


function trace_central_path(req::HTTP.Request)
    data = req.body
    lines = data["lines"]
    objective = data["objective"]
    mu_values = haskey(data, "mu_values") ? data["mu_values"] : [10.0^p for p in [3, 2, 1.5, 1, 0.5, 0, -0.5, -1, -3, -5]]
    
    # Get weights if provided; otherwise, use ones.
    weights = haskey(data, "weights") ? data["weights"] : ones(length(lines))
    
    # Pre-filter: only keep lines (and weights) with nonzero weight.
    nonzero_indices = [i for i in 1:length(lines) if weights[i] != 0]
    lines = [lines[i] for i in nonzero_indices]
    weights = [weights[i] for i in nonzero_indices]
    
    m = length(lines)
    if m == 0
        return Dict("error" => "No lines provided after filtering zero weights")
    end

    central_path = []
    for mu in mu_values
        model = Model(Clarabel.Optimizer)
        @variable(model, x[1:2])
        @variable(model, s[1:m] ≥ 0)
        @variable(model, t[1:m])
        for i in 1:m
            A = lines[i][1]
            B = lines[i][2]
            C = lines[i][3]
            @constraint(model, s[i] == C - (A * x[1] + B * x[2]))
            @constraint(model, [t[i], 1, s[i]] in MOI.ExponentialCone())
        end
        @objective(model, Max, sum(objective[i] * x[i] for i in 1:2) + mu * sum(weights[i] * t[i] for i in 1:m))
        optimize!(model)
        stat = termination_status(model)
        if !(stat in [MOI.OPTIMAL, MOI.LOCALLY_SOLVED])
            println("Optimization did not solve optimally for mu = $mu")
        else
            push!(central_path, (value.(x), mu))
        end
    end
    return Dict("central_path" => central_path)
end


function polytope(req::HTTP.Request)
    data = req.body
    points = data["points"]
    interior = data["interior"]
    n = length(points)
    inequalities = String[]
    lines = []
    tol = 1e-6

    if interior === nothing
        # Compute an interior point by averaging the given points
        if n > 0
            x_sum = sum(p[1] for p in points)
            y_sum = sum(p[2] for p in points)
            interior = [x_sum / n, y_sum / n]
        else
            return Dict("error" => "No points provided to compute an interior point")
        end
    end

    for i in 1:n
        p1 = points[i]
        p2 = points[i == n ? 1 : i+1]  # wrap-around
        A = p2[2] - p1[2]
        B = -(p2[1] - p1[1])
        normAB = sqrt(A^2 + B^2)
        if normAB < tol
            continue  # FIXME
        end
        A_norm = A / normAB
        B_norm = B / normAB
        C = A_norm * p1[1] + B_norm * p1[2]
        if A_norm * interior[1] + B_norm * interior[2] > C
            A_norm, B_norm, C = -A_norm, -B_norm, -C
        end
        A_disp = round(A_norm, digits=2)
        B_disp = round(B_norm, digits=2)
        C_disp = round(C, digits=2)
        if A_disp ≈ 0
            push!(inequalities, string(B_disp, "y ≤ ", C_disp))
        elseif B_disp ≈ 0
            push!(inequalities, string(A_disp, "x ≤ ", C_disp))
        else
            push!(inequalities, string(A_disp, "x + ", B_disp, "y ≤ ", C_disp))
        end
        push!(lines, [A_norm, B_norm, C])
    end

    # Compute intersection vertices.
    # FIXME: this is extra since given points.
    poly_vertices = []
    for i in 1:length(lines)-1
        for j in i+1:length(lines)
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

    return Dict("inequalities" => inequalities, "vertices" => poly_vertices, "lines" => lines)
end

end # module