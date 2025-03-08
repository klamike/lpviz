using JuMP
using Clarabel

function central_path(lines::Vector{Vector{Float64}}, objective::Vector{Float64}; niter=nothing, weights=nothing, verbose=false)
    
    lines, weights = central_path_filter(lines, weights)
    m = length(lines)
    
    A, b = lines_to_Ab(lines)
    
    x⁰ = central_path_x⁰(lines)
    µ = central_path_μ(niter)
    w = central_path_w(weights, m)

    central_path = []
    logs = []
    log = @sprintf "  %4s %6s %6s  %8s  %7s  \n" "Iter" "x" "y" "PObj" "µ"
    verbose && print(log)
    push!(logs, log)

    tsolve = @elapsed for µₖ in µ
        xₖ = central_path_xₖ(A, b, objective, w, µₖ, x⁰)
        if !isnothing(xₖ)
            push!(central_path, xₖ)
            log = @sprintf "  %-4d %+6.2f %+6.2f  %+.1e  %.1e  \n" length(central_path) xₖ[1] xₖ[2] dot(objective, xₖ) µₖ
            verbose && print(log)
            push!(logs, log)
        end
    end
    return Dict("central_path" => central_path, "logs" => logs, "tsolve" => tsolve)
end

function central_path_xₖ(A, b, c, w, µ, x⁰)
    # Solve the optimization problem for a given μ.
    #   max c'x + μ ∑ᵢ wᵢ ln(bᵢ - Aᵢx)
    # In order to use conic solvers, we reformulate the ln(⋅) using the exponential cone:
    #   max c'x + μ ∑ᵢ wᵢ tᵢ
    #   s.t. [tᵢ, 1, bᵢ - Aᵢx] ∈ 𝒦ₑ   ∀i ∈ [1, m]

    m = length(b)
    model = Model(Clarabel.Optimizer)
    set_silent(model)

    # Define variables
    @variable(model, x[1:2])  # primal variables
    @variable(model, t[1:m])  # auxiliary conic variables to model ln(b - Ax)

    # Set starting point
    # This is useful for very small feasible regions and shouldn't change the solution.
    set_start_value.(x, x⁰)
    set_start_value.(t, log.([b[i] - A[i, :]⋅x⁰ for i in 1:m]))

    # Add conic constraints
    @constraint(model, [i ∈ 1:m], [t[i], 1, b[i] - A[i, :]⋅x] ∈ MOI.ExponentialCone())

    # Define objective
    @objective(model, Max, c'x + µ * w't)
    
    # Solve
    optimize!(model)
    stat = termination_status(model)
    is_solved_and_feasible(model, allow_almost=true) || error("μ = $mu failed with $stat")

    return value.(x)
end

central_path_filter(lines, weights) = begin
    length(lines) != length(weights) && error("Length of lines and weights must match")
    kept = [i for i in 1:length(lines) if weights[i] != 0]
    
    [lines[i] for i in kept], [weights[i] for i in kept]
end
central_path_x⁰(lines) = centroid(polytope_points(lines))
central_path_μ(n) = 10.0 .^ range(3, stop=-5, length=n)
central_path_w(w, m) = isnothing(w) ? ones(m) : w