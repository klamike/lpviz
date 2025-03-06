using JuMP
using Clarabel

function central_path(lines::Vector{Vector{Float64}}, objective::Vector{Float64}; mu_values=nothing, weights=nothing)
    
    lines, weights = central_path_filter(lines, weights)
    m = length(lines)
    
    A, b = lines_to_Ab(lines)
    
    x⁰ = central_path_x⁰(lines)
    µ = central_path_μ(mu_values)
    w = central_path_w(weights, m)

    central_path = []
    for µₖ in µ
        xₖ = central_path_xₖ(A, b, objective, w, µₖ, x⁰)
        isnothing(xₖ) || push!(central_path, (xₖ, μₖ))
    end
    return Dict("central_path" => central_path)
end

function central_path_xₖ(A, b, c, w, µ, x⁰)
    # Solve the optimization problem for a given μ.
    #   max c'x + μ ∑ᵢ wᵢ ln(bᵢ - Aᵢx)
    # In order to use conic solvers, we reformulate the ln(⋅) using the exponential cone:
    #   max c'x + μ ∑ᵢ wᵢ tᵢ
    #   s.t. [tᵢ, 1, bᵢ - Aᵢx] ∈ 𝒦ₑ   ∀i ∈ [1, m]

    m = length(lines)
    model = Model(Clarabel.Optimizer)
    set_silent(model)

    # Define variables
    @variable(model, x[1:2])  # primal variables
    @variable(model, t[1:m])  # auxiliary conic variables to model ln(b - Ax)

    # Set starting point
    # This is useful for very small feasible regions and shouldn't change the solution.
    set_start_value.(x, x⁰)
    set_start_value.(t, log.([b[i] - A[i]'x⁰ for i in 1:m]))

    # Add conic constraints
    @constraint(model, [i ∈ 1:m], [t[i], 1, b[i] - A[i]'x] ∈ MOI.ExponentialCone())

    # Define objective
    @objective(model, Max, c'x + µ * w't)
    
    # Solve
    optimize!(model)
    stat = termination_status(model)
    is_solved_and_feasible(model, allow_almost=true) || error("μ = $mu failed with $stat")

    return value.(x)
end

function central_path_x⁰(lines)
    # compute centroid of intersections
    intersections = polytope_points(lines)
    n = length(intersections)
    n > 0 || error("No intersections found")
    return [sum(p[1] for p in intersections) / n, sum(p[2] for p in intersections) / n]
end

central_path_μ(µ) = isnothing(µ) ? [10.0^p for p in [3, 2, 1.5, 1, 0.5, 0, -0.5, -1, -3, -5]] : µ
central_path_w(w, m) = isnothing(w) ? ones(m) : w

function central_path_filter(lines, weights)
    if length(lines) != length(weights)
        error("Length of lines and weights must be the same")
    end
    nonzero_indices = [i for i in 1:length(lines) if weights[i] != 0]
    filtered_lines = [lines[i] for i in nonzero_indices]
    filtered_weights = [weights[i] for i in nonzero_indices]
    return filtered_lines, filtered_weights
end