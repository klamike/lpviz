using JuMP
using Clarabel

function central_path(lines::Vector{Vector{Float64}}, objective::Vector{Float64}; mu_values=nothing, weights=nothing)
    mu_values = default_mu_values(mu_values)
    weights = default_weights(weights, length(lines))
    
    lines, weights = filter_lines_and_weights(lines, weights)
    m = length(lines)
    if m == 0
        return error("No lines left after filtering for zero weights")
    end

    central_path = []
    for mu in mu_values
        x_val = solve_for_mu(lines, objective, weights, mu)
        if x_val !== nothing
            push!(central_path, (x_val, mu))
        end
    end
    return Dict("central_path" => central_path)
end

function solve_for_mu(lines, objective, weights, mu)
    # Solve the optimization problem for a given μ.
    #   max c'x + μ ∑ᵢ wᵢ ln(bᵢ - Aᵢx)
    # In order to use conic solvers, we reformulate the ln(⋅) using the exponential cone:
    #   max c'x + μ ∑ᵢ wᵢ tᵢ
    #   s.t. [tᵢ, 1, bᵢ - Aᵢx] ∈ Kexp   ∀i ∈ [1, m]

    m = length(lines)
    model = Model(Clarabel.Optimizer)
    set_silent(model)

    # Define variables
    @variable(model, x[1:2])  # primal variables
    @variable(model, t[1:m])  # auxiliary conic variables to model ln(b - Ax)

    # Set starting point
    # This is useful for very small feasible regions and shouldn't change the solution.
    x₀ = starting_point(lines)
    set_start_value.(x, x₀)
    set_start_value.(t, log.([lines[i][3] - lines[i][1] * x₀[1] - lines[i][2] * x₀[2] for i in 1:m]))

    # Add conic constraints
    for i in 1:m
        A, B, C = lines[i]
        @constraint(model, [t[i], 1, C - (A * x[1] + B * x[2])] in MOI.ExponentialCone())
    end

    # Define objective
    @objective(model, Max,
        sum(objective[i] * x[i] for i in 1:2) +
        mu * sum(weights[i] * t[i] for i in 1:m)
    )
    
    # Solve
    optimize!(model)
    stat = termination_status(model)
    if is_solved_and_feasible(model, allow_almost=true)
        return value.(x)
    else
        error("Central path point μ = $mu failed with status $stat")
    end
end

function starting_point(lines)
    # compute centroid of intersections
    intersections = compute_intersections(lines)
    n = length(intersections)
    n > 0 || error("No intersections found")
    return [sum(p[1] for p in intersections) / n, sum(p[2] for p in intersections) / n]
end

function default_mu_values(mu_values)
    if mu_values === nothing
        return [10.0^p for p in [3, 2, 1.5, 1, 0.5, 0, -0.5, -1, -3, -5]]
    else
        return mu_values
    end
end

function default_weights(weights, num_lines)
    if weights === nothing
        return ones(num_lines)
    else
        return weights
    end
end

function filter_lines_and_weights(lines, weights)
    if length(lines) != length(weights)
        # error("Length of lines and weights must be the same")
        return [], nothing
    end
    nonzero_indices = [i for i in 1:length(lines) if weights[i] != 0]
    filtered_lines = [lines[i] for i in nonzero_indices]
    filtered_weights = [weights[i] for i in nonzero_indices]
    return filtered_lines, filtered_weights
end